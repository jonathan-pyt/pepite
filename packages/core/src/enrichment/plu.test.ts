import { describe, it, expect, vi } from "vitest";
import { fetchPluZone } from "./plu";

// ─── Fixtures recorded from real API responses (2026-06-11) ───────────────────
// GET https://apicarto.ign.fr/api/gpu/zone-urba?geom=<Point [lon,lat]>
// Géométries tronquées (lourdes en réel) — seules les properties sont parsées.

/** Saint-Denis (974), point [55.4504, -20.8789] → zone "Uavap" / "U" */
const SAINT_DENIS_RESPONSE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "zone_urba.1",
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[55.45, -20.879], [55.451, -20.879], [55.451, -20.878], [55.45, -20.879]]]],
      },
      properties: {
        gpu_doc_id: "8c2d0aa3a4b8f3a96c1b9d77ed7f0d2a",
        gpu_status: "document.production",
        gpu_timestamp: "2024-09-17T08:11:42",
        partition: "DU_97411",
        insee: "97411",
        libelle: "Uavap",
        libelong: "Zone urbaine du site patrimonial remarquable",
        typezone: "U",
        destdomi: null,
        nomfic: "97411_reglement.pdf",
        urlfic: "https://data.geopf.fr/annexes/gpu/documents/DU_97411/97411_reglement.pdf",
        datappro: "20191219",
        datvalid: null,
        idurba: "97411_PLU_20191219",
      },
    },
  ],
};

/** Bordeaux Chartrons, point [-0.5805, 44.8520] → zone "UP1" / "U" */
const BORDEAUX_RESPONSE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "zone_urba.2",
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[-0.581, 44.852], [-0.58, 44.852], [-0.58, 44.853], [-0.581, 44.852]]]],
      },
      properties: {
        gpu_doc_id: "f31b7e6a90cc4e2db0a5cf18a36b94d1",
        gpu_status: "document.production",
        gpu_timestamp: "2025-02-04T10:27:05",
        partition: "DU_243300316",
        insee: "33063",
        libelle: "UP1",
        libelong: "Zone urbaine de centre-ville historique",
        typezone: "U",
        destdomi: "habitat",
        nomfic: "reglement_plu_bm.pdf",
        urlfic: "https://data.geopf.fr/annexes/gpu/documents/DU_243300316/reglement_plu_bm.pdf",
        datappro: "20240712",
        datvalid: null,
        idurba: "243300316_PLUI_20240712",
      },
    },
  ],
};

/** Point hors zonage ou commune sans PLU numérisé → 0 features */
const EMPTY_RESPONSE = {
  type: "FeatureCollection",
  features: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("fetchPluZone", () => {
  it("appelle l'endpoint en GET avec un Point GeoJSON [lon, lat] url-encodé", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => SAINT_DENIS_RESPONSE,
    });

    await fetchPluZone(-20.8789, 55.4504, { fetchFn: mockFetch as unknown as typeof fetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0] as [string, RequestInit?];
    const url = call[0];
    expect(url).toContain("https://apicarto.ign.fr/api/gpu/zone-urba?geom=");
    // ordre GeoJSON : [longitude, latitude]
    expect(url).toContain(
      encodeURIComponent(JSON.stringify({ type: "Point", coordinates: [55.4504, -20.8789] })),
    );
    // GET obligatoire : le POST ignore le filtre geom (vérifié empiriquement)
    expect(call[1]).toBeUndefined();
  });

  it("Saint-Denis 974 — retourne libelle Uavap et typezone U, sans géométrie", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => SAINT_DENIS_RESPONSE,
    });

    const zone = await fetchPluZone(-20.8789, 55.4504, {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(zone).toEqual({ libelle: "Uavap", typezone: "U" });
  });

  it("Bordeaux Chartrons — retourne libelle UP1 et typezone U", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => BORDEAUX_RESPONSE,
    });

    const zone = await fetchPluZone(44.852, -0.5805, {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(zone).toEqual({ libelle: "UP1", typezone: "U" });
  });

  it("0 features (pas de PLU numérisé ou hors zonage) → null, pas une erreur", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => EMPTY_RESPONSE,
    });

    const zone = await fetchPluZone(48.8566, 2.3522, {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(zone).toBeNull();
  });

  it("erreur HTTP → throw avec le status", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(
      fetchPluZone(-20.8789, 55.4504, { fetchFn: mockFetch as unknown as typeof fetch }),
    ).rejects.toThrow("zonage PLU apicarto: HTTP 500");
  });

  it("erreur réseau → throw (le pipeline gère via allSettled)", async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error("fetch failed: ETIMEDOUT"));

    await expect(
      fetchPluZone(-20.8789, 55.4504, { fetchFn: mockFetch as unknown as typeof fetch }),
    ).rejects.toThrow("ETIMEDOUT");
  });
});
