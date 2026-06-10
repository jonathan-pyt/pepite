import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isLeboncoinListingPage, parseLeboncoin, parseLeboncoinHtml } from "./leboncoin";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/leboncoin-annonce.html"),
  "utf8",
);

function loadDoc(): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = html;
  return doc;
}

function forgeDoc(ad: Record<string, unknown>): Document {
  const doc = document.implementation.createHTMLDocument();
  const script = doc.createElement("script");
  script.id = "__NEXT_DATA__";
  script.type = "application/json";
  script.textContent = JSON.stringify({ props: { pageProps: { ad } } });
  doc.body.appendChild(script);
  return doc;
}

function forgedAd(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subject: "Appartement T3 lumineux centre-ville",
    body: "Bel appartement de 64 m² au cœur de Nantes, proche tram et commerces.",
    price: [289000],
    attributes: [
      { key: "square", value: "64" },
      { key: "rooms", value: "3" },
      { key: "energy_rate", value: "c" },
      { key: "ges", value: "d" },
      { key: "real_estate_type", value: "2" },
    ],
    location: { city: "Nantes", zipcode: "44000", lat: 47.2, lng: -1.55 },
    images: { urls: ["u1"] },
    ...overrides,
  };
}

describe("parseLeboncoin", () => {
  it("détecte une page annonce", () => {
    expect(isLeboncoinListingPage("https://www.leboncoin.fr/ad/ventes_immobilieres/2987654321")).toBe(true);
    expect(isLeboncoinListingPage("https://www.leboncoin.fr/recherche?category=9")).toBe(false);
  });

  it("extrait un Listing cohérent depuis la fixture", () => {
    const listing = parseLeboncoin(loadDoc(), "https://www.leboncoin.fr/ad/ventes_immobilieres/test");
    expect(listing.site).toBe("leboncoin");
    expect(listing.title.length).toBeGreaterThan(5);
    expect(listing.price).toBeGreaterThan(10_000);
    expect(listing.surface).toBeGreaterThan(8);
    expect(listing.surface).toBeLessThan(500);
    expect(listing.location.city?.length).toBeGreaterThan(1);
    expect(listing.location.postalCode).toMatch(/^\d{5}$/);
    if (listing.dpe) expect(listing.dpe).toMatch(/^[A-G]$/);
    expect(listing.description.length).toBeGreaterThan(20);
    const { extractedAt, ...stable } = listing; // extractedAt change à chaque run → hors snapshot
    expect(stable).toMatchSnapshot();
  });

  it("extrait DPE/GES (uppercase) depuis une annonce forgée", () => {
    const listing = parseLeboncoin(
      forgeDoc(forgedAd()),
      "https://www.leboncoin.fr/ad/ventes_immobilieres/forge",
    );
    expect(listing.dpe).toBe("C");
    expect(listing.ges).toBe("D");
    expect(listing.surface).toBe(64);
    expect(listing.propertyType).toBe("Appartement");
    expect(listing.photos).toHaveLength(1);
    expect(listing.location.lat).toBe(47.2);
    expect(listing.location.lon).toBe(-1.55);
  });

  it("ignore un energy_rate hors A-G (« v » = vierge)", () => {
    const ad = forgedAd({
      attributes: [
        { key: "square", value: "64" },
        { key: "rooms", value: "3" },
        { key: "energy_rate", value: "v" },
        { key: "ges", value: "d" },
        { key: "real_estate_type", value: "2" },
      ],
    });
    const listing = parseLeboncoin(
      forgeDoc(ad),
      "https://www.leboncoin.fr/ad/ventes_immobilieres/forge",
    );
    expect(listing.dpe).toBeUndefined();
    expect(listing.ges).toBe("D");
  });

  it("parseLeboncoinHtml extrait un Listing cohérent depuis la fixture HTML (string)", () => {
    const listing = parseLeboncoinHtml(html, "https://www.leboncoin.fr/ad/ventes_immobilieres/test");
    expect(listing.site).toBe("leboncoin");
    expect(listing.title.length).toBeGreaterThan(5);
    expect(listing.price).toBeGreaterThan(10_000);
    expect(listing.surface).toBeGreaterThan(8);
    expect(listing.surface).toBeLessThan(500);
    expect(listing.location.city?.length).toBeGreaterThan(1);
    expect(listing.location.postalCode).toMatch(/^\d{5}$/);
    if (listing.dpe) expect(listing.dpe).toMatch(/^[A-G]$/);
    expect(listing.description.length).toBeGreaterThan(20);
  });

  it("extrait bedrooms, landSurface et attributes depuis une annonce maison forgée avec piscine", () => {
    const ad = forgedAd({
      attributes: [
        { key: "square", value: "120", key_label: "Surface habitable", value_label: "120 m²", generic: true },
        { key: "rooms", value: "5", key_label: "Nombre de pièces", value_label: "5", generic: true },
        { key: "real_estate_type", value: "1", key_label: "Type de bien", value_label: "Maison", generic: true },
        { key: "bedrooms", value: "4", key_label: "Nombre de chambres", value_label: "4", generic: true },
        { key: "land_plot_surface", value: "800", key_label: "Surface du terrain", value_label: "800 m²", generic: true },
        { key: "swimming_pool", value: "1", key_label: "Piscine", value_label: "Oui", generic: true },
        { key: "bathrooms", value: "2", key_label: "Salle de bain", value_label: "2", generic: true },
        { key: "activity_sector", value: "1", value_label: "1", generic: false },
      ],
    });
    const listing = parseLeboncoin(
      forgeDoc(ad),
      "https://www.leboncoin.fr/ad/ventes_immobilieres/forge",
    );
    expect(listing.bedrooms).toBe(4);
    expect(listing.landSurface).toBe(800);
    expect(listing.attributes).toBeDefined();
    expect(listing.attributes!.length).toBeGreaterThan(0);
    expect(listing.attributes).toContainEqual({ label: "Salle de bain", value: "2" });
    expect(listing.attributes).toContainEqual({ label: "Piscine", value: "Oui" });
    expect(listing.attributes).toContainEqual({ label: "Surface du terrain", value: "800 m²" });
    // Technical entry without key_label must be excluded
    expect(listing.attributes!.every((a) => a.label.length > 0)).toBe(true);
  });

  it("attributes depuis la fixture réelle est un tableau non vide avec label+value", () => {
    const listing = parseLeboncoin(loadDoc(), "https://www.leboncoin.fr/ad/ventes_immobilieres/test");
    expect(listing.attributes).toBeDefined();
    expect(Array.isArray(listing.attributes)).toBe(true);
    expect(listing.attributes!.length).toBeGreaterThan(0);
    for (const a of listing.attributes!) {
      expect(typeof a.label).toBe("string");
      expect(a.label.length).toBeGreaterThan(0);
      expect(typeof a.value).toBe("string");
    }
    const { extractedAt, ...stable } = listing;
    expect(stable).toMatchSnapshot();
  });
});
