import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { analyzeListing } from "./analyze";
import { buildAnalysisPrompt } from "./prompts";
import type { Listing, QuickAnalysis } from "../types";

const listing = {
  url: "https://www.leboncoin.fr/ad/ventes_immobilieres/1",
  site: "leboncoin",
  title: "Appartement T3 64 m²",
  price: 289_000,
  surface: 64,
  rooms: 3,
  propertyType: "Appartement",
  location: { rawAddress: "Nantes 44000", city: "Nantes", postalCode: "44000" },
  dpe: "C",
  description: "Bel appartement lumineux au 3e étage…",
  photos: [],
  extractedAt: "2026-06-10T00:00:00.000Z",
} as Listing;

const quick: QuickAnalysis = {
  listingPricePerM2: 4516,
  marketGapPct: -5.8,
  market: {
    medianPricePerM2: 4795,
    sampleSize: 42,
    radiusM: 500,
    confidence: "high",
    comparables: [],
  },
  score: 74,
  scoreLabel: "Bon",
};

const fakeAnalysis = {
  synthese: "Le bien est positionné 5,8 % sous la médiane du secteur…",
  recommandation: "Bien intéressant, négociable autour de 277 000 €.",
  pointsVigilance: [
    { titre: "DPE C", detail: "Facture estimée 85-113 €/mois", niveau: "info" },
  ],
  negociation: { cibleBasse: 272_000, cibleHaute: 280_000, arguments: ["Prix 5,8 % sous la médiane"] },
};

describe("analyzeListing", () => {
  it("parse la sortie structurée du modèle", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify(fakeAnalysis) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 100, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 200, text: undefined, reasoning: undefined },
        },
        warnings: [],
      }),
    });
    const result = await analyzeListing(
      { listing, quick, profile: "residence" },
      { provider: "google", apiKey: "test", model: "gemini-2.5-flash" },
      model,
    );
    expect(result.recommandation).toContain("277 000");
    expect(result.pointsVigilance[0]!.niveau).toBe("info");
    expect(result.negociation.cibleBasse).toBe(272_000);
  });
});

describe("buildAnalysisPrompt", () => {
  it("inclut les données clés et le profil", () => {
    const prompt = buildAnalysisPrompt(listing, quick, "airbnb");
    // Normalize whitespace (toLocaleString uses narrow no-break spaces U+202F on some locales)
    const normalized = prompt.replace(/ /g, " ");
    expect(normalized).toContain("courte durée");
    expect(normalized).toContain("289 000");
    expect(normalized).toContain("4795");
    expect(normalized).toContain("-5.8 % vs médiane");
  });

  it("omet la rubrique comparables quand il n'y en a aucun", () => {
    const prompt = buildAnalysisPrompt(listing, quick, "residence"); // quick a comparables: []
    expect(prompt).not.toContain("Ventes comparables");
    expect(prompt).toContain("Médiane du secteur");
  });

  it("signale l'absence de données DVF", () => {
    const prompt = buildAnalysisPrompt(listing, { ...quick, market: null, marketGapPct: null }, "residence");
    expect(prompt).toContain("Données DVF insuffisantes");
  });
});
