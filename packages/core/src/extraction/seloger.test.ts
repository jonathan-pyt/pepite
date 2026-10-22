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

// Format en ligne depuis l'automne 2026 : /annonce/{projet}/{région}/{dépt}/{ville}/{réf}
const newHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/seloger-annonce-2026-10.html"),
  "utf8",
);
const NEW_URL =
  "https://www.seloger.com/annonce/achat/ile-de-france/paris-75/paris-75000/26SNZN4PBSMG";

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

  it("reconnaît le format d'URL d'octobre 2026 (/annonce/…/REF)", () => {
    expect(isSelogerListingPage(NEW_URL)).toBe(true);
    expect(isSelogerListingPage(`${NEW_URL}?projectType=1#photos`)).toBe(true);
    expect(isSelogerListingPage(`${NEW_URL}/`)).toBe(true);
    expect(isSelogerListingPage(NEW_URL.replace("26SNZN4PBSMG", "26snzn4pbsmg"))).toBe(true);
  });

  it("exige au moins deux segments avant la référence", () => {
    expect(isSelogerListingPage("https://www.seloger.com/annonce/x/ABCDEFG1")).toBe(false);
    expect(isSelogerListingPage("https://www.seloger.com/annonce/achat/AD08FR31096")).toBe(false);
  });

  it("rejette les pages non-annonces", () => {
    expect(isSelogerListingPage("https://www.seloger.com/immobilier/achat/")).toBe(false);
    expect(isSelogerListingPage("https://www.seloger.com/")).toBe(false);
    expect(
      isSelogerListingPage(
        "https://www.seloger.com/recherche/achat/immobilier/ile-de-france/paris-75000/ad08fr31096",
      ),
    ).toBe(false);
    expect(
      isSelogerListingPage("https://www.seloger.com/depot-annonce/location?m=header"),
    ).toBe(false);
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

  // ── DPE / GES ──────────────────────────────────────────────────────────────

  function docWithEnergy(certificates: unknown[]): Document {
    const state = {
      app_cldp: {
        data: {
          classified: {
            sections: { energy: { certificates } },
            legacyTracking: { products: [{ price: 200_000, space: 50 }] },
          },
        },
      },
    };
    const escaped = JSON.stringify(JSON.stringify(state));
    return docWith(
      `<body><script>window["__UFRN_LIFECYCLE_SERVERREQUEST__"]=JSON.parse(${escaped});</script></body>`,
    );
  }

  it("garde l'ancienne forme : un certificat par échelle, sans type", () => {
    const doc = docWithEnergy([{ scales: [{ rating: "E" }] }, { scales: [{ rating: "B" }] }]);
    const listing = parseSeloger(doc, NEW_URL);
    expect(listing.dpe).toBe("E");
    expect(listing.ges).toBe("B");
  });

  it("reconnaît une échelle GES typée GES (et pas seulement GHG)", () => {
    const doc = docWithEnergy([
      {
        scales: [
          { type: "FR_ENERGY_BEFORE_2021", efficiencyClass: { rating: "F" } },
          { type: "FR_GES_BEFORE_2021", efficiencyClass: { rating: "G" } },
        ],
      },
    ]);
    const listing = parseSeloger(doc, NEW_URL);
    expect(listing.dpe).toBe("F");
    expect(listing.ges).toBe("G");
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

  it("extrait un Listing cohérent depuis la fixture réelle d'octobre 2026", () => {
    const listing = parseSelogerHtml(newHtml, NEW_URL);
    expect(listing.price).toBe(1_820_000);
    expect(listing.surface).toBe(171);
    expect(listing.rooms).toBe(6);
    expect(listing.bedrooms).toBe(5);
    expect(listing.location.city).toBe("Paris 15ème arrondissement");
    expect(listing.location.postalCode).toBe("75015");
    expect(listing.propertyType).toBe("Appartement");
    expect(listing.photos).toHaveLength(4);
  });

  it("lit DPE et GES dans efficiencyClass (certificat unique à deux échelles)", () => {
    const listing = parseSelogerHtml(newHtml, NEW_URL);
    expect(listing.dpe).toBe("D");
    expect(listing.ges).toBe("C");
  });

  it("snapshot stable (hors extractedAt) sur la fixture réelle", () => {
    const listing = parseSelogerHtml(html, REAL_URL);
    const { extractedAt, ...stable } = listing;
    expect(stable).toMatchSnapshot();
  });
});
