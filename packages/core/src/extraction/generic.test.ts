import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { NoObjectGeneratedError } from "ai";
import { extractListingGeneric } from "./generic";
import type { LlmConfig } from "../analysis/provider";

const cfg: LlmConfig = { provider: "google", apiKey: "test", model: "gemini-2.5-flash" };

function mockReturning(obj: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(obj) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 100, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 200, text: undefined, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

const fullExtraction = {
  title: "Appartement T3 lumineux centre-ville",
  price: 289000,
  surface: 64,
  rooms: 3,
  propertyType: "Appartement",
  city: "Nantes",
  postalCode: "44000",
  district: "Centre-ville",
  dpe: "C",
  ges: "D",
  description: "Bel appartement de 64 m² au cœur de Nantes.",
  publishedAt: "2026-05-01",
  attributes: [
    { label: "Étage", value: "3" },
    { label: "Ascenseur", value: "Oui" },
  ],
};

describe("extractListingGeneric", () => {
  const url = "https://www.seloger.com/annonces/achat/appartement/nantes-44/123.htm";

  it("mappe une extraction complète vers un Listing normalisé", async () => {
    const listing = await extractListingGeneric("texte de page", url, cfg, mockReturning(fullExtraction));
    expect(listing.url).toBe(url);
    expect(listing.site).toBe("seloger");
    expect(listing.title).toBe("Appartement T3 lumineux centre-ville");
    expect(listing.price).toBe(289000);
    expect(listing.surface).toBe(64);
    expect(listing.rooms).toBe(3);
    expect(listing.propertyType).toBe("Appartement");
    expect(listing.location.city).toBe("Nantes");
    expect(listing.location.postalCode).toBe("44000");
    expect(listing.location.district).toBe("Centre-ville");
    expect(listing.dpe).toBe("C");
    expect(listing.ges).toBe("D");
    expect(listing.description).toContain("Nantes");
    expect(listing.publishedAt).toBe("2026-05-01");
    expect(listing.photos).toEqual([]);
    expect(listing.attributes).toContainEqual({ label: "Étage", value: "3" });
    expect(listing.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("site = generic quand l'URL n'appartient à aucun site connu", async () => {
    const listing = await extractListingGeneric(
      "texte",
      "https://www.agence-immo-locale.fr/bien/42",
      cfg,
      mockReturning(fullExtraction),
    );
    expect(listing.site).toBe("generic");
  });

  it("champs manquants → undefined (nullables) sans planter", async () => {
    const minimal = {
      title: "Maison à vendre",
      price: 350000,
      surface: null,
      rooms: null,
      propertyType: null,
      city: "Lyon",
      postalCode: null,
      district: null,
      dpe: null,
      ges: null,
      description: "",
      publishedAt: null,
      attributes: [],
    };
    const listing = await extractListingGeneric("texte", url, cfg, mockReturning(minimal));
    expect(listing.title).toBe("Maison à vendre");
    expect(listing.price).toBe(350000);
    expect(listing.surface).toBeUndefined();
    expect(listing.rooms).toBeUndefined();
    expect(listing.propertyType).toBeUndefined();
    expect(listing.location.city).toBe("Lyon");
    expect(listing.location.postalCode).toBeUndefined();
    expect(listing.dpe).toBeUndefined();
    expect(listing.publishedAt).toBeUndefined();
    expect(listing.attributes).toBeUndefined();
  });

  it("construit rawAddress depuis city + postalCode + district", async () => {
    const listing = await extractListingGeneric("texte", url, cfg, mockReturning(fullExtraction));
    expect(listing.location.rawAddress).toBe("Nantes 44000 Centre-ville");
  });

  it("plafonne les attributes à 30", async () => {
    const many = {
      ...fullExtraction,
      attributes: Array.from({ length: 50 }, (_, i) => ({ label: `Carac ${i}`, value: String(i) })),
    };
    const listing = await extractListingGeneric("texte", url, cfg, mockReturning(many));
    expect(listing.attributes!.length).toBe(30);
  });

  it("ignore un DPE hors A-G", async () => {
    const listing = await extractListingGeneric(
      "texte",
      url,
      cfg,
      mockReturning({ ...fullExtraction, dpe: "Vierge", ges: "Z" }),
    );
    expect(listing.dpe).toBeUndefined();
    expect(listing.ges).toBeUndefined();
  });

  it("garbage non parsable → NoObjectGeneratedError propagée", async () => {
    const garbage = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: "ceci n'est pas du JSON valide {{{" }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 5, text: undefined, reasoning: undefined },
        },
        warnings: [],
      }),
    });
    await expect(extractListingGeneric("texte", url, cfg, garbage)).rejects.toBeInstanceOf(
      NoObjectGeneratedError,
    );
  });
});
