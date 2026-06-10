import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSelogerListingPage, parseSeloger, parseSelogerHtml } from "./seloger";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/seloger-annonce.html"),
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
  "https://www.seloger.com/annonces/achat/appartement/saint-denis-974/271190031.htm";

describe("isSelogerListingPage", () => {
  it("reconnaît les URLs d'annonces réelles", () => {
    expect(
      isSelogerListingPage(
        "https://www.seloger.com/annonces/achat/appartement/saint-denis-974/271190031.htm",
      ),
    ).toBe(true);
    expect(
      isSelogerListingPage(
        "https://www.seloger.com/annonces/achat-de-prestige/maison/lyon-69/987654321.htm",
      ),
    ).toBe(true);
  });

  it("rejette les pages non-annonces", () => {
    expect(isSelogerListingPage("https://www.seloger.com/immobilier/achat/")).toBe(false);
    expect(isSelogerListingPage("https://www.seloger.com/")).toBe(false);
  });
});

describe("parseSeloger", () => {
  // ── throw-paths ────────────────────────────────────────────────────────────

  it("jette « structure inconnue » quand aucun état embarqué n'est trouvé", () => {
    const doc = docWith("<body><h1>Annonce</h1></body>");
    expect(() => parseSeloger(doc, REAL_URL)).toThrow(/structure inconnue/i);
  });

  it("jette quand le JSON d'état est illisible", () => {
    const doc = docWith(
      `<body><script>window["__UFRN_LIFECYCLE_SERVERREQUEST__"]=JSON.parse("{cassé{");</script></body>`,
    );
    expect(() => parseSeloger(doc, REAL_URL)).toThrow(/structure inconnue/i);
  });

  it("jette quand l'état est présent mais sans prix exploitable", () => {
    const noPriceState = {
      app_cldp: {
        data: {
          classified: {
            metadata: {},
            rawData: { propertyTypeLabel: "Appartement" },
            sections: {
              hardFacts: { title: "Appartement" },
              location: { address: { city: "Paris", zipCode: "75001" } },
              description: { description: "Desc" },
              gallery: { images: [] },
              energy: { certificates: [], features: [] },
              features: { preview: [], details: { categories: [] } },
            },
            legacyTracking: { products: [{ price: 0, space: 50, nb_rooms: 3 }] },
          },
        },
      },
    };
    const escaped = JSON.stringify(JSON.stringify(noPriceState));
    const doc = docWith(
      `<body><script>window["__UFRN_LIFECYCLE_SERVERREQUEST__"]=JSON.parse(${escaped});</script></body>`,
    );
    expect(() => parseSeloger(doc, REAL_URL)).toThrow(/structure inconnue/i);
  });

  // ── fixture réelle ─────────────────────────────────────────────────────────
  // parseSelogerHtml est utilisé pour les tests de fixture car happy-dom peut
  // supprimer les gros scripts inline lors du parsing via innerHTML.

  it("extrait un Listing cohérent depuis la fixture réelle", () => {
    const listing = parseSelogerHtml(html, REAL_URL);
    expect(listing.site).toBe("seloger");
    expect(listing.price).toBe(394_400);
    expect(listing.surface).toBe(89);
    expect(listing.rooms).toBe(4);
    expect(listing.bedrooms).toBe(3);
    expect(listing.location.postalCode).toMatch(/^\d{5}$/);
    expect(listing.location.city).toBe("Saint-Denis");
    expect(listing.location.postalCode).toBe("97400");
    expect(listing.propertyType).toBe("Appartement");
    expect(listing.description.length).toBeGreaterThan(20);
    expect(listing.photos.length).toBeGreaterThan(0);
    expect(listing.attributes).toBeDefined();
    expect(listing.attributes!.length).toBeGreaterThan(0);
    for (const a of listing.attributes!) {
      expect(typeof a.label).toBe("string");
      expect(a.label.length).toBeGreaterThan(0);
      expect(typeof a.value).toBe("string");
    }
  });

  it("snapshot stable (hors extractedAt) sur la fixture réelle", () => {
    const listing = parseSelogerHtml(html, REAL_URL);
    const { extractedAt, ...stable } = listing;
    expect(stable).toMatchSnapshot();
  });
});
