import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parseDvfCsv, computeMarketStats, fetchCommuneSales } from "./dvf";

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

  it("niveau 2 : 4 similaires récents + 8 similaires anciens → médiane sur les 12 similaires, windowMonths 36", () => {
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
    expect(stats!.windowMonths).toBe(36);
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

  it("niveau 4 : pas de surface, 5 récents + 6 anciens → tout kept, windowMonths 36", () => {
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
    expect(stats!.windowMonths).toBe(36);
    expect(stats!.sampleSize).toBe(11);
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
