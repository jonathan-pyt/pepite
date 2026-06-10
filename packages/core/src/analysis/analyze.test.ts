import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { analyzeListing } from "./analyze";
import { buildAnalysisPrompt } from "./prompts";
import type { Enrichments, Listing, QuickAnalysis } from "../types";

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
  profils: {
    residence: "Idéal pour une résidence principale, bon DPE.",
    "locatif-nu": "Rendement estimable à 4 % brut si loué 900 €/mois.",
    airbnb: "Potentiel saisonnier correct, vérifier la réglementation locale.",
    coloc: "3 pièces adapté à une coloc à 2, demande locale à vérifier.",
  },
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
      { listing, quick },
      { provider: "google", apiKey: "test", model: "gemini-2.5-flash" },
      model,
    );
    expect(result.recommandation).toContain("277 000");
    expect(result.pointsVigilance[0]!.niveau).toBe("info");
    expect(result.negociation.cibleBasse).toBe(272_000);
    expect(result.profils["locatif-nu"]).toBeTruthy();
  });
});

describe("buildAnalysisPrompt", () => {
  it("inclut les données clés et les 4 profils", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    // Normalize whitespace (toLocaleString uses narrow no-break spaces U+202F on some locales)
    const normalized = prompt.replace(/ /g, " ");
    expect(normalized).toContain("courte durée");
    expect(normalized).toContain("289 000");
    expect(normalized).toContain("4795");
    expect(normalized).toContain("-5.8 % vs médiane");
  });

  it("omet la rubrique comparables quand il n'y en a aucun", () => {
    const prompt = buildAnalysisPrompt(listing, quick); // quick a comparables: []
    expect(prompt).not.toContain("Ventes comparables");
    expect(prompt).toContain("Médiane du secteur");
  });

  it("signale l'absence de données DVF", () => {
    const prompt = buildAnalysisPrompt(listing, { ...quick, market: null, marketGapPct: null });
    expect(prompt).toContain("Données DVF insuffisantes");
  });

  it("inclut la date du jour dans le prompt", () => {
    const prompt = buildAnalysisPrompt(listing, quick, undefined, new Date("2026-06-10"));
    expect(prompt).toContain("10 juin 2026");
  });

  it("inclut les Caractéristiques complètes quand attributes non vide", () => {
    const listingWithAttrs: Listing = {
      ...listing,
      attributes: [
        { label: "Salle de bain", value: "5" },
        { label: "Piscine", value: "Oui" },
      ],
    };
    const prompt = buildAnalysisPrompt(listingWithAttrs, quick, undefined, new Date("2026-06-10"));
    expect(prompt).toContain("Caractéristiques complètes");
    expect(prompt).toContain("Salle de bain : 5");
    expect(prompt).toContain("Piscine : Oui");
  });

  it("omet la rubrique Caractéristiques quand attributes absent ou vide", () => {
    const prompt = buildAnalysisPrompt(listing, quick, undefined, new Date("2026-06-10")); // no attributes
    expect(prompt).not.toContain("Caractéristiques complètes");
  });

  it("DPE outre-mer (97x) absent → non applicable, pas non renseigné", () => {
    const listingOm: Listing = {
      ...listing,
      dpe: undefined,
      location: { rawAddress: "Saint-Denis 97400", city: "Saint-Denis", postalCode: "97400" },
    };
    const prompt = buildAnalysisPrompt(listingOm, quick, undefined);
    expect(prompt).toContain("non applicable (outre-mer");
    expect(prompt).not.toContain("DPE : non renseigné");
  });

  it("DPE métropole absent → non renseigné", () => {
    const listingNoDpe: Listing = {
      ...listing,
      dpe: undefined,
    };
    const prompt = buildAnalysisPrompt(listingNoDpe, quick);
    expect(prompt).toContain("DPE : non renseigné");
    expect(prompt).not.toContain("non applicable");
  });

  it("DPE présent en outre-mer → valeur inchangée", () => {
    const listingOmWithDpe: Listing = {
      ...listing,
      dpe: "D",
      location: { rawAddress: "Pointe-à-Pitre 97110", city: "Pointe-à-Pitre", postalCode: "97110" },
    };
    const prompt = buildAnalysisPrompt(listingOmWithDpe, quick);
    expect(prompt).toContain("DPE : D");
    expect(prompt).not.toContain("non applicable");
  });

  it("contient le bloc Règles pour la négociation", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("Règles pour la négociation");
    expect(prompt).toContain("2 à 5 %");
    expect(prompt).toContain("JAMAIS");
    expect(prompt).toContain("sous le marché");
  });

  // ── Q6 : sections enrichissements ────────────────────────────────────────────

  const fullEnrichments: Enrichments = {
    neighborhood: {
      radiusM: 800,
      ecoles: { count: 5, nearest: [{ name: "École Jules Ferry", distanceM: 210 }] },
      commerces: { count: 7, nearest: [{ name: "Monoprix", distanceM: 150 }] },
      sante: { count: 3, nearest: [{ name: "Pharmacie de la Gare", distanceM: 320 }] },
      transports: { count: 19, nearest: [{ name: "Gare de Nantes", distanceM: 480 }] },
      espacesVerts: { count: 4, nearest: [{ name: "Jardin des Plantes", distanceM: 600 }] },
    },
    risks: {
      naturels: [
        { libelle: "Inondation", statut: "Commune concernée" },
        { libelle: "Radon", statut: "Zone 3 — potentiel élevé" },
      ],
      technologiques: [],
    },
    rent: {
      loyerM2: 12.5,
      loyerM2Bas: 10.8,
      loyerM2Haut: 14.2,
      fiable: true,
      nbAnnonces: 87,
      zoneAbc: "B1",
    },
  };

  it("section Quartier : count et nom du plus proche visible", () => {
    const prompt = buildAnalysisPrompt(listing, quick, fullEnrichments);
    expect(prompt).toContain("Quartier");
    expect(prompt).toContain("800 m");
    expect(prompt).toContain("École Jules Ferry");
    expect(prompt).toContain("210");
    expect(prompt).toContain("19"); // transports count
  });

  it("section Risques : libellés et statuts présents", () => {
    const prompt = buildAnalysisPrompt(listing, quick, fullEnrichments);
    expect(prompt).toContain("Risques");
    expect(prompt).toContain("Inondation");
    expect(prompt).toContain("Radon");
    expect(prompt).toContain("Commune concernée");
  });

  it("section Marché locatif : loyer médian, IC, fiabilité et zone ABC", () => {
    const prompt = buildAnalysisPrompt(listing, quick, fullEnrichments);
    expect(prompt).toContain("locatif");
    expect(prompt).toContain("12.5");
    expect(prompt).toContain("10.8");
    expect(prompt).toContain("14.2");
    expect(prompt).toContain("observé");
    expect(prompt).toContain("87");
    expect(prompt).toContain("B1");
  });

  it("section Quartier : données indisponibles quand neighborhood absent", () => {
    const prompt = buildAnalysisPrompt(listing, quick, { risks: fullEnrichments.risks });
    expect(prompt).toContain("données quartier indisponibles");
    expect(prompt).not.toContain("École Jules Ferry");
  });

  it("section Risques : données indisponibles quand risks absent", () => {
    const prompt = buildAnalysisPrompt(listing, quick, { neighborhood: fullEnrichments.neighborhood });
    expect(prompt).toContain("données risques indisponibles");
    expect(prompt).not.toContain("Inondation");
  });

  it("section Marché locatif : données indisponibles quand rent absent", () => {
    const prompt = buildAnalysisPrompt(listing, quick, { neighborhood: fullEnrichments.neighborhood });
    expect(prompt).toContain("données loyers indisponibles");
    expect(prompt).not.toContain("12.5");
  });

  it("toutes les sections absentes (enrichments undefined) → 3 lignes indisponibles", () => {
    const prompt = buildAnalysisPrompt(listing, quick, undefined);
    expect(prompt).toContain("données quartier indisponibles");
    expect(prompt).toContain("données risques indisponibles");
    expect(prompt).toContain("données loyers indisponibles");
  });

  it("consigne rendement brut présente dans les règles", () => {
    const prompt = buildAnalysisPrompt(listing, quick, fullEnrichments);
    expect(prompt).toContain("rendement brut");
  });

  it("consigne Airbnb : pas de données courte durée", () => {
    const prompt = buildAnalysisPrompt(listing, quick, fullEnrichments);
    expect(prompt).toContain("pas de données courte durée");
  });

  it("loyer extrapolé (maille) → fiabilité prudence", () => {
    const mailleEnrichments: Enrichments = {
      rent: { ...fullEnrichments.rent!, fiable: false, nbAnnonces: 0 },
    };
    const prompt = buildAnalysisPrompt(listing, quick, mailleEnrichments);
    expect(prompt).toContain("extrapolé");
  });

  // ── dispersion P25/P75 ────────────────────────────────────────────────────

  it("affiche la ligne dispersion quand p25/p75 sont présents dans MarketStats", () => {
    const quickWithDispersion: QuickAnalysis = {
      ...quick,
      market: {
        ...quick.market!,
        p25PricePerM2: 4200,
        p75PricePerM2: 5400,
      },
    };
    const prompt = buildAnalysisPrompt(listing, quickWithDispersion);
    expect(prompt).toContain("Dispersion du secteur");
    expect(prompt).toContain("4200");
    expect(prompt).toContain("5400");
  });

  it("omet la ligne dispersion quand p25/p75 absents", () => {
    const prompt = buildAnalysisPrompt(listing, quick); // quick.market sans p25/p75
    expect(prompt).not.toContain("Dispersion du secteur");
  });

  // ── règles de verdict nuancé ──────────────────────────────────────────────

  it("règles : confronter l'écart à la dispersion avant de conclure surcoté", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("P75");
    expect(prompt).toContain("fourchette haute");
  });

  it("règles : confronter l'écart aux atouts objectifs du bien", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("atouts");
    expect(prompt).toContain("micro-localisation");
  });

  it("règles : formulation premium imposée (jamais verdict brut surcoté seul)", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("premium");
    expect(prompt).toContain("possiblement justifié");
  });

  it("règles : symétrie P25 — prix sous le P25 mérite un commentaire", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("P25");
    expect(prompt).toContain("opportunité");
  });

  // ── Fix 2 : caveat position approximative ─────────────────────────────────

  it("Localisation sans precision → ligne inchangée (sans caveat)", () => {
    const prompt = buildAnalysisPrompt(listing, quick, undefined, new Date("2026-06-10"));
    expect(prompt).toContain("- Localisation : Nantes 44000");
    expect(prompt).not.toContain("position approximative");
  });

  it("Localisation precision=address → ligne inchangée (sans caveat)", () => {
    const listingAddr: Listing = {
      ...listing,
      location: { ...listing.location, precision: "address" },
    };
    const prompt = buildAnalysisPrompt(listingAddr, quick, undefined, new Date("2026-06-10"));
    expect(prompt).toContain("- Localisation : Nantes 44000");
    expect(prompt).not.toContain("position approximative");
  });

  it("Localisation precision=district + district → caveat complet avec quartier", () => {
    const listingDistrict: Listing = {
      ...listing,
      location: {
        rawAddress: "Saint-Denis 97400 Centre-Ville",
        city: "Saint-Denis",
        postalCode: "97400",
        district: "Centre-Ville",
        precision: "district",
      },
    };
    const prompt = buildAnalysisPrompt(listingDistrict, quick, undefined, new Date("2026-06-10"));
    expect(prompt).toContain("position approximative");
    expect(prompt).toContain("adresse exacte non communiquée");
    expect(prompt).toContain("Centre-Ville");
    expect(prompt).toContain("point au centre du quartier Centre-Ville");
  });

  it("Localisation precision=city (sans district) → caveat sans mention quartier", () => {
    const listingCity: Listing = {
      ...listing,
      location: {
        rawAddress: "Nantes 44000",
        city: "Nantes",
        postalCode: "44000",
        precision: "city",
      },
    };
    const prompt = buildAnalysisPrompt(listingCity, quick, undefined, new Date("2026-06-10"));
    expect(prompt).toContain("position approximative");
    expect(prompt).toContain("adresse exacte non communiquée");
    expect(prompt).not.toContain("point au centre du quartier");
  });

  it("section Quartier titre avec point approximatif quand precision != address", () => {
    const listingDistrict: Listing = {
      ...listing,
      location: {
        rawAddress: "Saint-Denis 97400 Centre-Ville",
        city: "Saint-Denis",
        postalCode: "97400",
        district: "Centre-Ville",
        precision: "district",
      },
    };
    const enrichments: Enrichments = {
      neighborhood: {
        radiusM: 800,
        ecoles: { count: 2, nearest: [] },
        commerces: { count: 3, nearest: [] },
        sante: { count: 1, nearest: [] },
        transports: { count: 5, nearest: [] },
        espacesVerts: { count: 1, nearest: [] },
      },
    };
    const prompt = buildAnalysisPrompt(listingDistrict, quick, enrichments, new Date("2026-06-10"));
    expect(prompt).toContain("autour du point approximatif");
  });

  it("section Quartier titre SANS mention approximative quand precision=address", () => {
    const listingAddr: Listing = {
      ...listing,
      location: { ...listing.location, precision: "address" },
    };
    const enrichments: Enrichments = {
      neighborhood: {
        radiusM: 800,
        ecoles: { count: 2, nearest: [] },
        commerces: { count: 3, nearest: [] },
        sante: { count: 1, nearest: [] },
        transports: { count: 5, nearest: [] },
        espacesVerts: { count: 1, nearest: [] },
      },
    };
    const prompt = buildAnalysisPrompt(listingAddr, quick, enrichments, new Date("2026-06-10"));
    expect(prompt).not.toContain("autour du point approximatif");
  });

  // ── Vigilance : date de publication et limite artificielle ────────────────

  it("points de vigilance : instruction jamais artificiellement limitée présente", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("jamais artificiellement limitée");
  });

  it("points de vigilance : instruction sur l'ancienneté de l'annonce présente", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("ancienneté de l'annonce");
  });
});
