import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isLeboncoinListingPage, parseLeboncoin } from "./leboncoin";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/leboncoin-annonce.html"),
  "utf8",
);

function loadDoc(): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = html;
  return doc;
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
});
