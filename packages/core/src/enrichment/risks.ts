import type { RiskItem, RiskReport } from "../types";

const API_BASE = "https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque";

/** Known keys → French label */
const LIBELLE_MAP: Record<string, string> = {
  // Natural
  inondation: "Inondation",
  seisme: "Séisme",
  mouvementsDeTerrain: "Mouvements de terrain",
  retraitGonflementArgiles: "Retrait-gonflement des argiles",
  radon: "Radon",
  feuDeForet: "Feu de forêt",
  avalanche: "Avalanche",
  eruptionVolcanique: "Éruption volcanique",
  cyclone: "Cyclone",
  // Technological
  icpe: "ICPE",
  pollutionDesSols: "Pollution des sols",
  canalisation: "Canalisations de matières dangereuses",
  nucleaire: "Risque nucléaire",
  ruptureDeBarrage: "Rupture de barrage",
};

/** camelCase → readable label fallback for unknown keys */
function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

type RisqueEntry = { present: boolean; libelleStatutCommune: string };
type RisquesSection = Record<string, RisqueEntry>;

function extractPresent(section: RisquesSection | undefined): RiskItem[] {
  if (!section) return [];
  return Object.entries(section)
    .filter(([, v]) => v.present === true)
    .map(([key, v]) => ({
      libelle: LIBELLE_MAP[key] ?? humanizeKey(key),
      statut: v.libelleStatutCommune,
    }));
}

export interface FetchRisksOptions {
  fetchFn?: typeof fetch;
}

export async function fetchRisks(citycode: string, opts: FetchRisksOptions = {}): Promise<RiskReport> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${API_BASE}?code_insee=${encodeURIComponent(citycode)}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`risques Géorisques: HTTP ${res.status}`);
  const json = (await res.json()) as {
    risquesNaturels?: RisquesSection;
    risquesTechnologiques?: RisquesSection;
  };
  return {
    naturels: extractPresent(json.risquesNaturels),
    technologiques: extractPresent(json.risquesTechnologiques),
  };
}
