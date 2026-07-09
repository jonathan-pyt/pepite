import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCommuneSales, fetchNeighborhood, fetchPluZone, fetchRisks, fetchTaxeFonciere, type GeoPoint, type Listing } from "@pepite/core";
import { idbRepository } from "@/lib/repository-idb";
import { buildEnrichments, DVF_CACHE_TTL, getSalesCached } from "./enrichments";

vi.mock("@pepite/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pepite/core")>()),
  fetchCommuneSales: vi.fn(),
  fetchNeighborhood: vi.fn(),
  fetchRisks: vi.fn(),
  fetchRentInfo: vi.fn().mockResolvedValue(null),
  fetchCommuneInfo: vi.fn().mockResolvedValue(undefined),
  fetchPluZone: vi.fn(),
  fetchTaxeFonciere: vi.fn(),
}));

vi.mock("@/lib/repository-idb", () => ({
  idbRepository: { getCache: vi.fn(), setCache: vi.fn() },
}));

const getCache = vi.mocked(idbRepository.getCache);
const setCache = vi.mocked(idbRepository.setCache);

const point: GeoPoint = {
  lat: 48.85661234,
  lon: 2.35221234,
  citycode: "75104",
  label: "Paris 4e",
  score: 0.9,
  precision: "housenumber",
};
const listing = { propertyType: "Appartement" } as Listing;

beforeEach(() => {
  vi.clearAllMocks();
  getCache.mockResolvedValue(undefined);
  setCache.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("getSalesCached", () => {
  it("sert le cache sans re-télécharger le CSV DVF", async () => {
    getCache.mockResolvedValueOnce([{ id: "v1" }]);
    const sales = await getSalesCached("97411");
    expect(sales).toEqual([{ id: "v1" }]);
    expect(fetchCommuneSales).not.toHaveBeenCalled();
  });

  it("cache manquant → télécharge et met en cache sous dvf:{citycode} avec le TTL DVF", async () => {
    vi.mocked(fetchCommuneSales).mockResolvedValueOnce([]);
    await getSalesCached("97411");
    expect(fetchCommuneSales).toHaveBeenCalledWith("97411");
    expect(setCache).toHaveBeenCalledWith("dvf:97411", [], DVF_CACHE_TTL);
  });
});

describe("buildEnrichments", () => {
  it("un enricher qui échoue n'empêche pas les autres (allSettled)", async () => {
    const stats = { pois: [] };
    vi.mocked(fetchNeighborhood).mockResolvedValue(stats as never);
    vi.mocked(fetchRisks).mockRejectedValue(new Error("georisques down"));
    vi.mocked(fetchPluZone).mockResolvedValue(null);
    vi.mocked(fetchTaxeFonciere).mockResolvedValue(null as never);

    const enrichments = await buildEnrichments(point, listing);
    expect(enrichments.neighborhood).toEqual(stats);
    expect(enrichments.risks).toBeUndefined();
  });

  it("clés de cache arrondies : OSM à 3 décimales, PLU à 4", async () => {
    vi.mocked(fetchNeighborhood).mockResolvedValue({ pois: [] } as never);
    vi.mocked(fetchRisks).mockResolvedValue(undefined as never);
    vi.mocked(fetchPluZone).mockResolvedValue(null);
    vi.mocked(fetchTaxeFonciere).mockResolvedValue(null as never);

    await buildEnrichments(point, listing);
    expect(getCache).toHaveBeenCalledWith("osm:48.857,2.352,800");
    expect(getCache).toHaveBeenCalledWith("plu:48.8566,2.3522");
  });

  it("PLU/taxe foncière null (interrogé sans donnée) → jamais mis en cache", async () => {
    vi.mocked(fetchNeighborhood).mockResolvedValue({ pois: [] } as never);
    vi.mocked(fetchRisks).mockResolvedValue(undefined as never);
    vi.mocked(fetchPluZone).mockResolvedValue(null);
    vi.mocked(fetchTaxeFonciere).mockResolvedValue(null as never);

    await buildEnrichments(point, listing);
    const cachedKeys = setCache.mock.calls.map(([key]) => key);
    expect(cachedKeys.some((k) => k.startsWith("plu:"))).toBe(false);
    expect(cachedKeys.some((k) => k.startsWith("tf:"))).toBe(false);
  });
});
