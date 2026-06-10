import { describe, expect, it } from "vitest";
import { buildQuickAnalysis, scoreLabel } from "./score";
import type { Listing, MarketStats } from "../types";

const listing = {
  price: 289_000,
  surface: 64,
} as Listing;

const market: MarketStats = {
  medianPricePerM2: 4795,
  sampleSize: 42,
  radiusM: 500,
  confidence: "high",
  comparables: [],
};

describe("buildQuickAnalysis", () => {
  it("calcule écart vs marché et score", () => {
    const quick = buildQuickAnalysis(listing, market);
    expect(quick.listingPricePerM2).toBe(4516); // arrondi 289000/64
    expect(quick.marketGapPct).toBeCloseTo(-5.8, 1);
    expect(quick.score).toBeGreaterThanOrEqual(65); // sous la médiane → bon
    expect(quick.score).toBeLessThanOrEqual(98);
    expect(quick.scoreLabel).toBe(scoreLabel(quick.score!));
  });

  it("score borné : très surcoté → faible", () => {
    const cher = buildQuickAnalysis({ ...listing, price: 500_000 } as Listing, market);
    expect(cher.score).toBeLessThan(45);
    expect(cher.score).toBeGreaterThanOrEqual(5);
  });

  it("sans marché : pas de score", () => {
    const quick = buildQuickAnalysis(listing, null);
    expect(quick.score).toBeNull();
    expect(quick.marketGapPct).toBeNull();
    expect(quick.scoreLabel).toBe("Inconnu");
  });

  it("sans surface : pas de prix au m²", () => {
    const quick = buildQuickAnalysis({ price: 289_000 } as Listing, market);
    expect(quick.listingPricePerM2).toBeNull();
    expect(quick.score).toBeNull();
  });
});
