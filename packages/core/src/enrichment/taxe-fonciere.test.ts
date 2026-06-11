import { describe, it, expect, vi } from "vitest";
import { fetchTaxeFonciere } from "./taxe-fonciere";

// ─── Fixtures recorded from real API responses (2026-06-11) ───────────────────

/**
 * GET …/fiscalite-locale-des-particuliers-geo/records?select=exercice,taux_global_tfb,taux_plein_teom
 *     &where=insee_com="97411"&order_by=exercice desc&limit=1
 */
const SAINT_DENIS_RESPONSE = {
  total_count: 5,
  results: [{ exercice: "2025", taux_global_tfb: 38.97, taux_plein_teom: 15.8 }],
};

/** Code INSEE sans enregistrement dans le jeu de données */
const EMPTY_RESPONSE = {
  total_count: 0,
  results: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("fetchTaxeFonciere", () => {
  it("appelle l'endpoint opendatasoft avec select, where, order_by desc et limit 1", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => SAINT_DENIS_RESPONSE,
    });

    await fetchTaxeFonciere("97411", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain(
      "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers-geo/records",
    );
    expect(url).toContain("select=exercice,taux_global_tfb,taux_plein_teom");
    expect(url).toContain("where=insee_com%3D%2297411%22");
    expect(url).toContain("order_by=exercice%20desc");
    expect(url).toContain("limit=1");
  });

  it("Saint-Denis 97411 — retourne l'exercice le plus récent avec taux TFB et TEOM", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => SAINT_DENIS_RESPONSE,
    });

    const info = await fetchTaxeFonciere("97411", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(info).toEqual({ exercice: "2025", tauxGlobalTfb: 38.97, tauxTeom: 15.8 });
  });

  it("0 résultat → null, pas une erreur", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => EMPTY_RESPONSE,
    });

    const info = await fetchTaxeFonciere("00000", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(info).toBeNull();
  });

  it("taux_plein_teom absent (commune en REOM) → tauxTeom null, TFB conservé", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total_count: 5,
        results: [{ exercice: "2025", taux_global_tfb: 38.97, taux_plein_teom: null }],
      }),
    });

    const info = await fetchTaxeFonciere("97411", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(info).toEqual({ exercice: "2025", tauxGlobalTfb: 38.97, tauxTeom: null });
  });

  it("erreur HTTP → throw avec le status", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(
      fetchTaxeFonciere("97411", { fetchFn: mockFetch as unknown as typeof fetch }),
    ).rejects.toThrow("taxe foncière data.economie.gouv.fr: HTTP 429");
  });

  it("erreur réseau → throw (le pipeline gère via allSettled)", async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error("fetch failed: ECONNRESET"));

    await expect(
      fetchTaxeFonciere("97411", { fetchFn: mockFetch as unknown as typeof fetch }),
    ).rejects.toThrow("ECONNRESET");
  });
});
