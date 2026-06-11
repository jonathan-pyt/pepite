import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import type { Listing } from "../types";
import { createModel, type LlmConfig } from "../analysis/provider";

export const restyleCostSchema = z.object({
  postes: z
    .array(
      z.object({
        label: z.string().describe("Poste de travaux, ex. « Peinture murs + plafond »"),
        montant: z.number().describe("Montant estimé du poste, en euros TTC"),
      }),
    )
    .describe("3 à 6 postes de travaux chiffrés pour la pièce"),
  totalMin: z.number().describe("Bas de la fourchette totale, en euros TTC"),
  totalMax: z.number().describe("Haut de la fourchette totale, en euros TTC"),
  commentaire: z
    .string()
    .describe(
      "1 à 2 phrases : rappeler que la fourchette est indicative pour cette pièce et qu'elle peut servir d'argument de négociation",
    ),
});
export type RestyleCost = z.infer<typeof restyleCostSchema>;

export interface EstimateRestyleCostInput {
  listing: Listing;
  styleLabel: string;
  roomHint?: string;
  settings: LlmConfig;
}

export const RESTYLE_COST_SYSTEM = `Tu es un économiste de la construction spécialisé dans la rénovation résidentielle en France.
Tu chiffres des travaux de redécoration de façon PRUDENTE et réaliste (prix France 2026, TTC, fourniture + pose).
Tu réponds uniquement avec l'objet JSON demandé, montants en euros.`;

export function buildRestyleCostPrompt(input: Omit<EstimateRestyleCostInput, "settings">): string {
  const { listing, styleLabel, roomHint } = input;
  const lines = [
    `- Type de bien : ${listing.propertyType ?? "non précisé"}`,
    `- Annonce : ${listing.title}`,
    `- Surface totale : ${listing.surface ? `${listing.surface} m²` : "non précisée"}`,
    `- Pièces : ${listing.rooms ?? "non précisé"}`,
    `- DPE : ${listing.dpe ?? "non renseigné"}`,
    `- Localisation : ${listing.location.rawAddress}`,
  ];
  const piece = roomHint ? `de la pièce suivante : ${roomHint}` : "d'une pièce de vie";
  return `Un acheteur envisage la redécoration complète ${piece} de ce bien dans le style « ${styleLabel} ».

Bien concerné :
${lines.join("\n")}

Estime le coût des travaux de décoration et rénovation légère pour CETTE pièce uniquement :
peinture/revêtements muraux, sol, mobilier et luminaires, main d'œuvre diverse.
Reste prudent : fourchette indicative (totalMin / totalMax en euros), pas de promesse.
Détaille 3 à 6 postes chiffrés cohérents avec la surface probable de la pièce.
Le commentaire doit présenter cette fourchette comme un argument de négociation utilisable, sans excès.`;
}

/**
 * Estime le coût des travaux du restyle (fourchette indicative pour la pièce),
 * via le provider texte actif de l'utilisateur.
 */
export async function estimateRestyleCost(
  input: EstimateRestyleCostInput,
  modelOverride?: LanguageModel,
): Promise<RestyleCost> {
  const model = modelOverride ?? createModel(input.settings);
  const { output } = await generateText({
    model,
    system: RESTYLE_COST_SYSTEM,
    prompt: buildRestyleCostPrompt(input),
    output: Output.object({ schema: restyleCostSchema }),
  });
  return output;
}
