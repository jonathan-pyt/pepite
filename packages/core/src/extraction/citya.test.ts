import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isCityaListingPage, parseCitya } from "./citya";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/citya-annonce.html"),
  "utf8",
);

function docWith(innerHtml: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = innerHtml;
  return doc;
}

function loadDoc(): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = html;
  return doc;
}

const REAL_URL =
  "https://www.citya.com/annonces/vente/appartement/charleville-mezieres-08000/TAPP949326A";

describe("isCityaListingPage", () => {
  it("reconnaît les URLs d'annonces réelles", () => {
    expect(
      isCityaListingPage(
        "https://www.citya.com/annonces/vente/appartement/charleville-mezieres-08000/TAPP949326A",
      ),
    ).toBe(true);
    expect(
      isCityaListingPage(
        "https://www.citya.com/annonces/vente/maison/nantes-44000/TMAI123456A",
      ),
    ).toBe(true);
  });

  it("rejette les pages non-annonces", () => {
    expect(isCityaListingPage("https://www.citya.com/")).toBe(false);
    expect(isCityaListingPage("https://www.citya.com/agences")).toBe(false);
  });
});

describe("parseCitya", () => {
  // ── throw-paths ────────────────────────────────────────────────────────────

  it("jette « structure inconnue » quand aucune donnée structurée n'est trouvée", () => {
    const doc = docWith("<body><h1>Annonce</h1></body>");
    expect(() => parseCitya(doc, REAL_URL)).toThrow(/structure inconnue/i);
  });

  it("jette quand le JSON-LD est illisible", () => {
    const doc = docWith(
      `<body><script type="application/ld+json">{cassé{</script></body>`,
    );
    expect(() => parseCitya(doc, REAL_URL)).toThrow(/structure inconnue/i);
  });

  it("jette quand le JSON-LD ne contient aucun prix", () => {
    const ld = { "@type": "RealEstateListing", name: "Sans prix" };
    const doc = docWith(
      `<body><script type="application/ld+json">${JSON.stringify(ld)}</script></body>`,
    );
    expect(() => parseCitya(doc, REAL_URL)).toThrow(/structure inconnue/i);
  });

  // ── fixture réelle ─────────────────────────────────────────────────────────

  it("extrait un Listing cohérent depuis la fixture réelle", () => {
    const listing = parseCitya(loadDoc(), REAL_URL);
    expect(listing.site).toBe("citya");
    expect(listing.price).toBe(96_000);
    expect(listing.surface).toBeCloseTo(80.52, 1);
    expect(listing.rooms).toBe(3);
    expect(listing.location.postalCode).toBe("08000");
    expect(listing.location.city).toBe("Charleville-Mézières");
    expect(listing.location.postalCode).toMatch(/^\d{5}$/);
    expect(listing.propertyType).toBe("Appartement");
    expect(listing.description.length).toBeGreaterThan(20);
    expect(listing.photos.length).toBeGreaterThan(0);
  });

  it("snapshot stable (hors extractedAt) sur la fixture réelle", () => {
    const listing = parseCitya(loadDoc(), REAL_URL);
    const { extractedAt, ...stable } = listing;
    expect(stable).toMatchSnapshot();
  });

  // ── structure forgée (rétrocompat) ────────────────────────────────────────

  it("extrait un Listing depuis un JSON-LD RealEstateListing avec mainEntity", () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: "Annonce immobilière en vente",
      mainEntity: {
        "@type": "Offer",
        price: 289_000,
        priceCurrency: "EUR",
        itemOffered: {
          "@type": "Apartment",
          name: "Appartement T3 - Nantes",
          description: "Bel appartement de 64 m² proche tram.",
          address: { "@type": "PostalAddress", addressLocality: "Nantes", postalCode: "44000" },
          numberOfRooms: 3,
          floorSize: { "@type": "QuantitativeValue", value: 64, unitText: "m²" },
        },
      },
      image: "https://img.citya.com/1.jpg",
    };
    const doc = docWith(
      `<body><script type="application/ld+json">${JSON.stringify(ld)}</script></body>`,
    );
    const result = parseCitya(doc, REAL_URL);
    expect(result.site).toBe("citya");
    expect(result.price).toBe(289_000);
    expect(result.surface).toBe(64);
    expect(result.rooms).toBe(3);
    expect(result.location.city).toBe("Nantes");
    expect(result.location.postalCode).toBe("44000");
    expect(result.propertyType).toBe("Appartement");
    expect(result.description).toContain("64 m²");
    expect(result.photos).toEqual(["https://img.citya.com/1.jpg"]);
  });

  it("extrait depuis un ancien JSON-LD Product/Offer (rétrocompat)", () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Appartement T3 - Nantes",
      description: "Bel appartement de 64 m² proche tram.",
      offers: { "@type": "Offer", price: "289000", priceCurrency: "EUR" },
      image: ["https://img.citya.com/1.jpg"],
    };
    const doc = docWith(
      `<body><script type="application/ld+json">${JSON.stringify(ld)}</script></body>`,
    );
    const result = parseCitya(doc, REAL_URL);
    expect(result.site).toBe("citya");
    expect(result.title).toBe("Appartement T3 - Nantes");
    expect(result.price).toBe(289_000);
    expect(result.description).toContain("64 m²");
    expect(result.photos).toEqual(["https://img.citya.com/1.jpg"]);
  });
});
