import { describe, expect, it, vi } from "vitest";
import { geocode } from "./geocode";

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
