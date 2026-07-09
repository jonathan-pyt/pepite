import { describe, expect, it } from "vitest";
import { toLlmConfig, type Settings } from "./settings";

function settings(overrides: Partial<Settings>): Settings {
  return { provider: "google", apiKey: "", model: "gemini-2.5-flash", baseURL: "", searchProfile: "", ...overrides };
}

describe("toLlmConfig", () => {
  it("null sans clé ni endpoint (mode « Copier le prompt »)", () => {
    expect(toLlmConfig(settings({}))).toBeNull();
  });

  it("clé présente : config sans baseURL pour les fournisseurs officiels", () => {
    expect(toLlmConfig(settings({ apiKey: "k" }))).toEqual({
      provider: "google",
      apiKey: "k",
      model: "gemini-2.5-flash",
    });
  });

  it("openai + endpoint sans clé : clé factice — Ollama local l'ignore, createOpenAI en exige une", () => {
    const cfg = toLlmConfig(
      settings({ provider: "openai", model: "qwen3", baseURL: " http://localhost:11434/v1 " }),
    );
    expect(cfg).toEqual({
      provider: "openai",
      apiKey: "ollama",
      model: "qwen3",
      baseURL: "http://localhost:11434/v1",
    });
  });

  it("le baseURL ne fuit pas vers les autres fournisseurs", () => {
    const cfg = toLlmConfig(settings({ provider: "anthropic", apiKey: "k", baseURL: "https://ollama.com/v1" }));
    expect(cfg).not.toBeNull();
    expect(cfg).not.toHaveProperty("baseURL");
  });

  it("endpoint vide sans clé sur openai : null (pas de clé factice sans endpoint)", () => {
    expect(toLlmConfig(settings({ provider: "openai", baseURL: "  " }))).toBeNull();
  });
});
