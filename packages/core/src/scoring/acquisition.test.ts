import { describe, expect, it } from "vitest";
import { estimateAcquisitionCost } from "./acquisition";
import type { Listing } from "../types";

const baseListing: Listing = {
  url: "https://www.leboncoin.fr/ad/ventes_immobilieres/1",
  site: "leboncoin",
  title: "Appartement T3 64 m²",
  price: 289_000,
  surface: 64,
  rooms: 3,
  propertyType: "Appartement",
  location: { rawAddress: "Nantes 44000", city: "Nantes", postalCode: "44000" },
  dpe: "C",
  description: "Bel appartement lumineux.",
  photos: [],
  extractedAt: "2026-06-10T00:00:00.000Z",
};

describe("estimateAcquisitionCost", () => {
  it("calcule les frais de notaire à 7,8 % et le total", () => {
    const result = estimateAcquisitionCost(baseListing);
    expect(result.prix).toBe(289_000);
    expect(result.fraisNotairePct).toBe(7.8);
    // fraisNotaire = Math.round(289_000 * 0.078) = 22_542
    expect(result.fraisNotaire).toBe(22_542);
    expect(result.total).toBe(289_000 + 22_542); // 311_542
  });

  it("taxe foncière absente → taxeFonciereAnnuelle undefined", () => {
    const result = estimateAcquisitionCost(baseListing);
    expect(result.taxeFonciereAnnuelle).toBeUndefined();
  });

  it("taxe foncière format '1 200 €' → 1200", () => {
    const listing: Listing = {
      ...baseListing,
      attributes: [{ label: "Taxe foncière", value: "1 200 €" }],
    };
    const result = estimateAcquisitionCost(listing);
    expect(result.taxeFonciereAnnuelle).toBe(1200);
  });

  it("taxe foncière format '1 180 €' (espace insécable) → 1180", () => {
    const listing: Listing = {
      ...baseListing,
      // narrow no-break space (U+202F) used by toLocaleString in some environments
      attributes: [{ label: "Taxe foncière", value: "1 180 €" }],
    };
    const result = estimateAcquisitionCost(listing);
    expect(result.taxeFonciereAnnuelle).toBe(1180);
  });

  it("taxe foncière format '1180' (sans symbole) → 1180", () => {
    const listing: Listing = {
      ...baseListing,
      attributes: [{ label: "Taxe foncière", value: "1180" }],
    };
    const result = estimateAcquisitionCost(listing);
    expect(result.taxeFonciereAnnuelle).toBe(1180);
  });

  it("label insensible à la casse et aux accents partiels (/taxe fonci/i)", () => {
    const listing: Listing = {
      ...baseListing,
      attributes: [{ label: "taxe foncière annuelle", value: "950 €" }],
    };
    const result = estimateAcquisitionCost(listing);
    expect(result.taxeFonciereAnnuelle).toBe(950);
  });

  it("attributes vide → taxeFonciereAnnuelle undefined", () => {
    const listing: Listing = { ...baseListing, attributes: [] };
    const result = estimateAcquisitionCost(listing);
    expect(result.taxeFonciereAnnuelle).toBeUndefined();
  });

  it("attributes absents (undefined) → taxeFonciereAnnuelle undefined", () => {
    const result = estimateAcquisitionCost(baseListing);
    expect(result.taxeFonciereAnnuelle).toBeUndefined();
  });
});
