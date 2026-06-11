import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parseDvfCsv, computeMarketStats, fetchCommuneSales, haversineM, DVF_YEARS } from "./dvf";

const csv = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/dvf-sample.csv"),
  "utf8",
);

describe("parseDvfCsv", () => {
  const sales = parseDvfCsv(csv);

  it("garde la vente simple et la vente avec dépendance", () => {
    const ids = sales.map((s) => s.idMutation);
    expect(ids).toContain("2024-1");
    expect(ids).toContain("2024-2"); // la dépendance n'invalide pas la mutation
    expect(ids).toContain("2024-5"); // maison
  });

  it("exclut bloc, aberrant, adjudication, sans GPS", () => {
    const ids = sales.map((s) => s.idMutation);
    expect(ids).not.toContain("2024-3"); // 2 logements même mutation → prix non ventilable
    expect(ids).not.toContain("2024-4"); // 600 000 €/m² → borne dure
    expect(ids).not.toContain("2024-6"); // Adjudication
    expect(ids).not.toContain("2024-7"); // pas de coordonnées
  });

  it("calcule le prix au m²", () => {
    const s1 = sales.find((s) => s.idMutation === "2024-1")!;
    expect(s1.pricePerM2).toBeCloseTo(316000 / 71, 1);
    expect(s1.type).toBe("Appartement");
    expect(s1.rooms).toBe(4);
    expect(s1.date).toBe("2024-01-03");
  });

  it("supporte les fins de ligne CRLF", () => {
    const crlf = parseDvfCsv(csv.replace(/\n/g, "\r\n"));
    expect(crlf).toHaveLength(sales.length);
  });

  it("supporte un BOM en tête de fichier", () => {
    const bom = parseDvfCsv("﻿" + csv);
    expect(bom).toHaveLength(sales.length);
  });

  it("ignore une ligne malformée trop courte sans lever", () => {
    const malformed = parseDvfCsv(csv + "\n2024-9,2024-08-01,bad");
    expect(malformed).toHaveLength(sales.length);
    expect(malformed.map((s) => s.idMutation)).not.toContain("2024-9");
  });

  it("rejette tout type_local autre qu'Appartement/Maison (pas de cast aveugle)", () => {
    // Réutilise une ligne valide du fixture en remplaçant le type_local
    // par une valeur hors habitation : la mutation ne doit produire aucune vente.
    const lines = csv.trim().split("\n");
    const header = lines[0]!;
    const validLine = lines[1]!; // mutation 2024-1, Appartement
    const localCommercial = validLine
      .replace("2024-1", "2024-X")
      .replace("Appartement", "Local industriel. commercial ou assimilé");
    const parsed = parseDvfCsv([header, localCommercial].join("\n"));
    expect(parsed).toHaveLength(0);
    // et chaque vente parsée porte un type strictement habitation
    for (const s of sales) {
      expect(["Appartement", "Maison"]).toContain(s.type);
    }
  });
});

describe("haversineM", () => {
  it("calcule une distance plausible entre deux points valides", () => {
    // Nantes centre → ~1,1 km vers l'est
    const d = haversineM(47.2184, -1.5536, 47.2184, -1.539);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1300);
  });

  it("lève sur des coordonnées non finies", () => {
    expect(() => haversineM(Number.NaN, -1.55, 47.2, -1.55)).toThrow(/coordonnées invalides/);
    expect(() => haversineM(47.2, -1.55, 47.2, Number.POSITIVE_INFINITY)).toThrow(
      /coordonnées invalides/,
    );
  });

  it("lève sur des coordonnées hors plage (|lat|>90, |lon|>180)", () => {
    // Cas réel : coordonnées corrompues renvoyées pour les DOM
    expect(() => haversineM(947.4, 55.5, -21.1, 55.5)).toThrow(/coordonnées invalides/);
    expect(() => haversineM(-21.1, 555.5, -21.1, 55.5)).toThrow(/coordonnées invalides/);
    expect(() => haversineM(-21.1, 55.5, 91, 55.5)).toThrow(/coordonnées invalides/);
  });
});

function fakeSale(over: Partial<import("../types").DvfSale>): import("../types").DvfSale {
  return {
    idMutation: Math.random().toString(36).slice(2),
    date: "2024-06-01",
    price: 300_000,
    surface: 60,
    rooms: 3,
    pricePerM2: 5000,
    type: "Appartement",
    lat: 47.2251,
    lon: -1.5265,
    address: "rue test",
    ...over,
  };
}

describe("computeMarketStats", () => {
  it("calcule la médiane sur les ventes proches du même type", () => {
    const sales = [
      ...Array.from({ length: 15 }, (_, i) => fakeSale({ pricePerM2: 4500 + i * 50 })),
      fakeSale({ pricePerM2: 5000, lat: 48.85, lon: 2.35 }), // Paris → hors rayon
      fakeSale({ pricePerM2: 5000, type: "Maison" }), // autre type → exclu
    ];
    const stats = computeMarketStats(sales, { lat: 47.2251, lon: -1.5265 }, "Appartement");
    expect(stats).not.toBeNull();
    expect(stats!.sampleSize).toBe(15);
    expect(stats!.medianPricePerM2).toBeCloseTo(4850, 0);
    expect(stats!.confidence).toBe("medium");
    expect(stats!.comparables.length).toBeLessThanOrEqual(10);
    expect(stats!.comparables[0]!.distanceM).toBeGreaterThanOrEqual(0);
  });

  it("élargit le rayon si trop peu de ventes à 500 m", () => {
    // ~0.012° lon ≈ 900 m à cette latitude → hors rayon 500 m, dans rayon 1000 m
    const sales = Array.from({ length: 12 }, () => fakeSale({ lon: -1.5385 }));
    const stats = computeMarketStats(sales, { lat: 47.2251, lon: -1.5265 }, "Appartement");
    expect(stats!.radiusM).toBe(1000);
  });

  it("retourne null si aucun échantillon exploitable", () => {
    expect(computeMarketStats([], { lat: 47, lon: -1.5 }, "Appartement")).toBeNull();
  });

  it("écarte les aberrants par MAD avant la médiane", () => {
    const sales = [
      ...Array.from({ length: 20 }, () => fakeSale({ pricePerM2: 4800 })),
      fakeSale({ pricePerM2: 19_000 }),
    ];
    const stats = computeMarketStats(sales, { lat: 47.2251, lon: -1.5265 }, "Appartement");
    expect(stats!.medianPricePerM2).toBeCloseTo(4800, 0);
    expect(stats!.sampleSize).toBe(20);
  });
});

describe("computeMarketStats — surface similaire", () => {
  it("médiane sur les 12 similaires quand ≥ MIN_SAMPLE, others marqués similar:false", () => {
    // 12 ventes à 65 m² (similaires à 60 m², ±30 % = ±18 m²) à pricePerM2 = 5000
    // 5 ventes à 20 m² (éloignées, |20-60|=40 > 18) — même pricePerM2 pour passer le filtre MAD
    const similarSales = Array.from({ length: 12 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000 }),
    );
    const otherSales = Array.from({ length: 5 }, () =>
      fakeSale({ surface: 20, pricePerM2: 5100 }),
    );
    const stats = computeMarketStats(
      [...similarSales, ...otherSales],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60 },
    );
    expect(stats).not.toBeNull();
    expect(stats!.medianOnSimilar).toBe(true);
    expect(stats!.sampleSize).toBe(12);
    expect(stats!.medianPricePerM2).toBeCloseTo(5000, 0);
    // similar ones come first, others (similar:false) come after
    const similarComps = stats!.comparables.filter((c) => c.similar !== false);
    const otherComps = stats!.comparables.filter((c) => c.similar === false);
    expect(similarComps.length).toBeGreaterThan(0);
    expect(otherComps.length).toBeGreaterThan(0);
    // similar first
    const firstOtherIdx = stats!.comparables.findIndex((c) => c.similar === false);
    const lastSimilarIdx = stats!.comparables.map((c) => c.similar !== false).lastIndexOf(true);
    expect(lastSimilarIdx).toBeLessThan(firstOtherIdx);
  });

  it("médiane sur tout kept quand similaires < MIN_SAMPLE, medianOnSimilar false", () => {
    // 4 similaires (< 10) + 12 autres → médiane sur tout kept
    const similarSales = Array.from({ length: 4 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000 }),
    );
    const otherSales = Array.from({ length: 12 }, () =>
      fakeSale({ surface: 20, pricePerM2: 8000 }),
    );
    const stats = computeMarketStats(
      [...similarSales, ...otherSales],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60 },
    );
    expect(stats).not.toBeNull();
    expect(stats!.medianOnSimilar).toBe(false);
    // sampleSize = total kept (16), medianPricePerM2 blended (not 5000 nor 8000 alone)
    expect(stats!.sampleSize).toBe(16);
    // median of [5000×4, 8000×12] = 8000 (the majority)
    expect(stats!.medianPricePerM2).not.toBeCloseTo(5000, -1);
  });

  it("sans surface → comportement identique à l'ancien (medianOnSimilar false, tous similar !== false)", () => {
    const sales = Array.from({ length: 15 }, (_, i) => fakeSale({ pricePerM2: 4500 + i * 50 }));
    const statsOld = computeMarketStats(sales, { lat: 47.2251, lon: -1.5265 }, "Appartement");
    const statsNew = computeMarketStats(sales, { lat: 47.2251, lon: -1.5265 }, "Appartement", {});
    expect(statsNew).not.toBeNull();
    expect(statsNew!.medianOnSimilar).toBeFalsy();
    // every comparable should have similar !== false
    expect(statsNew!.comparables.every((c) => c.similar !== false)).toBe(true);
    // results match old behavior
    expect(statsNew!.medianPricePerM2).toBe(statsOld!.medianPricePerM2);
    expect(statsNew!.sampleSize).toBe(statsOld!.sampleSize);
  });
});

const NOW = new Date("2026-06-10");

// Fenêtre « toutes dates » dérivée : du 1er janvier de la première année DVF
// (2023) à NOW (juin 2026) → (2026-2023)×12 + 5 = 41 mois.
const ALL_DATES_WINDOW_MONTHS = (NOW.getFullYear() - DVF_YEARS[0]!) * 12 + NOW.getMonth();

describe("computeMarketStats — recency (hiérarchie 4 niveaux)", () => {
  it("niveau 1 : 12 similaires récents → médiane sur les récents, windowMonths 18", () => {
    // 12 ventes similaires récentes (~3 mois avant now)
    const recentSimilar = Array.from({ length: 12 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000, date: "2026-03-01" }),
    );
    // 8 ventes similaires anciennes (3 ans, prix différent)
    const oldSimilar = Array.from({ length: 8 }, () =>
      fakeSale({ surface: 65, pricePerM2: 3000, date: "2023-01-01" }),
    );
    const stats = computeMarketStats(
      [...recentSimilar, ...oldSimilar],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60, now: NOW },
    );
    expect(stats).not.toBeNull();
    expect(stats!.medianOnSimilar).toBe(true);
    expect(stats!.windowMonths).toBe(18);
    expect(stats!.sampleSize).toBe(12);
    expect(stats!.medianPricePerM2).toBeCloseTo(5000, 0);
  });

  it("niveau 2 : 4 similaires récents + 8 similaires anciens → médiane sur les 12 similaires, fenêtre toutes dates", () => {
    // 4 similaires récents (< MIN_SAMPLE=10)
    const recentSimilar = Array.from({ length: 4 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000, date: "2026-03-01" }),
    );
    // 8 similaires anciens → total similaires = 12 ≥ MIN_SAMPLE
    const oldSimilar = Array.from({ length: 8 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000, date: "2023-01-01" }),
    );
    const stats = computeMarketStats(
      [...recentSimilar, ...oldSimilar],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60, now: NOW },
    );
    expect(stats).not.toBeNull();
    expect(stats!.medianOnSimilar).toBe(true);
    expect(stats!.windowMonths).toBe(ALL_DATES_WINDOW_MONTHS); // 41 pour NOW=2026-06
    expect(stats!.sampleSize).toBe(12);
    expect(stats!.medianPricePerM2).toBeCloseTo(5000, 0);
  });

  it("niveau 3 : pas de surface, 15 récents + 10 anciens → médiane sur les récents, windowMonths 18", () => {
    // 15 ventes récentes toutes surfaces
    const recentSales = Array.from({ length: 15 }, () =>
      fakeSale({ pricePerM2: 5000, date: "2026-03-01" }),
    );
    // 10 ventes anciennes, prix différent
    const oldSales = Array.from({ length: 10 }, () =>
      fakeSale({ pricePerM2: 3000, date: "2023-01-01" }),
    );
    const stats = computeMarketStats(
      [...recentSales, ...oldSales],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { now: NOW },
    );
    expect(stats).not.toBeNull();
    expect(stats!.medianOnSimilar).toBe(false);
    expect(stats!.windowMonths).toBe(18);
    expect(stats!.sampleSize).toBe(15);
    expect(stats!.medianPricePerM2).toBeCloseTo(5000, 0);
  });

  it("niveau 4 : pas de surface, 5 récents + 6 anciens → tout kept, fenêtre toutes dates", () => {
    // 5 récents (< MIN_SAMPLE) + 6 anciens → total = 11, recent seul insuffisant
    const recentSales = Array.from({ length: 5 }, () =>
      fakeSale({ pricePerM2: 5000, date: "2026-03-01" }),
    );
    const oldSales = Array.from({ length: 6 }, () =>
      fakeSale({ pricePerM2: 5000, date: "2023-01-01" }),
    );
    const stats = computeMarketStats(
      [...recentSales, ...oldSales],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { now: NOW },
    );
    expect(stats).not.toBeNull();
    expect(stats!.medianOnSimilar).toBe(false);
    expect(stats!.windowMonths).toBe(ALL_DATES_WINDOW_MONTHS); // 41 pour NOW=2026-06
    expect(stats!.sampleSize).toBe(11);
  });
});

describe("computeMarketStats — transitions de la hiérarchie de récence", () => {
  // MIN_SAMPLE = 10 : chaque test force la bascule d'un niveau au suivant
  // en plaçant le niveau supérieur juste sous le seuil.

  it("reste au niveau 1 avec exactement 10 similaires récents", () => {
    const recentSimilar = Array.from({ length: 10 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000, date: "2026-03-01" }),
    );
    const oldSimilar = Array.from({ length: 8 }, () =>
      fakeSale({ surface: 65, pricePerM2: 3000, date: "2023-01-01" }),
    );
    const stats = computeMarketStats(
      [...recentSimilar, ...oldSimilar],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60, now: NOW },
    );
    expect(stats!.medianOnSimilar).toBe(true);
    expect(stats!.windowMonths).toBe(18);
    expect(stats!.sampleSize).toBe(10);
    expect(stats!.medianPricePerM2).toBeCloseTo(5000, 0);
  });

  it("niveau 1 → 2 : 9 similaires récents (< 10) → médiane sur les similaires toutes dates", () => {
    const recentSimilar = Array.from({ length: 9 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000, date: "2026-03-01" }),
    );
    // 9 récents + 6 anciens = 15 similaires ≥ 10 → niveau 2
    const oldSimilar = Array.from({ length: 6 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000, date: "2023-01-01" }),
    );
    const stats = computeMarketStats(
      [...recentSimilar, ...oldSimilar],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60, now: NOW },
    );
    expect(stats!.medianOnSimilar).toBe(true);
    expect(stats!.windowMonths).toBe(ALL_DATES_WINDOW_MONTHS); // 41 pour NOW=2026-06
    expect(stats!.sampleSize).toBe(15);
  });

  it("niveau 2 → 3 : 9 similaires toutes dates (< 10) mais 12 récents toutes surfaces → récents", () => {
    // 9 similaires (4 récents + 5 anciens) : niveaux 1 et 2 inaccessibles.
    const similar = [
      ...Array.from({ length: 4 }, () =>
        fakeSale({ surface: 65, pricePerM2: 5000, date: "2026-03-01" }),
      ),
      ...Array.from({ length: 5 }, () =>
        fakeSale({ surface: 65, pricePerM2: 5000, date: "2023-01-01" }),
      ),
    ];
    // 8 autres surfaces récentes → récents toutes surfaces = 4 + 8 = 12 ≥ 10 → niveau 3
    const othersRecent = Array.from({ length: 8 }, () =>
      fakeSale({ surface: 20, pricePerM2: 5000, date: "2026-03-01" }),
    );
    const stats = computeMarketStats(
      [...similar, ...othersRecent],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60, now: NOW },
    );
    expect(stats!.medianOnSimilar).toBe(false);
    expect(stats!.windowMonths).toBe(18);
    expect(stats!.sampleSize).toBe(12);
  });

  it("niveau 3 → 4 : 9 récents toutes surfaces (< 10) → tout l'échantillon retenu", () => {
    // 5 similaires anciens + 4 autres récents + 5 autres anciens :
    // similaires = 5 < 10, récents toutes surfaces = 4 < 10 → niveau 4 (tout kept = 14)
    const oldSimilar = Array.from({ length: 5 }, () =>
      fakeSale({ surface: 65, pricePerM2: 5000, date: "2023-01-01" }),
    );
    const othersRecent = Array.from({ length: 4 }, () =>
      fakeSale({ surface: 20, pricePerM2: 5000, date: "2026-03-01" }),
    );
    const othersOld = Array.from({ length: 5 }, () =>
      fakeSale({ surface: 20, pricePerM2: 5000, date: "2023-01-01" }),
    );
    const stats = computeMarketStats(
      [...oldSimilar, ...othersRecent, ...othersOld],
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60, now: NOW },
    );
    expect(stats!.medianOnSimilar).toBe(false);
    expect(stats!.windowMonths).toBe(ALL_DATES_WINDOW_MONTHS); // 41 pour NOW=2026-06
    expect(stats!.sampleSize).toBe(14);
  });
});

describe("computeMarketStats — dispersion P25/P75", () => {
  // Nearest-rank: P25 = sorted[ceil(n * 0.25) - 1], P75 = sorted[ceil(n * 0.75) - 1]
  // For 8 values [1000,2000,3000,4000,5000,6000,7000,8000] (as pricePerM2):
  //   P25 = ceil(8*0.25)-1 = index 1 → 2000
  //   P75 = ceil(8*0.75)-1 = index 5 → 6000
  it("calcule p25 et p75 exacts sur un ensemble de 8 valeurs connues", () => {
    const prices = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
    const sales = prices.map((p) => fakeSale({ pricePerM2: p }));
    const stats = computeMarketStats(sales, { lat: 47.2251, lon: -1.5265 }, "Appartement");
    expect(stats).not.toBeNull();
    expect(stats!.p25PricePerM2).toBe(2000);
    expect(stats!.p75PricePerM2).toBe(6000);
  });

  it("p25/p75 calculés sur le même sous-ensemble que la médiane (similaires récents)", () => {
    // 12 similaires récents à des prix variés → médiane et dispersion sur ce sous-ensemble
    const recentSimilar = Array.from({ length: 12 }, (_, i) =>
      fakeSale({ surface: 65, pricePerM2: 4000 + i * 400, date: "2026-03-01" }),
    );
    // prix : 4000,4400,4800,5200,5600,6000,6400,6800,7200,7600,8000,8400
    // trié → même suite ; P25 = ceil(12*0.25)-1 = index 2 → 4800
    //                      P75 = ceil(12*0.75)-1 = index 8 → 7200
    const stats = computeMarketStats(
      recentSimilar,
      { lat: 47.2251, lon: -1.5265 },
      "Appartement",
      { surface: 60, now: new Date("2026-06-10") },
    );
    expect(stats).not.toBeNull();
    expect(stats!.medianOnSimilar).toBe(true);
    expect(stats!.p25PricePerM2).toBe(4800);
    expect(stats!.p75PricePerM2).toBe(7200);
  });

  it("p25/p75 présents même sans surface fournie (tout kept)", () => {
    const sales = Array.from({ length: 15 }, (_, i) => fakeSale({ pricePerM2: 3000 + i * 100 }));
    // prix 3000..4400 ; P25 = ceil(15*0.25)-1 = ceil(3.75)-1 = index 3 → 3300
    //                    P75 = ceil(15*0.75)-1 = ceil(11.25)-1 = index 11 → 4100
    const stats = computeMarketStats(sales, { lat: 47.2251, lon: -1.5265 }, "Appartement");
    expect(stats).not.toBeNull();
    expect(stats!.p25PricePerM2).toBe(3300);
    expect(stats!.p75PricePerM2).toBe(4100);
  });
});

describe("fetchCommuneSales", () => {
  it("agrège plusieurs années et tolère un 404", async () => {
    const header = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "fixtures/dvf-sample.csv"),
      "utf8",
    );
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(header, { status: 200 }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const sales = await fetchCommuneSales("44109", { years: [2025, 2026], fetchFn });
    expect(sales.length).toBeGreaterThan(0);
    expect((fetchFn.mock.calls[0]![0] as string)).toBe(
      "https://files.data.gouv.fr/geo-dvf/latest/csv/2025/communes/44/44109.csv",
    );
  });

  it("utilise le département à 3 chiffres pour l'outre-mer", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    await fetchCommuneSales("97411", { years: [2025], fetchFn });
    expect((fetchFn.mock.calls[0]![0] as string)).toContain("/communes/974/97411.csv");
  });
});
