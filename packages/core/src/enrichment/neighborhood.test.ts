import { describe, it, expect, vi } from "vitest";
import { parseOverpass, fetchNeighborhood } from "./neighborhood";
import fixtureJson from "./fixtures/overpass-sample.json";

// Center used for all parseOverpass tests
const CENTER_LAT = 48.86;
const CENTER_LON = 2.336;
const RADIUS_M = 800;

describe("parseOverpass", () => {
  it("counts correct elements in each category", () => {
    const stats = parseOverpass(fixtureJson, CENTER_LAT, CENTER_LON, RADIUS_M);

    // 3 écoles : school(1001), kindergarten(1002), college way(2001)
    expect(stats.ecoles.count).toBe(3);

    // 3 commerces : supermarket(3001), bakery(3002), butcher(3003)
    expect(stats.commerces.count).toBe(3);

    // 2 santé : pharmacy(4001), doctors(4002)
    expect(stats.sante.count).toBe(2);

    // 3 transports après dédup PTv2 : bus_stop 5001 (dédupliqué), bus_stop 5002, station 5003
    expect(stats.transports.count).toBe(3);

    // 2 espaces verts : park way(6001), garden(6002)
    expect(stats.espacesVerts.count).toBe(2);
  });

  it("radiusM est propagé tel quel", () => {
    const stats = parseOverpass(fixtureJson, CENTER_LAT, CENTER_LON, RADIUS_M);
    expect(stats.radiusM).toBe(RADIUS_M);
  });

  it("nearest contient au plus 3 éléments nommés triés par distance", () => {
    const stats = parseOverpass(fixtureJson, CENTER_LAT, CENTER_LON, RADIUS_M);

    // écoles nearest : college(92m), school(111m), kindergarten(184m)
    expect(stats.ecoles.nearest).toHaveLength(3);
    expect(stats.ecoles.nearest[0]).toEqual({ name: "Collège Victor Hugo", distanceM: 92 });
    expect(stats.ecoles.nearest[1]).toEqual({ name: "École Jules Ferry", distanceM: 111 });
    expect(stats.ecoles.nearest[2]).toEqual({ name: "Maternelle Les Lilas", distanceM: 184 });
  });

  it("nearest ne contient que des éléments nommés (bus_stop sans name exclu)", () => {
    const stats = parseOverpass(fixtureJson, CENTER_LAT, CENTER_LON, RADIUS_M);

    // transports : Gare du Nord (76m), Arrêt République (90m) — le bus_stop 5002 sans name exclu de nearest
    expect(stats.transports.nearest).toHaveLength(2);
    expect(stats.transports.nearest[0]).toEqual({ name: "Gare du Nord", distanceM: 76 });
    expect(stats.transports.nearest[1]).toEqual({ name: "Arrêt République", distanceM: 90 });
  });

  it("déduplique les arrêts PTv2 (même id, deux entrées dans le JSON)", () => {
    // Le fixture contient deux fois l'id 5001 (bus_stop + PTv2 stop_position)
    // On doit compter 3 transports, pas 4
    const stats = parseOverpass(fixtureJson, CENTER_LAT, CENTER_LON, RADIUS_M);
    expect(stats.transports.count).toBe(3);
  });

  it("nearest déduplique par nom (arrêts jumeaux, un par sens) mais le count les garde", () => {
    // Deux arrêts physiques distincts (ids différents) nommés pareil : un seul dans nearest,
    // celui le plus proche ; le count reste 2.
    const json = {
      elements: [
        { type: "node", id: 7001, lat: 48.8605, lon: 2.336, tags: { highway: "bus_stop", name: "Pierre Aubert" } },
        { type: "node", id: 7002, lat: 48.861, lon: 2.336, tags: { highway: "bus_stop", name: "Pierre Aubert" } },
      ],
    };
    const stats = parseOverpass(json, CENTER_LAT, CENTER_LON, RADIUS_M);
    expect(stats.transports.count).toBe(2);
    // un seul élément : le plus proche des deux
    expect(stats.transports.nearest).toEqual([{ name: "Pierre Aubert", distanceM: 56 }]);
  });

  it("utilise le center des ways pour calculer la distance", () => {
    const stats = parseOverpass(fixtureJson, CENTER_LAT, CENTER_LON, RADIUS_M);

    // park way 6001 center=(48.8603, 2.3368) → 67m
    expect(stats.espacesVerts.nearest[0]).toEqual({ name: "Square de la Liberté", distanceM: 67 });
  });

  it("driving_school n'est pas classé dans écoles", () => {
    const stats = parseOverpass(fixtureJson, CENTER_LAT, CENTER_LON, RADIUS_M);
    // driving_school (id=9001) ne doit pas augmenter le count des écoles
    expect(stats.ecoles.count).toBe(3);
    const ecolesNames = stats.ecoles.nearest.map((n) => n.name);
    expect(ecolesNames).not.toContain("Auto-École Nationale");
  });

  it("retourne des compteurs à zéro sur un JSON vide", () => {
    const empty = { elements: [] };
    const stats = parseOverpass(empty, CENTER_LAT, CENTER_LON, RADIUS_M);
    expect(stats.ecoles.count).toBe(0);
    expect(stats.ecoles.nearest).toHaveLength(0);
    expect(stats.transports.count).toBe(0);
  });

  it("distances commerces cohérentes", () => {
    const stats = parseOverpass(fixtureJson, CENTER_LAT, CENTER_LON, RADIUS_M);
    // Monoprix (3001) → 171m, Boucherie Centrale (3003) → 219m, Boulangerie (3002) → 314m
    expect(stats.commerces.nearest[0]).toEqual({ name: "Monoprix", distanceM: 171 });
    expect(stats.commerces.nearest[1]).toEqual({ name: "Boucherie Centrale", distanceM: 219 });
    expect(stats.commerces.nearest[2]).toEqual({ name: "Boulangerie du Marché", distanceM: 314 });
  });
});

describe("fetchNeighborhood", () => {
  it("appelle le premier endpoint et retourne les stats parsées", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => fixtureJson,
    });

    const stats = await fetchNeighborhood(CENTER_LAT, CENTER_LON, { fetchFn: mockFetch as unknown as typeof fetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/Pepite-extension/);
    expect(init.method).toBe("POST");
    expect(stats.ecoles.count).toBe(3);
  });

  it("bascule sur le second endpoint si le premier échoue (rejet réseau)", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fixtureJson,
      });

    const stats = await fetchNeighborhood(CENTER_LAT, CENTER_LON, { fetchFn: mockFetch as unknown as typeof fetch });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [[url1], [url2]] = mockFetch.mock.calls as [[string], [string]];
    expect(url1).toBe("https://overpass-api.de/api/interpreter");
    expect(url2).toBe("https://overpass.osm.ch/api/interpreter");
    expect(stats.transports.count).toBe(3);
  });

  it("bascule sur le second endpoint si le premier répond non-OK (429)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fixtureJson,
      });

    const stats = await fetchNeighborhood(CENTER_LAT, CENTER_LON, { fetchFn: mockFetch as unknown as typeof fetch });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(stats.ecoles.count).toBe(3);
  });

  it("lève une erreur explicite si tous les endpoints échouent", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("err1"))
      .mockRejectedValueOnce(new Error("err2"));

    await expect(
      fetchNeighborhood(CENTER_LAT, CENTER_LON, { fetchFn: mockFetch as unknown as typeof fetch }),
    ).rejects.toThrow("fetchNeighborhood: tous les endpoints Overpass ont échoué");
  });

  it("respecte le radiusM passé en option", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ elements: [] }),
    });

    const stats = await fetchNeighborhood(CENTER_LAT, CENTER_LON, {
      radiusM: 500,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const body = (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string;
    expect(body).toContain("500");
    expect(stats.radiusM).toBe(500);
  });
});
