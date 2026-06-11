import { describe, expect, it } from "vitest";
import { computeGlobalScore } from "./global-score";
import type { Listing, QuickAnalysis, Enrichments, MarketStats } from "../types";

// Fixtures shared across tests
const market: MarketStats = {
  medianPricePerM2: 4795,
  sampleSize: 42,
  radiusM: 500,
  confidence: "high",
  comparables: [],
};

// quick.score = 73 (hand-verified against score.ts formula: 289000/64=4516, gap=-5.8%, 60-(-5.8)*2.2=72.76→73)
const quick: QuickAnalysis = {
  listingPricePerM2: 4516,
  marketGapPct: -5.8,
  market,
  score: 73,
  scoreLabel: "Bon",
};

const listing = {
  price: 289_000,
  surface: 64,
  dpe: "C",
} as unknown as Listing;

// Full enrichments: 2 naturels, 1 techno, various POI counts, zoneAbc B1
const enrichmentsFull: Enrichments = {
  neighborhood: {
    radiusM: 800,
    ecoles: { count: 2, nearest: [] },
    commerces: { count: 4, nearest: [] },
    sante: { count: 2, nearest: [] },
    transports: { count: 8, nearest: [] },
    espacesVerts: { count: 3, nearest: [] },
  },
  risks: {
    naturels: [
      { libelle: "Inondation", statut: "oui" },
      { libelle: "Séisme", statut: "oui" },
    ],
    technologiques: [
      { libelle: "Canalisations", statut: "oui" },
    ],
  },
  rent: {
    loyerM2: 14.5,
    loyerM2Bas: 12.0,
    loyerM2Haut: 17.0,
    fiable: true,
    nbAnnonces: 42,
    zoneAbc: "B1",
  },
};

describe("computeGlobalScore", () => {
  describe("cas complet (tous critères disponibles)", () => {
    it("calcule le score global arrondi et renvoie 8 critères aux bons poids (100% total)", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      expect(result).not.toBeNull();
      // Somme des poids = 100
      const totalPoids = result!.criteres.reduce((s, c) => s + c.poids, 0);
      expect(totalPoids).toBe(100);
      // 8 critères
      expect(result!.criteres).toHaveLength(8);
    });

    it("score global = 71 (calcul main : 73×35+70×15+58×15+75×10+75×10+60×5+85×5+75×5 = 7075)", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      // 7075/100 = 70.75 → round → 71
      expect(result!.score).toBe(71);
    });

    it("chaque critère a id, label, score et poids", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      for (const c of result!.criteres) {
        expect(typeof c.id).toBe("string");
        expect(typeof c.label).toBe("string");
        expect(typeof c.score).toBe("number");
        expect(typeof c.poids).toBe("number");
      }
    });

    it("critère prix = 73 (price score passé tel quel)", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      const prix = result!.criteres.find((c) => c.id === "prix");
      expect(prix?.score).toBe(73);
    });

    it("critère DPE C = 70", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      const dpe = result!.criteres.find((c) => c.id === "dpe");
      expect(dpe?.score).toBe(70);
    });

    it("critère risques : 2 naturels + 1 techno → 90-24-8=58", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      const risks = result!.criteres.find((c) => c.id === "risques");
      expect(risks?.score).toBe(58);
    });

    it("critère transports : 8 arrêts → 75", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      const t = result!.criteres.find((c) => c.id === "transports");
      expect(t?.score).toBe(75);
    });

    it("critère commerces : commerces(4)+santé(2)=6 → 75", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      const c = result!.criteres.find((c) => c.id === "commerces");
      expect(c?.score).toBe(75);
    });

    it("critère écoles : count=2 → 60", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      const e = result!.criteres.find((c) => c.id === "ecoles");
      expect(e?.score).toBe(60);
    });

    it("critère espaces verts : count=3 → 85", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      const ev = result!.criteres.find((c) => c.id === "espacesVerts");
      expect(ev?.score).toBe(85);
    });

    it("critère tension locative : zone B1 → 75", () => {
      const result = computeGlobalScore(quick, listing, enrichmentsFull);
      const tl = result!.criteres.find((c) => c.id === "tensionLocative");
      expect(tl?.score).toBe(75);
    });
  });

  describe("renormalisation des poids quand DPE absent", () => {
    it("sans DPE les 15 pts sont redistribués et la somme reste 100", () => {
      const listingNoDpe = { price: 289_000, surface: 64 } as unknown as Listing;
      const result = computeGlobalScore(quick, listingNoDpe, enrichmentsFull);
      expect(result).not.toBeNull();
      const totalPoids = result!.criteres.reduce((s, c) => s + c.poids, 0);
      expect(totalPoids).toBe(100);
      expect(result!.criteres).toHaveLength(7); // DPE absent → 7 critères
      expect(result!.criteres.find((c) => c.id === "dpe")).toBeUndefined();
    });
  });

  describe("renormalisation : sans tensionLocative", () => {
    it("sans zoneAbc la somme reste 100 et tensionLocative absent", () => {
      const enrichmentsNoZone: Enrichments = {
        ...enrichmentsFull,
        rent: {
          ...enrichmentsFull.rent!,
          zoneAbc: undefined,
        },
      };
      const result = computeGlobalScore(quick, listing, enrichmentsNoZone);
      expect(result).not.toBeNull();
      const totalPoids = result!.criteres.reduce((s, c) => s + c.poids, 0);
      expect(totalPoids).toBe(100);
      expect(result!.criteres.find((c) => c.id === "tensionLocative")).toBeUndefined();
    });
  });

  describe("cas prix seul (pas d'enrichissements, pas de DPE)", () => {
    it("quick score only → score global = quick.score, 1 critère poids 100", () => {
      const listingPriceOnly = { price: 289_000, surface: 64 } as unknown as Listing;
      const result = computeGlobalScore(quick, listingPriceOnly, undefined);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(73);
      expect(result!.criteres).toHaveLength(1);
      expect(result!.criteres[0]!.poids).toBe(100);
      expect(result!.criteres[0]!.id).toBe("prix");
    });
  });

  describe("clamps", () => {
    it("risques : 0 naturels + 0 techno → 90 (non clampé)", () => {
      const noRisks: Enrichments = {
        ...enrichmentsFull,
        risks: { naturels: [], technologiques: [] },
      };
      const result = computeGlobalScore(quick, listing, noRisks);
      const r = result!.criteres.find((c) => c.id === "risques");
      expect(r?.score).toBe(90);
    });

    it("risques : 8 naturels + 3 techno → plancher 10", () => {
      const bigRisks: Enrichments = {
        ...enrichmentsFull,
        risks: {
          naturels: Array(8).fill({ libelle: "x", statut: "oui" }),
          technologiques: Array(3).fill({ libelle: "x", statut: "oui" }),
        },
      };
      const result = computeGlobalScore(quick, listing, bigRisks);
      const r = result!.criteres.find((c) => c.id === "risques");
      // 90 - 8*12 - 3*8 = 90-96-24 = -30 → clamp → 10
      expect(r?.score).toBe(10);
    });

    it("DPE A → 95, DPE G → 10", () => {
      const listingA = { ...listing, dpe: "A" } as unknown as Listing;
      const listingG = { ...listing, dpe: "G" } as unknown as Listing;
      const rA = computeGlobalScore(quick, listingA, undefined);
      const rG = computeGlobalScore(quick, listingG, undefined);
      expect(rA!.criteres.find((c) => c.id === "dpe")?.score).toBe(95);
      expect(rG!.criteres.find((c) => c.id === "dpe")?.score).toBe(10);
    });
  });

  describe("cas null", () => {
    it("sans score prix et sans enrichissements → null", () => {
      const quickNoScore: QuickAnalysis = { ...quick, score: null };
      const result = computeGlobalScore(quickNoScore, { price: 289_000, surface: 64 } as unknown as Listing, undefined);
      expect(result).toBeNull();
    });
  });

  describe("barèmes transports", () => {
    it("0 → 15, 1-2 → 40, 3-5 → 60, 11-20 → 85, >20 → 95", () => {
      function scoreTransports(count: number) {
        const enr: Enrichments = {
          ...enrichmentsFull,
          neighborhood: { ...enrichmentsFull.neighborhood!, transports: { count, nearest: [] } },
        };
        const r = computeGlobalScore(quick, listing, enr);
        return r!.criteres.find((c) => c.id === "transports")?.score;
      }
      expect(scoreTransports(0)).toBe(15);
      expect(scoreTransports(1)).toBe(40);
      expect(scoreTransports(2)).toBe(40);
      expect(scoreTransports(3)).toBe(60);
      expect(scoreTransports(5)).toBe(60);
      expect(scoreTransports(6)).toBe(75);
      expect(scoreTransports(10)).toBe(75);
      expect(scoreTransports(11)).toBe(85);
      expect(scoreTransports(20)).toBe(85);
      expect(scoreTransports(21)).toBe(95);
    });
  });

  describe("barèmes écoles", () => {
    it("0 → 30, 1-2 → 60, ≥3 → 85", () => {
      function scoreEcoles(count: number) {
        const enr: Enrichments = {
          ...enrichmentsFull,
          neighborhood: { ...enrichmentsFull.neighborhood!, ecoles: { count, nearest: [] } },
        };
        const r = computeGlobalScore(quick, listing, enr);
        return r!.criteres.find((c) => c.id === "ecoles")?.score;
      }
      expect(scoreEcoles(0)).toBe(30);
      expect(scoreEcoles(1)).toBe(60);
      expect(scoreEcoles(2)).toBe(60);
      expect(scoreEcoles(3)).toBe(85);
      expect(scoreEcoles(10)).toBe(85);
    });
  });

  describe("barèmes espaces verts", () => {
    it("0 → 30, 1-2 → 65, ≥3 → 85", () => {
      function scoreEV(count: number) {
        const enr: Enrichments = {
          ...enrichmentsFull,
          neighborhood: { ...enrichmentsFull.neighborhood!, espacesVerts: { count, nearest: [] } },
        };
        const r = computeGlobalScore(quick, listing, enr);
        return r!.criteres.find((c) => c.id === "espacesVerts")?.score;
      }
      expect(scoreEV(0)).toBe(30);
      expect(scoreEV(1)).toBe(65);
      expect(scoreEV(2)).toBe(65);
      expect(scoreEV(3)).toBe(85);
    });
  });

  describe("tension locative barèmes", () => {
    function scoreTension(zone: string) {
      const enr: Enrichments = {
        ...enrichmentsFull,
        rent: { ...enrichmentsFull.rent!, zoneAbc: zone },
      };
      const r = computeGlobalScore(quick, listing, enr);
      return r!.criteres.find((c) => c.id === "tensionLocative")?.score;
    }

    it("Abis et A → 90, B2 → 55, C → 40", () => {
      expect(scoreTension("Abis")).toBe(90);
      expect(scoreTension("A")).toBe(90);
      expect(scoreTension("B1")).toBe(75);
      expect(scoreTension("B2")).toBe(55);
      expect(scoreTension("C")).toBe(40);
    });

    it('zone "Abis" (forme réelle du CSV zonage, sans espace) → critère présent avec score 90', () => {
      const enr: Enrichments = {
        ...enrichmentsFull,
        rent: { ...enrichmentsFull.rent!, zoneAbc: "Abis" },
      };
      const r = computeGlobalScore(quick, listing, enr);
      const tl = r!.criteres.find((c) => c.id === "tensionLocative");
      expect(tl).toBeDefined();
      expect(tl!.score).toBe(90);
    });

    it('zone "A bis" (ancienne forme avec espace) reste acceptée → 90', () => {
      expect(scoreTension("A bis")).toBe(90);
    });
  });
});
