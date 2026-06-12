import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { buildNegotiationPrompt, generateNegotiationEmails } from "./negotiation";
import type { AnalysisResult, Enrichments, Listing, QuickAnalysis } from "../types";

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
  publishedAt: "2026-05-28",
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

const analysis: Pick<AnalysisResult, "negociation" | "pointsVigilance"> = {
  negociation: {
    cibleBasse: 272_000,
    cibleHaute: 280_000,
    arguments: ["Prix 5,8 % sous la médiane", "Copropriété de 1968 : travaux à anticiper"],
  },
  pointsVigilance: [
    { titre: "DPE C", detail: "Facture estimée 85-113 €/mois", niveau: "info" },
    { titre: "Copropriété 1968", detail: "Ravalement et colonnes à vérifier", niveau: "attention" },
  ],
};

const fakeEmails = {
  assertif: {
    objet: "Offre d'achat — Appartement T3 64 m²",
    corps: "Bonjour,\n\nNous vous adressons une offre ferme à 277 000 €.\n\nCordialement,\n[Votre nom]",
  },
  modere: {
    objet: "Proposition pour l'appartement T3 64 m²",
    corps: "Bonjour,\n\nNous vous proposons 277 000 €, ouverts à la discussion.\n\nCordialement,\n[Votre nom]",
  },
  aimable: {
    objet: "Visite du T3 — proposition",
    corps: "Bonjour,\n\nLe bien nous plaît beaucoup ; nous nous permettons de proposer 278 000 €.\n\nBien à vous,\n[Votre nom]",
  },
};

describe("generateNegotiationEmails", () => {
  it("parse la sortie structurée du modèle (3 variantes objet + corps)", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify(fakeEmails) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 100, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 200, text: undefined, reasoning: undefined },
        },
        warnings: [],
      }),
    });
    const result = await generateNegotiationEmails(
      { listing, quick, analysis, settings: { provider: "google", apiKey: "test", model: "gemini-2.5-flash" } },
      model,
    );
    expect(result.assertif.objet).toContain("Offre d'achat");
    expect(result.assertif.corps).toContain("277 000");
    expect(result.modere.corps).toContain("[Votre nom]");
    expect(result.aimable.objet).toBeTruthy();
    expect(result.aimable.corps).toContain("Bien à vous");
  });
});

describe("buildNegotiationPrompt", () => {
  it("inclut les données clés de l'annonce et du marché", () => {
    const prompt = buildNegotiationPrompt({ listing, quick, analysis });
    const normalized = prompt.replace(/\u202f/g, " ");
    expect(normalized).toContain("289 000");
    expect(normalized).toContain("4795");
    expect(normalized).toContain("-5.8 %");
    expect(prompt).toContain("DPE : C");
    expect(prompt).toContain("2026-05-28");
  });

  it("inclut la fourchette cible et les arguments de l'analyse (source de vérité)", () => {
    const prompt = buildNegotiationPrompt({ listing, quick, analysis });
    const normalized = prompt.replace(/\u202f/g, " ");
    expect(normalized).toContain("272 000");
    expect(normalized).toContain("280 000");
    expect(prompt).toContain("Prix 5,8 % sous la médiane");
    expect(prompt).toContain("source de vérité");
  });

  it("inclut les points de vigilance", () => {
    const prompt = buildNegotiationPrompt({ listing, quick, analysis });
    expect(prompt).toContain("DPE C");
    expect(prompt).toContain("Ravalement et colonnes à vérifier");
  });

  it("contient les règles d'or : marge 2-5 %, viser les cibles, interdiction d'inventer", () => {
    const prompt = buildNegotiationPrompt({ listing, quick, analysis });
    expect(prompt).toContain("2 à 5 %");
    expect(prompt).toContain("fourchette cible");
    expect(prompt).toContain("INTERDICTION ABSOLUE d'inventer");
    expect(prompt).toContain("forte surcote");
    expect(prompt).toContain("finançable");
  });

  it("différencie les trois tons assertif / modéré / aimable", () => {
    const prompt = buildNegotiationPrompt({ listing, quick, analysis });
    expect(prompt).toContain("assertif :");
    expect(prompt).toContain("modere :");
    expect(prompt).toContain("aimable :");
    expect(prompt).toContain("[Votre nom]");
  });

  it("inclut la date du jour dans le prompt", () => {
    const prompt = buildNegotiationPrompt({ listing, quick, analysis }, new Date("2026-06-10"));
    expect(prompt).toContain("10 juin 2026");
  });

  it("affiche la dispersion P25/P75 quand disponible", () => {
    const quickWithDispersion: QuickAnalysis = {
      ...quick,
      market: { ...quick.market!, p25PricePerM2: 4200, p75PricePerM2: 5400 },
    };
    const prompt = buildNegotiationPrompt({ listing, quick: quickWithDispersion, analysis });
    expect(prompt).toContain("Dispersion du secteur");
    expect(prompt).toContain("4200");
    expect(prompt).toContain("5400");
  });

  it("omet la dispersion quand p25/p75 absents", () => {
    const prompt = buildNegotiationPrompt({ listing, quick, analysis });
    expect(prompt).not.toContain("Dispersion du secteur");
  });

  it("signale l'absence de données marché", () => {
    const prompt = buildNegotiationPrompt({
      listing,
      quick: { ...quick, market: null, marketGapPct: null },
      analysis,
    });
    expect(prompt).toContain("Données marché indisponibles");
    expect(prompt).not.toContain("Médiane du secteur");
  });

  it("inclut risques et loyer quand les enrichissements sont fournis", () => {
    const enrichments: Enrichments = {
      risks: {
        naturels: [{ libelle: "Inondation", statut: "Commune concernée" }],
        technologiques: [],
      },
      rent: { loyerM2: 12.5, loyerM2Bas: 10.8, loyerM2Haut: 14.2, fiable: true, nbAnnonces: 87 },
    };
    const prompt = buildNegotiationPrompt({ listing, quick, analysis, enrichments });
    expect(prompt).toContain("Inondation");
    expect(prompt).toContain("12.5");
  });

  it("signale risques et loyer non renseignés sans enrichissements", () => {
    const prompt = buildNegotiationPrompt({ listing, quick, analysis });
    expect(prompt).toContain("Risques recensés sur la commune : non renseignés");
    expect(prompt).toContain("Loyer médian du secteur : non renseigné");
  });

  // ── R5 : notes utilisateur (visite, agent) ────────────────────────────────

  it("inclut les notes utilisateur avec les règles d'attribution à l'acheteur", () => {
    const prompt = buildNegotiationPrompt({
      listing: {
        ...listing,
        userNotes: "Visite du 12/06 : traces d'humidité dans la chambre, l'agent confirme 180 €/mois de charges.",
      },
      quick,
      analysis,
    });
    expect(prompt).toContain("Informations complémentaires fournies par l'utilisateur");
    expect(prompt).toContain("traces d'humidité");
    expect(prompt).toContain("arguments de négociation légitimes");
    expect(prompt).toContain("lors de ma visite");
    expect(prompt).toContain("PRIORENT sur l'annonce");
    expect(prompt).toContain("déclaratifs (non vérifiés)");
  });

  it("pas de section notes quand userNotes absent ou vide", () => {
    expect(buildNegotiationPrompt({ listing, quick, analysis })).not.toContain(
      "Informations complémentaires",
    );
    expect(
      buildNegotiationPrompt({ listing: { ...listing, userNotes: "   " }, quick, analysis }),
    ).not.toContain("Informations complémentaires");
  });
});
