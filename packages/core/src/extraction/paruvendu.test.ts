import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isParuvenduListingPage, parseParuvendu } from "./paruvendu";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/paruvendu-annonce.html"),
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

const REAL_URL = "https://www.paruvendu.fr/immobilier/vente/maison/1291571535A1KIVHMN000";

describe("isParuvenduListingPage", () => {
  it("reconnaît les URLs d'annonces de vente", () => {
    expect(isParuvenduListingPage(REAL_URL)).toBe(true);
    expect(
      isParuvenduListingPage("https://www.paruvendu.fr/immobilier/vente/appartement/1296202419A1KIVHAP000"),
    ).toBe(true);
    expect(isParuvenduListingPage(`${REAL_URL}?origine=liste#photos`)).toBe(true);
  });

  it("rejette les pages de liste", () => {
    expect(isParuvenduListingPage("https://www.paruvendu.fr/")).toBe(false);
    expect(isParuvenduListingPage("https://www.paruvendu.fr/immobilier/vente/maison/")).toBe(false);
    expect(
      isParuvenduListingPage("https://www.paruvendu.fr/immobilier/vente/maison/drancy-93700/"),
    ).toBe(false);
  });

  it("rejette les locations, que le pipeline compare à tort aux prix de vente", () => {
    expect(
      isParuvenduListingPage("https://www.paruvendu.fr/immobilier/location/appartement/1296202419A1KILHAP000"),
    ).toBe(false);
  });
});

describe("parseParuvendu", () => {
  it.each([
    ["sans bloc prix", "<body><h1 id='detail_h1'>Annonce</h1></body>"],
    ["avec un prix sans montant", "<body><div id='autoprix'>Prix sur demande</div></body>"],
  ])("jette « structure inconnue » sur une page %s", (_, body) => {
    expect(() => parseParuvendu(docWith(body), REAL_URL)).toThrow(/structure inconnue/i);
  });

  it("ne lit que le premier montant du bloc prix", () => {
    const doc = docWith(
      "<body><div id='autoprix'><span>359 000 €</span><s>380 000 €</s> dont 12 000 € d'honoraires</div></body>",
    );
    expect(parseParuvendu(doc, REAL_URL).price).toBe(359_000);
  });

  it("lit une surface à séparateur de milliers", () => {
    const doc = docWith(
      "<body><div id='autoprix'>1 200 000 €</div><ul>" +
        "<li><span class='uppercase'>Surface</span><br><span> 1 250m2 environ </span></li>" +
        "</ul></body>",
    );
    expect(parseParuvendu(doc, REAL_URL).surface).toBe(1_250);
  });

  it("extrait un Listing cohérent depuis la fixture réelle", () => {
    const listing = parseParuvendu(loadDoc(), REAL_URL);
    expect(listing.site).toBe("paruvendu");
    expect(listing.price).toBe(359_000);
    expect(listing.surface).toBe(93);
    expect(listing.rooms).toBe(5);
    expect(listing.bedrooms).toBe(4);
    expect(listing.landSurface).toBeUndefined();
    expect(listing.propertyType).toBe("Maison");
    expect(listing.dpe).toBe("C");
    expect(listing.ges).toBe("A");
    expect(listing.location.city).toBe("Drancy");
    expect(listing.location.postalCode).toBe("93700");
    expect(listing.title).toMatch(/Drancy/);
    expect(listing.attributes).toEqual([
      { label: "Équipement", value: "Parking / Garage" },
      { label: "Équipement", value: "Balcon / Terrasse" },
      { label: "Équipement", value: "Jardin / Terrain" },
    ]);
  });

  it("garde la description complète, sans le bandeau de localisation", () => {
    const { description } = parseParuvendu(loadDoc(), REAL_URL);
    expect(description).toContain("Superficie terrain : 253");
    expect(description).toContain("\nAu rez-de-chaussée :\n•Une entrée\n");
    expect(description).not.toContain("Lieu :");
  });

  it("ne garde que les photos de la galerie, pas celles des annonces similaires", () => {
    const { photos } = parseParuvendu(loadDoc(), REAL_URL);
    expect(photos).toHaveLength(5);
    for (const p of photos) expect(p).toMatch(/^https:\/\/img\.paruvendu\.fr\//);
    expect(new Set(photos).size).toBe(photos.length);
  });

  it("se replie sur le <title> quand le fil d'Ariane manque", () => {
    const doc = docWith(
      "<head><title>Annonce vente maison 4 pièces de 80m2 à Nantes (44000) - ParuVendu.fr</title></head>" +
        "<body><div id='autoprix'>250 000 €</div></body>",
    );
    const listing = parseParuvendu(doc, REAL_URL);
    expect(listing.location.city).toBe("Nantes");
    expect(listing.location.postalCode).toBe("44000");
    expect(listing.photos).toEqual([]);
    expect(listing.attributes).toBeUndefined();
  });

  it("snapshot stable (hors extractedAt) sur la fixture réelle", () => {
    const { extractedAt, ...stable } = parseParuvendu(loadDoc(), REAL_URL);
    expect(stable).toMatchSnapshot();
  });
});
