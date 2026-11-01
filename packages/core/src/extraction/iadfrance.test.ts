import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isIadfranceListingPage, parseIadfrance } from "./iadfrance";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/iadfrance-annonce.html"),
  "utf8",
);

function docWith(innerHtml: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = innerHtml;
  return doc;
}

function loadDoc(): Document {
  return docWith(html);
}

const REAL_URL = "https://www.iadfrance.fr/annonce/maison-vente-5-pieces-cauville-150m2/r1946966";

describe("isIadfranceListingPage", () => {
  it("reconnaît les URLs d'annonces de vente", () => {
    expect(isIadfranceListingPage(REAL_URL)).toBe(true);
    expect(
      isIadfranceListingPage(
        "https://www.iadfrance.fr/annonce/appartement-vente-4-pieces-paris-126m2/r2137679",
      ),
    ).toBe(true);
    expect(isIadfranceListingPage(`${REAL_URL}?origine=liste#photos`)).toBe(true);
  });

  it("rejette les pages de liste", () => {
    expect(isIadfranceListingPage("https://www.iadfrance.fr/")).toBe(false);
    expect(isIadfranceListingPage("https://www.iadfrance.fr/annonces/vente/maison")).toBe(false);
    expect(
      isIadfranceListingPage("https://www.iadfrance.fr/annonces/cauville-14770/vente/maison"),
    ).toBe(false);
  });

  it("rejette les locations, que le pipeline compare à tort aux prix de vente", () => {
    expect(
      isIadfranceListingPage(
        "https://www.iadfrance.fr/annonce/appartement-location-2-pieces-bordeaux-32m2/r2044797",
      ),
    ).toBe(false);
  });
});

describe("parseIadfrance", () => {
  it("jette « structure inconnue » sans JSON-LD", () => {
    expect(() => parseIadfrance(docWith("<body><h1>Annonce</h1></body>"), REAL_URL)).toThrow(
      /structure inconnue/i,
    );
  });

  it("jette « structure inconnue » sans prix exploitable dans l'offre", () => {
    const doc = docWith(
      '<script type="application/ld+json">{"@graph":[' +
        '{"@type":"SingleFamilyResidence","address":{"addressLocality":"Nantes","postalCode":"44000"},"floorSize":{"value":80}},' +
        '{"@type":"Offer","price":"Prix sur demande"}' +
        "]}</script>",
    );
    expect(() => parseIadfrance(doc, REAL_URL)).toThrow(/structure inconnue/i);
  });

  it("extrait un Listing cohérent depuis la fixture réelle", () => {
    const listing = parseIadfrance(loadDoc(), REAL_URL);
    expect(listing.site).toBe("iadfrance");
    expect(listing.price).toBe(375_000);
    expect(listing.surface).toBe(150);
    expect(listing.rooms).toBe(5);
    expect(listing.bedrooms).toBe(2);
    expect(listing.propertyType).toBe("Maison");
    expect(listing.dpe).toBe("E");
    expect(listing.ges).toBe("E");
    expect(listing.location.city).toBe("Cauville");
    expect(listing.location.postalCode).toBe("14770");
    expect(listing.title).toMatch(/Cauville/);
  });

  it("garde la description complète du bien", () => {
    const { description } = parseIadfrance(loadDoc(), REAL_URL);
    expect(description).toContain("Ancien corps de ferme");
    expect(description).toContain("Terrain de 15 040 m²");
  });

  it("ne garde que les photos de la galerie principale, sans doublon", () => {
    const { photos } = parseIadfrance(loadDoc(), REAL_URL);
    expect(photos.length).toBeGreaterThan(0);
    for (const p of photos) expect(p).toMatch(/^https:\/\/images\.iadfrance\.fr\/property\/broadcast\//);
    expect(new Set(photos).size).toBe(photos.length);
  });

  it("se replie sur le <h1> quand l'og:title manque", () => {
    const doc = docWith(
      '<script type="application/ld+json">{"@graph":[' +
        '{"@type":"Apartment","address":{"addressLocality":"Nantes","postalCode":"44000"},"floorSize":{"value":80},"numberOfRooms":4,"numberOfBedrooms":2},' +
        '{"@type":"Offer","price":"250 000 €"}' +
        "]}</script><body><h1>Appartement à vendre 4 pièces 80 m² Nantes</h1></body>",
    );
    const listing = parseIadfrance(doc, REAL_URL);
    expect(listing.title).toBe("Appartement à vendre 4 pièces 80 m² Nantes");
    expect(listing.propertyType).toBe("Appartement");
    expect(listing.price).toBe(250_000);
    expect(listing.photos).toEqual([]);
  });

  it("snapshot stable (hors extractedAt) sur la fixture réelle", () => {
    const { extractedAt, ...stable } = parseIadfrance(loadDoc(), REAL_URL);
    expect(stable).toMatchSnapshot();
  });
});
