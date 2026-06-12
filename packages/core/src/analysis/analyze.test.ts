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
  checklistVisite: [
    "Demander les 3 derniers PV d'AG de la copropriété",
    "Vérifier le montant des charges mensuelles et le fonds travaux",
  ],
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
    expect(Array.isArray(result.checklistVisite)).toBe(true);
    expect(result.checklistVisite!.length).toBeGreaterThan(0);
    expect(result.checklistVisite![0]).toContain("PV d'AG");
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
      ecoles: { count: 5, nearest: [{ name: "École Jules Ferry", distanceM: 210, lat: 47.2185, lon: -1.5535 }] },
      commerces: { count: 7, nearest: [{ name: "Monoprix", distanceM: 150, lat: 47.2178, lon: -1.5542 }] },
      sante: { count: 3, nearest: [{ name: "Pharmacie de la Gare", distanceM: 320, lat: 47.2169, lon: -1.5518 }] },
      transports: { count: 19, nearest: [{ name: "Gare de Nantes", distanceM: 480, lat: 47.2173, lon: -1.5421 }] },
      espacesVerts: { count: 4, nearest: [{ name: "Jardin des Plantes", distanceM: 600, lat: 47.2196, lon: -1.5429 }] },
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
    commune: { nom: "Saint-Denis", population: 155634, densityPerKm2: 1093 },
    plu: { libelle: "Uavap", typezone: "U" },
    taxeFonciere: { exercice: "2025", tauxGlobalTfb: 38.97, tauxTeom: 15.8 },
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

  // ── contexte communal (commune / PLU / taxe foncière) ─────────────────────

  it("section Contexte communal : commune, population et densité", () => {
    const prompt = buildAnalysisPrompt(listing, quick, fullEnrichments);
    expect(prompt).toContain("Contexte communal");
    expect(prompt).toContain("Commune : Saint-Denis, 155634 hab (1093 hab/km²)");
  });

  it("section Contexte communal : zonage PLU avec libellé, typezone et légende U/AU/A/N", () => {
    const prompt = buildAnalysisPrompt(listing, quick, fullEnrichments);
    expect(prompt).toContain("Zonage PLU : Uavap (U)");
    expect(prompt).toContain("U = urbaine");
    expect(prompt).toContain("AU = à urbaniser");
    expect(prompt).toContain("A = agricole");
    expect(prompt).toContain("N = naturelle");
  });

  it("section Contexte communal : taux de taxe foncière + TEOM, consigne charges", () => {
    const prompt = buildAnalysisPrompt(listing, quick, fullEnrichments);
    expect(prompt).toContain("Taux global de taxe foncière bâtie 2025 : 38.97 % (+ TEOM 15.8 %)");
    expect(prompt).toContain("à intégrer dans l'évaluation des charges");
  });

  it("taxe foncière sans TEOM (tauxTeom null) → pas de mention TEOM", () => {
    const enrichments: Enrichments = {
      taxeFonciere: { exercice: "2025", tauxGlobalTfb: 38.97, tauxTeom: null },
    };
    const prompt = buildAnalysisPrompt(listing, quick, enrichments);
    expect(prompt).toContain("Taux global de taxe foncière bâtie 2025 : 38.97 %");
    expect(prompt).not.toContain("TEOM");
  });

  it("plu null (interrogé sans zonage) → pas de ligne Zonage PLU", () => {
    const enrichments: Enrichments = {
      commune: fullEnrichments.commune,
      plu: null,
      taxeFonciere: null,
    };
    const prompt = buildAnalysisPrompt(listing, quick, enrichments);
    expect(prompt).toContain("Commune : Saint-Denis");
    expect(prompt).not.toContain("Zonage PLU");
    expect(prompt).not.toContain("taxe foncière bâtie");
  });

  it("commune/plu/taxe foncière absents → pas de section Contexte communal", () => {
    const prompt = buildAnalysisPrompt(listing, quick, { neighborhood: fullEnrichments.neighborhood });
    expect(prompt).not.toContain("Contexte communal");
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

  it("règles : ne jamais citer les distances à vol d'oiseau en mètres", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain(
      "Ne cite jamais ces distances en mètres dans ta rédaction : elles sont à vol d'oiseau et ne reflètent pas les trajets réels.",
    );
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

  it("section Quartier : toutes catégories à zéro → consigne couverture OSM non concluante", () => {
    const enrichments: Enrichments = {
      neighborhood: {
        radiusM: 800,
        ecoles: { count: 0, nearest: [] },
        commerces: { count: 0, nearest: [] },
        sante: { count: 0, nearest: [] },
        transports: { count: 0, nearest: [] },
        espacesVerts: { count: 0, nearest: [] },
      },
    };
    const prompt = buildAnalysisPrompt(listing, quick, enrichments, new Date("2026-06-10"));
    expect(prompt).toContain("Aucune commodité référencée par OpenStreetMap dans le rayon");
    expect(prompt).toContain("ne JAMAIS conclure à une absence réelle de commodités");
    expect(prompt).toContain("non concluante");
    expect(prompt).not.toContain("Écoles : 0");
  });

  it("section Quartier : position approximative → consigne comptages approximatifs renforcée", () => {
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
    expect(prompt).toContain(
      "Le point de référence est approximatif : les comptages le sont aussi, rester prudent.",
    );
  });

  it("section Quartier : tous-à-zéro ET position approximative → les deux consignes", () => {
    const listingDistrict: Listing = {
      ...listing,
      location: { ...listing.location, precision: "district" },
    };
    const enrichments: Enrichments = {
      neighborhood: {
        radiusM: 800,
        ecoles: { count: 0, nearest: [] },
        commerces: { count: 0, nearest: [] },
        sante: { count: 0, nearest: [] },
        transports: { count: 0, nearest: [] },
        espacesVerts: { count: 0, nearest: [] },
      },
    };
    const prompt = buildAnalysisPrompt(listingDistrict, quick, enrichments, new Date("2026-06-10"));
    expect(prompt).toContain("Aucune commodité référencée par OpenStreetMap dans le rayon");
    expect(prompt).toContain(
      "Le point de référence est approximatif : les comptages le sont aussi, rester prudent.",
    );
  });

  it("section Quartier : precision exacte → pas de consigne comptages approximatifs", () => {
    const listingAddr: Listing = {
      ...listing,
      location: { ...listing.location, precision: "housenumber" },
    };
    const enrichments: Enrichments = {
      neighborhood: fullEnrichments.neighborhood,
    };
    const prompt = buildAnalysisPrompt(listingAddr, quick, enrichments, new Date("2026-06-10"));
    expect(prompt).not.toContain("Le point de référence est approximatif");
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

  // ── Checklist visite ─────────────────────────────────────────────────────

  it("consigne checklist visite présente dans l'attendu", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("checklistVisite");
  });

  it("consigne checklist : spécifique au bien, pas générique", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("spécifique");
  });

  it("consigne checklist : entre 5 et 10 éléments demandés", () => {
    const prompt = buildAnalysisPrompt(listing, quick);
    expect(prompt).toContain("5 à 10");
  });

  // ── R5 : notes utilisateur (visite, agent) ────────────────────────────────

  it("section notes utilisateur : contenu et règles quand userNotes renseigné", () => {
    const prompt = buildAnalysisPrompt(
      {
        ...listing,
        userNotes: "Visité le 12/06 — toiture refaite en 2022, l'agent annonce 180 €/mois de charges.",
      },
      quick,
    );
    expect(prompt).toContain("Informations complémentaires fournies par l'utilisateur");
    expect(prompt).toContain("toiture refaite en 2022");
    expect(prompt).toContain("PRIORENT sur l'annonce");
    expect(prompt).toContain("déclaratives (non vérifiées)");
    expect(prompt).toContain("selon votre visite");
  });

  it("pas de section notes quand userNotes absent ou vide", () => {
    expect(buildAnalysisPrompt(listing, quick)).not.toContain("Informations complémentaires");
    expect(buildAnalysisPrompt({ ...listing, userNotes: "   " }, quick)).not.toContain(
      "Informations complémentaires",
    );
  });

  // ── R6 : profil de recherche de l'acheteur ────────────────────────────────

  it("section profil de recherche : contenu et règles quand searchProfile fourni", () => {
    const prompt = buildAnalysisPrompt(
      listing,
      quick,
      undefined,
      undefined,
      "Couple avec une grand-mère à mobilité réduite — ascenseur indispensable, nous cherchons notre résidence principale.",
    );
    expect(prompt).toContain("Profil de recherche de l'acheteur");
    expect(prompt).toContain("grand-mère à mobilité réduite");
    expect(prompt).toContain("SIGNALE EXPLICITEMENT toute incompatibilité");
    expect(prompt).toContain("point de vigilance critique");
    expect(prompt).toContain("Ne JAMAIS inventer une caractéristique du bien");
    expect(prompt).toContain("ajoute le point correspondant à la checklist visite");
    expect(prompt).toContain("SANS supprimer les avis des 4 projets");
  });

  it("pas de section profil quand searchProfile absent ou vide", () => {
    expect(buildAnalysisPrompt(listing, quick)).not.toContain("Profil de recherche");
    expect(buildAnalysisPrompt(listing, quick, undefined, undefined, "   ")).not.toContain(
      "Profil de recherche",
    );
  });

  it("notes et profil cumulés : les deux sections coexistent", () => {
    const prompt = buildAnalysisPrompt(
      { ...listing, userNotes: "Vis-à-vis important côté rue." },
      quick,
      undefined,
      undefined,
      "École primaire à pied indispensable.",
    );
    expect(prompt).toContain("Informations complémentaires fournies par l'utilisateur");
    expect(prompt).toContain("Vis-à-vis important côté rue.");
    expect(prompt).toContain("Profil de recherche de l'acheteur");
    expect(prompt).toContain("École primaire à pied indispensable.");
  });
});
