import { describe, expect, it } from "vitest";
import { endpointOriginPattern, llmOriginPattern } from "./host-permissions";

describe("endpointOriginPattern", () => {
  it("dérive le pattern de l'origine, port ignoré (les match patterns n'en ont pas)", () => {
    expect(endpointOriginPattern("http://localhost:11434/v1")).toBe("http://localhost/*");
    expect(endpointOriginPattern("https://ollama.com/v1")).toBe("https://ollama.com/*");
    expect(endpointOriginPattern("  https://ollama.com/v1  ")).toBe("https://ollama.com/*");
  });

  it("rejette les URLs invalides ou non http(s)", () => {
    expect(endpointOriginPattern("pas-une-url")).toBeNull();
    expect(endpointOriginPattern("ftp://serveur/v1")).toBeNull();
    expect(endpointOriginPattern("")).toBeNull();
  });
});

describe("llmOriginPattern", () => {
  it("openai avec baseURL : l'origine de l'endpoint prime sur l'API officielle", () => {
    expect(llmOriginPattern({ provider: "openai", baseURL: "http://localhost:11434/v1" })).toBe(
      "http://localhost/*",
    );
  });

  it("sans baseURL : l'origine officielle du fournisseur", () => {
    expect(llmOriginPattern({ provider: "google" })).toBe("https://generativelanguage.googleapis.com/*");
    expect(llmOriginPattern({ provider: "anthropic" })).toBe("https://api.anthropic.com/*");
    expect(llmOriginPattern({ provider: "openai", baseURL: "  " })).toBe("https://api.openai.com/*");
  });

  it("endpoint invalide : null (signalé « URL invalide » dans les réglages)", () => {
    expect(llmOriginPattern({ provider: "openai", baseURL: "pas-une-url" })).toBeNull();
  });
});
