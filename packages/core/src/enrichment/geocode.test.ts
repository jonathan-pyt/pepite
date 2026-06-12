import { describe, expect, it, vi } from "vitest";
import type { GeoPoint } from "../types";
import { correctedLocation, geocode } from "./geocode";

const banResponse = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-1.526742, 47.225097] },
      properties: {
        label: "Rue de la Ville en Pierre 44000 Nantes",
        score: 0.98185,
        citycode: "44109",
        city: "Nantes",
        type: "street",
      },
    },
  ],
};

describe("geocode", () => {
  it("retourne un GeoPoint depuis la réponse BAN", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(banResponse), { status: 200 }),
    );
    const point = await geocode("rue de la Ville-en-Pierre Nantes", { fetchFn });
    expect(point).toEqual({
      lat: 47.225097,
      lon: -1.526742,
      citycode: "44109",
      label: "Rue de la Ville en Pierre 44000 Nantes",
      score: 0.98185,
      precision: "street",
    });
    const calledUrl = fetchFn.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("https://data.geopf.fr/geocodage/search");
    expect(calledUrl).toContain("limit=1");
  });

  it("retourne null si aucun résultat", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 }),
    );
    expect(await geocode("xyzzy introuvable", { fetchFn })).toBeNull();
  });

  it("jette une erreur explicite si HTTP != 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("oops", { status: 503 }));
    await expect(geocode("Nantes", { fetchFn })).rejects.toThrow(/geocodage BAN: HTTP 503/);
  });
});

describe("correctedLocation", () => {
  const point: GeoPoint = {
    lat: -20.8823,
    lon: 55.4504,
    citycode: "97411",
    label: "12 Rue des Lilas 97400 Saint-Denis",
    score: 0.95,
    precision: "housenumber",
  };

  it("reconstruit la localisation depuis la saisie et le géocodage", () => {
    expect(correctedLocation("12 rue des Lilas, Saint-Denis", point)).toEqual({
      rawAddress: "12 rue des Lilas, Saint-Denis",
      lat: -20.8823,
      lon: 55.4504,
      precision: "housenumber",
      postalCode: "97400",
      city: "Saint-Denis",
      locationCorrected: true,
    });
  });

  it("extrait la ville même composée (label BAN multi-mots)", () => {
    const p: GeoPoint = { ...point, label: "Rue Jean Jaurès 97438 Sainte-Marie", precision: "street" };
    const loc = correctedLocation("rue jean jaurès sainte-marie", p);
    expect(loc.postalCode).toBe("97438");
    expect(loc.city).toBe("Sainte-Marie");
  });

  it("utilise le label comme ville pour une municipalité (label sans code postal)", () => {
    const p: GeoPoint = { ...point, label: "Saint-Denis", precision: "municipality" };
    const loc = correctedLocation("Saint-Denis", p);
    expect(loc.city).toBe("Saint-Denis");
    expect(loc.postalCode).toBeUndefined();
  });

  it("omet ville et code postal si le label ne les expose pas", () => {
    const p: GeoPoint = { ...point, label: "Rue des Lilas", precision: "street" };
    const loc = correctedLocation("rue des Lilas", p);
    expect(loc.city).toBeUndefined();
    expect(loc.postalCode).toBeUndefined();
  });

  it("abandonne le district (n'a plus de sens après correction)", () => {
    expect(correctedLocation("Saint-Denis", point).district).toBeUndefined();
  });
});
