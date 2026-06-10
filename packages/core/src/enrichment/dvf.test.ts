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
