import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type LlmProviderId = "google" | "anthropic" | "openai";

export interface LlmConfig {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
  baseURL?: string;
}

export const DEFAULT_MODELS: Record<LlmProviderId, string> = {
  google: "gemini-2.5-flash",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5-mini",
};

export function createModel(cfg: LlmConfig): LanguageModel {
  switch (cfg.provider) {
    case "google":
      return createGoogleGenerativeAI({ apiKey: cfg.apiKey })(cfg.model);
    case "anthropic":
      // header requis pour les appels depuis un contexte navigateur/extension (vérifié 2026-06-10, vercel/ai#3041)
      return createAnthropic({
        apiKey: cfg.apiKey,
        headers: { "anthropic-dangerous-direct-browser-access": "true" },
      })(cfg.model);
    case "openai":
      return createOpenAI({
        apiKey: cfg.apiKey,
        ...(cfg.baseURL?.trim() ? { baseURL: cfg.baseURL.trim() } : {}),
      })(cfg.model);
  }
}
