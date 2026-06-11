import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import type { AnalysisResult, Enrichments, Listing, QuickAnalysis } from "../types";
import { createModel, type LlmConfig } from "./provider";

const CORPS_DESCRIBE =
  "Corps du mail COMPLET et prêt à envoyer, en français : formule d'appel, paragraphes, formule de politesse, signé « [Votre nom] ». AUCUNE mise en forme markdown (pas de **, de listes à puces ni de titres).";

export const negotiationEmailsSchema = z.object({
  assertif: z
    .object({
      objet: z.string().describe("Objet du mail, ton assertif — direct et chiffré (ex. « Offre d'achat — … »)"),
      corps: z.string().describe(CORPS_DESCRIBE),
    })
    .describe("Variante assertive : ferme sur les chiffres et le montant proposé, mais toujours courtoise"),
  modere: z
    .object({
      objet: z.string().describe("Objet du mail, ton modéré — factuel et équilibré"),
      corps: z.string().describe(CORPS_DESCRIBE),
    })
    .describe("Variante modérée : équilibrée, argumente sans pression, laisse de la place à la contre-proposition"),
  aimable: z
    .object({
      objet: z.string().describe("Objet du mail, ton aimable — chaleureux, met en avant l'intérêt pour le bien"),
      corps: z.string().describe(CORPS_DESCRIBE),
    })
    .describe("Variante aimable : chaleureuse, souligne les qualités du bien et ouvre le dialogue"),
});
export type NegotiationEmails = z.infer<typeof negotiationEmailsSchema>;

export const NEGOTIATION_SYSTEM_PROMPT = `Tu es un négociateur immobilier expérimenté qui aide un acheteur particulier à formuler une offre par écrit.
Tu rédiges des mails réalistes et respectueux, ancrés uniquement dans les données fournies :
tu n'inventes JAMAIS un défaut, un chiffre ou un fait absent des données.
Tu réponds en français.`;

export interface NegotiationPromptInput {
  listing: Listing;
  quick: QuickAnalysis;
  analysis: Pick<AnalysisResult, "negociation" | "pointsVigilance">;
  enrichments?: Enrichments;
}

export function buildNegotiationPrompt(input: NegotiationPromptInput, now: Date = new Date()): string {
  const { listing, quick, analysis, enrichments } = input;
  const market = quick.market;

  const dateStr = now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const dispersionLine =
    market?.p25PricePerM2 !== undefined && market?.p75PricePerM2 !== undefined
      ? `\n- Dispersion du secteur : P25 ${market.p25PricePerM2} €/m² · P75 ${market.p75PricePerM2} €/m²`
      : "";

  const marketBlock = market
    ? `- Prix demandé : ${quick.listingPricePerM2 ?? "?"} €/m²
- Médiane du secteur : ${market.medianPricePerM2} €/m² (${market.sampleSize} ventes DVF, confiance ${market.confidence})
- Écart vs médiane : ${quick.marketGapPct! >= 0 ? "+" : ""}${quick.marketGapPct!.toFixed(1)} %${dispersionLine}`
    : "- Données marché indisponibles : ne cite aucun chiffre de marché, appuie-toi uniquement sur les autres éléments fournis.";

  const nego = analysis.negociation;
  const argumentsBlock = nego.arguments.map((a) => `- ${a}`).join("\n");

  const vigilanceBlock =
    analysis.pointsVigilance.length > 0
      ? analysis.pointsVigilance.map((p) => `- ${p.titre} (${p.niveau}) : ${p.detail}`).join("\n")
      : "- aucun";

  const risksLine = enrichments?.risks
    ? [...enrichments.risks.naturels, ...enrichments.risks.technologiques]
        .map((r) => `${r.libelle} (${r.statut})`)
        .join(", ") || "aucun risque recensé"
    : "non renseignés";

  const rentLine = enrichments?.rent
    ? `${enrichments.rent.loyerM2} €/m² CC (médiane prédite${enrichments.rent.fiable ? "" : ", extrapolée — prudence"})`
    : "non renseigné";

  return `Nous sommes le ${dateStr}.

Rédige TROIS mails de négociation (tons : assertif, modéré, aimable) qu'un acheteur particulier enverra au vendeur ou à son agent immobilier après avoir étudié ce bien.

## Annonce
- Titre : ${listing.title}
- Prix demandé : ${listing.price.toLocaleString("fr-FR")} €
- Surface : ${listing.surface ?? "inconnue"} m² · Type : ${listing.propertyType ?? "?"}
- DPE : ${listing.dpe ?? "non renseigné"}
- Publiée le : ${listing.publishedAt ?? "date inconnue"}

## Marché local (transactions notariées DVF)
${marketBlock}

## Analyse de négociation déjà réalisée (source de vérité — ne pas recalculer)
- Fourchette cible : ${nego.cibleBasse.toLocaleString("fr-FR")} € (cible basse) à ${nego.cibleHaute.toLocaleString("fr-FR")} € (cible haute)
- Arguments calculés par l'analyse (les seuls à utiliser) :
${argumentsBlock}

## Points de vigilance identifiés
${vigilanceBlock}

## Contexte complémentaire
- Risques recensés sur la commune : ${risksLine}
- Loyer médian du secteur : ${rentLine}

## Règles d'or (à respecter dans les trois mails)
- Ton réaliste et respectueux : un mail de négociation crédible, jamais agressif ni méprisant.
- Ne JAMAIS parler de « forte surcote » sur la seule base de l'écart à la médiane : la médiane n'est qu'un repère, pas un verdict.
- Toute décote demandée doit être justifiée par des éléments concrets fournis ci-dessus (DPE, travaux, point de vigilance, données marché) — aucune décote arbitraire.
- En France, les marges de négociation normales sont de 2 à 5 % : rester dans cet ordre de grandeur sauf arguments objectifs forts déjà présents dans l'analyse.
- Le montant proposé doit viser la fourchette cible de l'analyse (entre cible basse et cible haute) — ne pas proposer en dessous de la cible basse.
- Mentionner que l'acheteur est sérieux et finançable (financement validé ou en cours de validation), gage de crédibilité.
- INTERDICTION ABSOLUE d'inventer un défaut, un chiffre, une visite ou un fait non présent dans les données fournies.

## Différenciation des trois tons
- assertif : ferme sur les chiffres et le montant proposé, phrases directes, mais toujours courtois.
- modere : équilibré — argumente factuellement, propose un montant tout en se disant ouvert à la discussion.
- aimable : chaleureux — commence par l'intérêt sincère pour le bien, amène la proposition en douceur et ouvre le dialogue.

Chaque mail est complet et prêt à envoyer : objet distinct, corps signé « [Votre nom] », sans aucune mise en forme markdown.`;
}

export interface GenerateNegotiationEmailsInput extends NegotiationPromptInput {
  settings: LlmConfig;
  now?: Date;
}

/**
 * Génère en un seul appel LLM les trois variantes de mail de négociation
 * (assertif / modéré / aimable), ancrées dans les données du rapport.
 */
export async function generateNegotiationEmails(
  input: GenerateNegotiationEmailsInput,
  modelOverride?: LanguageModel,
): Promise<NegotiationEmails> {
  const model = modelOverride ?? createModel(input.settings);
  const { output } = await generateText({
    model,
    system: NEGOTIATION_SYSTEM_PROMPT,
    prompt: buildNegotiationPrompt(input, input.now),
    output: Output.object({ schema: negotiationEmailsSchema }),
  });
  return output;
}
