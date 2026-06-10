import { describe, expect, it } from "vitest";
import { parseSeloger } from "./seloger";

function docWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = html;
  return doc;
}

const url = "https://www.seloger.com/annonces/achat/appartement/nantes-44/123456789.htm";

describe("parseSeloger", () => {
  it("jette « structure inconnue » quand aucun état embarqué n'est trouvé", () => {
    const doc = docWith("<body><h1>Annonce</h1></body>");
    expect(() => parseSeloger(doc, url)).toThrow(/structure inconnue/i);
  });

  it("jette quand le script d'état contient un JSON illisible", () => {
    const doc = docWith(
      `<body><script id="__NEXT_DATA__" type="application/json">{cassé{</script></body>`,
    );
    expect(() => parseSeloger(doc, url)).toThrow(/structure inconnue/i);
  });

  it("extrait un Listing depuis une structure __NEXT_DATA__ plausible", () => {
    const listing = {
      title: "Appartement T3 lumineux",
      propertyType: "appartement",
      price: 289000,
      surface: 64,
      rooms: 3,
      city: "Nantes",
      zipCode: "44000",
      district: "Centre-ville",
      energyClassification: "C",
      gasEmissionClassification: "D",
      description: "Bel appartement de 64 m² au cœur de Nantes, proche tram.",
      publicationDate: "2026-05-01",
      photos: ["https://img.seloger.com/1.jpg", "https://img.seloger.com/2.jpg"],
    };
    const data = { props: { pageProps: { listing } } };
    const doc = docWith(
      `<body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body>`,
    );
    const result = parseSeloger(doc, url);
    expect(result.site).toBe("seloger");
    expect(result.title).toBe("Appartement T3 lumineux");
    expect(result.price).toBe(289000);
    expect(result.surface).toBe(64);
    expect(result.rooms).toBe(3);
    expect(result.propertyType).toBe("Appartement");
    expect(result.location.city).toBe("Nantes");
    expect(result.location.postalCode).toBe("44000");
    expect(result.location.district).toBe("Centre-ville");
    expect(result.dpe).toBe("C");
    expect(result.ges).toBe("D");
    expect(result.photos).toHaveLength(2);
    expect(result.publishedAt).toBe("2026-05-01");
  });

  it("jette quand l'état est présent mais sans prix exploitable", () => {
    const data = { props: { pageProps: { listing: { title: "Sans prix" } } } };
    const doc = docWith(
      `<body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body>`,
    );
    expect(() => parseSeloger(doc, url)).toThrow(/structure inconnue/i);
  });
});
