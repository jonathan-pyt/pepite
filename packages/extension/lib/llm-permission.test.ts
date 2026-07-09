import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { ensureLlmPermission, hasLlmPermission } from "./llm-permission";

// fake-browser n'implémente pas browser.permissions : on pose des stubs,
// remis à zéro entre chaque test.
const contains = vi.fn();
const request = vi.fn();

beforeEach(() => {
  fakeBrowser.reset();
  contains.mockReset();
  request.mockReset();
  (fakeBrowser as unknown as { permissions: unknown }).permissions = { contains, request };
});

describe("hasLlmPermission", () => {
  it("interroge l'origine du fournisseur configuré", async () => {
    contains.mockResolvedValue(true);
    await expect(hasLlmPermission({ provider: "google" })).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({ origins: ["https://generativelanguage.googleapis.com/*"] });
  });

  it("faux si l'endpoint est invalide (aucune origine à vérifier)", async () => {
    await expect(hasLlmPermission({ provider: "openai", baseURL: "pas-une-url" })).resolves.toBe(false);
    expect(contains).not.toHaveBeenCalled();
  });
});

describe("ensureLlmPermission", () => {
  it("ne redemande pas une origine déjà accordée", async () => {
    contains.mockResolvedValue(true);
    await expect(ensureLlmPermission({ provider: "anthropic" })).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("demande l'origine manquante et propage la décision de l'utilisateur", async () => {
    contains.mockResolvedValue(false);
    request.mockResolvedValue(true);
    await expect(
      ensureLlmPermission({ provider: "openai", baseURL: "https://ollama.com/v1" }),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ["https://ollama.com/*"] });
  });

  it("faux quand request lève (origine hors optional_host_permissions)", async () => {
    contains.mockResolvedValue(false);
    request.mockRejectedValue(new Error("Only permissions specified in the manifest may be requested."));
    await expect(
      ensureLlmPermission({ provider: "openai", baseURL: "https://openrouter.ai/v1" }),
    ).resolves.toBe(false);
  });
});
