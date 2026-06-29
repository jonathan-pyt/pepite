import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { analysisSchema, type AnalysisResult, type Enrichments, type Listing, type QuickAnalysis } from "../types";
import { buildAnalysisPrompt, SYSTEM_PROMPT } from "./prompts";
import { createModel, type LlmConfig } from "./provider";

export interface AnalyzeInput {
  listing: Listing;
  quick: QuickAnalysis;
  enrichments?: Enrichments;
  /** Profil de recherche persistant de l'acheteur (texte libre, réglages). */
  searchProfile?: string;
}

function buildJsonPrompt(input: AnalyzeInput): string {
  return `${buildAnalysisPrompt(input.listing, input.quick, input.enrichments, undefined, input.searchProfile)}

Réponds uniquement avec un objet JSON valide, sans Markdown ni texte autour.
L'objet JSON doit contenir exactement ces clés :
- synthese: string
- recommandation: string
- pointsVigilance: array d'objets { "titre": string, "detail": string, "niveau": "info" | "attention" | "critique" }
- negociation: objet { "cibleBasse": number, "cibleHaute": number, "arguments": string[] }
- profils: objet { "residence": string, "locatif-nu": string, "airbnb": string, "coloc": string }
- checklistVisite: string[]

N'ajoute aucun titre Markdown, aucun tableau Markdown et aucun commentaire hors JSON.`;
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("analysis: sortie JSON introuvable");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function analyzeListing(
  input: AnalyzeInput,
  cfg: LlmConfig,
  modelOverride?: LanguageModel,
): Promise<AnalysisResult> {
  const model = modelOverride ?? createModel(cfg);
  if (cfg.provider === "openai" && cfg.baseURL?.trim()) {
    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: buildJsonPrompt(input),
    });
    return analysisSchema.parse(parseJsonObject(text));
  }

  const { output } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildAnalysisPrompt(input.listing, input.quick, input.enrichments, undefined, input.searchProfile),
    output: Output.object({ schema: analysisSchema }),
  });
  return output;
}
