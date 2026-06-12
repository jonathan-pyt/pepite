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

export async function analyzeListing(
  input: AnalyzeInput,
  cfg: LlmConfig,
  modelOverride?: LanguageModel,
): Promise<AnalysisResult> {
  const model = modelOverride ?? createModel(cfg);
  const { output } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildAnalysisPrompt(input.listing, input.quick, input.enrichments, undefined, input.searchProfile),
    output: Output.object({ schema: analysisSchema }),
  });
  return output;
}
