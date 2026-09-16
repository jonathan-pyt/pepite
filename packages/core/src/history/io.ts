import { z } from "zod";
import { analysisSchema, type Report } from "../types";
import { negotiationEmailsSchema } from "../analysis/negotiation";

// Sérialisation / validation de l'export-import de l'historique. Module pur :
// la glu DOM / IndexedDB vit côté extension. Seuls les `Report` sont concernés.

/**
 * Contrat de compatibilité du format de fichier (distinct d'`appVersion`, qui
 * n'est qu'une métadonnée de provenance). L'import rejette un fichier de version
 * supérieure.
 *
 * À incrémenter UNIQUEMENT sur un changement cassant : champ retiré/renommé,
 * type ou sens d'un champ modifié, structure de l'enveloppe ou clé de dédup
 * changée. Un champ optionnel ajouté ne casse rien (le défaut zod accepte les
 * clés inconnues) → pas de bump.
 *
 * Piège : tout type atteignable via `reportSchema` (`analysisSchema`,
 * `negotiationEmailsSchema`) fait partie du format — le modifier peut casser la
 * compat sans toucher ce fichier.
 *
 * Pas encore de migration : au premier passage à la v2, décider migrer vs
 * rejeter les anciens fichiers et brancher un `migrate()` avant validation.
 */
export const HISTORY_SCHEMA_VERSION = 1;

/** Enveloppe versionnée d'un export d'historique (format de fichier .json). */
export interface HistoryExport {
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  reports: Report[];
}

/** Erreur d'import portant un message français destiné à l'utilisateur. */
export class HistoryImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryImportError";
  }
}

// On valide `analysis`/`negotiationEmails` (vrais schémas) et les champs que la
// page Historique déréférence sans garde — sinon un import sous-formé planterait
// le rendu. Le défaut zod accepte les clés inconnues, ce qui suffit ici.
const listingShape = z.object({
  title: z.string(),
  price: z.number(),
  photos: z.array(z.string()),
  location: z.object({ rawAddress: z.string() }),
});

const quickShape = z.object({ score: z.number().nullable() });

const reportSchema = z.object({
  id: z.string(),
  listingUrl: z.string(),
  createdAt: z.string(),
  provider: z.string(),
  model: z.string(),
  analysis: analysisSchema,
  negotiationEmails: negotiationEmailsSchema.optional(),
  enrichments: z.unknown().optional(),
  globalScore: z.unknown().optional(),
  listing: listingShape,
  quick: quickShape,
});

const envelopeSchema = z.object({
  schemaVersion: z.number(),
  exportedAt: z.string(),
  appVersion: z.string(),
  reports: z.array(reportSchema),
});

/** Construit l'enveloppe d'export à partir des rapports (tous, toutes versions). */
export function buildExport(
  reports: Report[],
  meta: { appVersion: string; exportedAt?: string },
): HistoryExport {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    exportedAt: meta.exportedAt ?? new Date().toISOString(),
    appVersion: meta.appVersion,
    reports,
  };
}

// Lève `HistoryImportError` (message FR) pour tout JSON étranger, corrompu ou
// d'une version future, sans jamais corrompre le store. On renvoie les objets
// d'origine (pas la sortie zod qui élaguerait des clés) pour un round-trip fidèle.
export function parseImport(text: string): { reports: Report[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HistoryImportError("Fichier illisible : JSON invalide.");
  }

  // Accès null-safe : un JSON valide peut être null/tableau/scalaire.
  const schemaVersion =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).schemaVersion
      : undefined;
  if (typeof schemaVersion !== "number") {
    throw new HistoryImportError("Format non reconnu : ce fichier n'est pas un export Pépite.");
  }
  if (schemaVersion > HISTORY_SCHEMA_VERSION) {
    throw new HistoryImportError(
      "Ce fichier a été créé par une version plus récente de Pépite. Mets l'extension à jour pour l'importer.",
    );
  }

  if (!envelopeSchema.safeParse(parsed).success) {
    throw new HistoryImportError("Fichier d'historique invalide ou corrompu.");
  }

  return { reports: (parsed as { reports: Report[] }).reports };
}
