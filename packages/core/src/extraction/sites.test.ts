import { describe, expect, it } from "vitest";
import { detectSite, isListingPage } from "./sites";

describe("detectSite", () => {
  const cases: [string, ReturnType<typeof detectSite>][] = [
    ["https://www.leboncoin.fr/ad/ventes_immobilieres/2987654321", "leboncoin"],
    ["https://www.leboncoin.fr/recherche?category=9", "leboncoin"],
    ["https://www.seloger.com/annonces/achat/appartement/saint-denis-974/271190031.htm", "seloger"],
    ["https://www.seloger.com/immobilier/achat/", "seloger"],
    ["https://www.bienici.com/annonce/vente/nantes/appartement/3pieces/abc-123", "bienici"],
    ["https://www.bienici.com/recherche/achat/nantes-44000", "bienici"],
    ["https://www.citya.com/annonces/vente/appartement/charleville-mezieres-08000/TAPP949326A", "citya"],
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
    // leboncoin
    "https://www.leboncoin.fr/ad/ventes_immobilieres/2987654321",
    "https://www.leboncoin.fr/ad/immobilier/123456",
    // seloger — real URL format
    "https://www.seloger.com/annonces/achat/appartement/saint-denis-974/271190031.htm",
    "https://www.seloger.com/annonces/achat-de-prestige/maison/lyon-69/987654321.htm",
    // bienici
    "https://www.bienici.com/annonce/vente/nantes/appartement/3pieces/abc-123",
    "https://www.bienici.com/annonce/location/paris/maison/5pieces/xyz-789",
    // bienici — observed ref formats
    "https://www.bienici.com/annonce/vente/type/pieces/guy-hoquet-immo-facile-7263996",
    "https://www.bienici.com/annonce/vente/type/pieces/ag442125-497051288",
    // citya — real URL format
    "https://www.citya.com/annonces/vente/appartement/charleville-mezieres-08000/TAPP949326A",
    "https://www.citya.com/annonces/vente/maison/nantes-44000/TMAI123456A",
    "https://www.citya.com/annonces/location/appartement/paris-75001/TAPP000001",
  ];

  const falseCases = [
    // leboncoin
    "https://www.leboncoin.fr/recherche?category=9",
    "https://www.leboncoin.fr/",
    // seloger — non-listing pages
    "https://www.seloger.com/immobilier/achat/nantes-44000/",
    "https://www.seloger.com/",
    // bienici
    "https://www.bienici.com/recherche/achat/nantes-44000",
    "https://www.bienici.com/",
    // citya — non-listing pages
    "https://www.citya.com/",
    "https://www.citya.com/agences",
    "https://www.citya.com/agences-immobilieres/charleville-mezieres-08000/614",
    // unrelated
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
