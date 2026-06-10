import { describe, expect, it } from "vitest";
import { parseBienici } from "./bienici";

function docWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = html;
  return doc;
}

const url = "https://www.bienici.com/annonce/vente/nantes/appartement/3pieces/abc-123";

describe("parseBienici", () => {
  it("jette « structure inconnue » quand aucun état embarqué n'est trouvé", () => {
    const doc = docWith("<body><h1>Annonce</h1></body>");
    expect(() => parseBienici(doc, url)).toThrow(/structure inconnue/i);
  });

  it("jette quand le script d'état contient un JSON illisible", () => {
    const doc = docWith(
      `<body><script type="application/json" data-testid="ad">{cassé{</script></body>`,
    );
    expect(() => parseBienici(doc, url)).toThrow(/structure inconnue/i);
  });

  it("extrait un Listing depuis une structure JSON plausible (ld+json ou état)", () => {
    const ad = {
      title: "Appartement 3 pièces",
      propertyType: "flat",
      price: 289000,
      surfaceArea: 64,
      roomsQuantity: 3,
      city: "Nantes",
      postalCode: "44000",
      district: { name: "Centre-ville" },
      energyClassification: "C",
      greenhouseGazClassification: "D",
      description: "Bel appartement de 64 m² proche tram.",
      publicationDate: "2026-05-01T00:00:00Z",
      photos: [{ url: "https://photo.bienici.com/1.jpg" }],
    };
    const doc = docWith(
      `<body><script type="application/json" data-testid="ad-data">${JSON.stringify(ad)}</script></body>`,
    );
    const result = parseBienici(doc, url);
    expect(result.site).toBe("bienici");
    expect(result.title).toBe("Appartement 3 pièces");
    expect(result.price).toBe(289000);
    expect(result.surface).toBe(64);
    expect(result.rooms).toBe(3);
    expect(result.propertyType).toBe("Appartement");
    expect(result.location.city).toBe("Nantes");
    expect(result.location.postalCode).toBe("44000");
    expect(result.location.district).toBe("Centre-ville");
    expect(result.dpe).toBe("C");
    expect(result.ges).toBe("D");
    expect(result.photos).toEqual(["https://photo.bienici.com/1.jpg"]);
    expect(result.publishedAt).toBe("2026-05-01T00:00:00Z");
  });

  it("propertyType « house » → Maison", () => {
    const ad = { title: "Maison", propertyType: "house", price: 350000, city: "Lyon" };
    const doc = docWith(
      `<body><script type="application/json" data-testid="ad-data">${JSON.stringify(ad)}</script></body>`,
    );
    expect(parseBienici(doc, url).propertyType).toBe("Maison");
  });

  it("jette quand l'état est présent mais sans prix exploitable", () => {
    const ad = { title: "Sans prix" };
    const doc = docWith(
      `<body><script type="application/json" data-testid="ad-data">${JSON.stringify(ad)}</script></body>`,
    );
    expect(() => parseBienici(doc, url)).toThrow(/structure inconnue/i);
  });
});
