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
    case "openai": {
      const baseURL = cfg.baseURL?.trim();
      const openai = createOpenAI({ apiKey: cfg.apiKey, ...(baseURL ? { baseURL } : {}) });
      // Les endpoints OpenAI-compatible (Ollama, LM Studio…) n'exposent en général
      // que /v1/chat/completions ; le défaut du SDK (API Responses) ne vaut que
      // pour l'API OpenAI officielle.
      return baseURL ? openai.chat(cfg.model) : openai(cfg.model);
    }
  }
}
