import { describe, expect, it } from "vitest";
import { parseCitya } from "./citya";

function docWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = html;
  return doc;
}

const url = "https://www.citya.com/annonce/12345";

describe("parseCitya", () => {
  it("jette « structure inconnue » quand aucune donnée structurée n'est trouvée", () => {
    const doc = docWith("<body><h1>Annonce</h1></body>");
    expect(() => parseCitya(doc, url)).toThrow(/structure inconnue/i);
  });

  it("jette quand le JSON-LD est illisible", () => {
    const doc = docWith(
      `<body><script type="application/ld+json">{cassé{</script></body>`,
    );
    expect(() => parseCitya(doc, url)).toThrow(/structure inconnue/i);
  });

  it("extrait un Listing depuis un JSON-LD Product/Offer plausible", () => {
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
    const result = parseCitya(doc, url);
    expect(result.site).toBe("citya");
    expect(result.title).toBe("Appartement T3 - Nantes");
    expect(result.price).toBe(289000);
    expect(result.description).toContain("64 m²");
    expect(result.photos).toEqual(["https://img.citya.com/1.jpg"]);
  });

  it("gère un tableau JSON-LD (@graph) et y trouve l'offre", () => {
    const ld = [
      { "@type": "Organization", name: "Citya" },
      {
        "@type": "Product",
        name: "Maison - Lyon",
        offers: { price: 350000 },
      },
    ];
    const doc = docWith(
      `<body><script type="application/ld+json">${JSON.stringify(ld)}</script></body>`,
    );
    const result = parseCitya(doc, url);
    expect(result.title).toBe("Maison - Lyon");
    expect(result.price).toBe(350000);
  });

  it("jette quand le JSON-LD ne contient aucun prix", () => {
    const ld = { "@type": "Product", name: "Sans prix" };
    const doc = docWith(
      `<body><script type="application/ld+json">${JSON.stringify(ld)}</script></body>`,
    );
    expect(() => parseCitya(doc, url)).toThrow(/structure inconnue/i);
  });
});
