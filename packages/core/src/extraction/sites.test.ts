import { describe, expect, it } from "vitest";
import { detectSite, isListingPage } from "./sites";

describe("detectSite", () => {
  const cases: [string, ReturnType<typeof detectSite>][] = [
    ["https://www.leboncoin.fr/ad/ventes_immobilieres/2987654321", "leboncoin"],
    ["https://www.leboncoin.fr/recherche?category=9", "leboncoin"],
    ["https://www.seloger.com/annonces/achat/appartement/nantes-44/123456789.htm", "seloger"],
    ["https://www.seloger.com/immobilier/achat/", "seloger"],
    ["https://www.bienici.com/annonce/vente/nantes/appartement/3pieces/abc-123", "bienici"],
    ["https://www.bienici.com/recherche/achat/nantes-44000", "bienici"],
    ["https://www.citya.com/annonces/achat/appartement/nantes/123", "citya"],
    ["https://www.citya.com/", "citya"],
    ["https://example.com/some/page", null],
    ["https://www.pap.fr/annonce/123", null],
  ];

  for (const [url, expected] of cases) {
    it(`${url} → ${expected}`, () => {
      expect(detectSite(url)).toBe(expected);
    });
  }
});

describe("isListingPage", () => {
  const trueCases = [
    "https://www.leboncoin.fr/ad/ventes_immobilieres/2987654321",
    "https://www.leboncoin.fr/ad/immobilier/123456",
    "https://www.seloger.com/annonces/achat/appartement/nantes-44/123456789.htm",
    "https://www.seloger.com/annonces/achat-de-prestige/maison/lyon-69/987654321.htm",
    "https://www.bienici.com/annonce/vente/nantes/appartement/3pieces/abc-123",
    "https://www.bienici.com/annonce/location/paris/maison/5pieces/xyz-789",
    "https://www.citya.com/annonce/12345",
    "https://www.citya.com/annonces/location/appartement/nantes/67890",
  ];

  const falseCases = [
    "https://www.leboncoin.fr/recherche?category=9",
    "https://www.leboncoin.fr/",
    "https://www.seloger.com/immobilier/achat/nantes-44000/",
    "https://www.seloger.com/",
    "https://www.bienici.com/recherche/achat/nantes-44000",
    "https://www.bienici.com/",
    "https://www.citya.com/",
    "https://www.citya.com/agences",
    "https://example.com/annonce/123",
  ];

  for (const url of trueCases) {
    it(`true: ${url}`, () => {
      expect(isListingPage(url)).toBe(true);
    });
  }
  for (const url of falseCases) {
    it(`false: ${url}`, () => {
      expect(isListingPage(url)).toBe(false);
    });
  }
});
