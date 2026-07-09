import {
  fetchCommuneInfo,
  fetchCommuneSales,
  fetchNeighborhood,
  fetchPluZone,
  fetchRentInfo,
  fetchRisks,
  fetchTaxeFonciere,
  type DvfSale,
  type Enrichments,
  type GeoPoint,
  type Listing,
} from "@pepite/core";
import { idbRepository } from "@/lib/repository-idb";

/** Exporté pour que les tests vérifient le TTL passé au cache. */
export const DVF_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30 jours
const OSM_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30 jours
const RISQUES_CACHE_TTL = 90 * 24 * 3600 * 1000; // 90 jours
const LOYERS_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30 jours
const COMMUNE_CACHE_TTL = 90 * 24 * 3600 * 1000; // 90 jours
const PLU_CACHE_TTL = 90 * 24 * 3600 * 1000; // 90 jours
const TAXE_FONCIERE_CACHE_TTL = 90 * 24 * 3600 * 1000; // 90 jours

export async function getSalesCached(citycode: string): Promise<DvfSale[]> {
  const key = `dvf:${citycode}`;
  const cached = await idbRepository.getCache<DvfSale[]>(key);
  if (cached) return cached;
  const sales = await fetchCommuneSales(citycode);
  await idbRepository.setCache(key, sales, DVF_CACHE_TTL);
  return sales;
}

/** Build enrichments via Promise.allSettled with IDB cache. */
export async function buildEnrichments(
  point: GeoPoint,
  listing: Listing,
): Promise<Enrichments> {
  const lat = point.lat;
  const lon = point.lon;
  const citycode = point.citycode;

  // OSM neighborhood — cache key includes lat/lon at 3 decimal places (~110 m) + radius
  const osmKey = `osm:${lat.toFixed(3)},${lon.toFixed(3)},800`;
  // Risks — cache key per commune code
  const risquesKey = citycode ? `risques:${citycode}` : null;
  // Loyers — cache per commune + property type
  const loyersKey = citycode && listing.propertyType ? `loyer:${citycode}:${listing.propertyType}` : null;
  // Commune (population/densité) — cache key per commune code
  const communeKey = citycode ? `commune:${citycode}` : null;
  // Zonage PLU — cache key per point arrondi à 4 décimales (~11 m)
  const pluKey = `plu:${lat.toFixed(4)},${lon.toFixed(4)}`;
  // Taxe foncière — cache key per commune code
  const taxeFonciereKey = citycode ? `tf:${citycode}` : null;

  const [neighborhoodResult, risksResult, rentResult, communeResult, pluResult, taxeFonciereResult] = await Promise.allSettled([
    // Neighborhood
    (async () => {
      const cached = await idbRepository.getCache<Enrichments["neighborhood"]>(osmKey);
      if (cached) return cached;
      const stats = await fetchNeighborhood(lat, lon);
      await idbRepository.setCache(osmKey, stats, OSM_CACHE_TTL);
      return stats;
    })(),
    // Risks
    (async () => {
      if (!risquesKey || !citycode) return undefined;
      const cached = await idbRepository.getCache<Enrichments["risks"]>(risquesKey);
      if (cached) return cached;
      const report = await fetchRisks(citycode);
      await idbRepository.setCache(risquesKey, report, RISQUES_CACHE_TTL);
      return report;
    })(),
    // Rent
    (async () => {
      if (!loyersKey || !citycode || !listing.propertyType) return undefined;
      const cached = await idbRepository.getCache<Enrichments["rent"]>(loyersKey);
      if (cached) return cached;
      const info = await fetchRentInfo(citycode, listing.propertyType);
      if (info) await idbRepository.setCache(loyersKey, info, LOYERS_CACHE_TTL);
      return info ?? undefined;
    })(),
    // Commune (population/densité)
    (async () => {
      if (!communeKey || !citycode) return undefined;
      const cached = await idbRepository.getCache<Enrichments["commune"]>(communeKey);
      if (cached) return cached;
      const info = await fetchCommuneInfo(citycode);
      await idbRepository.setCache(communeKey, info, COMMUNE_CACHE_TTL);
      return info;
    })(),
    // Zonage PLU (null = interrogé mais sans zonage — non mis en cache)
    (async () => {
      const cached = await idbRepository.getCache<NonNullable<Enrichments["plu"]>>(pluKey);
      if (cached) return cached;
      const zone = await fetchPluZone(lat, lon);
      if (zone) await idbRepository.setCache(pluKey, zone, PLU_CACHE_TTL);
      return zone;
    })(),
    // Taxe foncière (null = interrogé mais commune sans donnée — non mis en cache)
    (async () => {
      if (!taxeFonciereKey || !citycode) return undefined;
      const cached = await idbRepository.getCache<NonNullable<Enrichments["taxeFonciere"]>>(taxeFonciereKey);
      if (cached) return cached;
      const info = await fetchTaxeFonciere(citycode);
      if (info) await idbRepository.setCache(taxeFonciereKey, info, TAXE_FONCIERE_CACHE_TTL);
      return info;
    })(),
  ]);

  if (neighborhoodResult.status === "rejected")
    console.warn("[pepite] enrichissement quartier indisponible:", neighborhoodResult.reason);
  if (risksResult.status === "rejected")
    console.warn("[pepite] enrichissement risques indisponible:", risksResult.reason);
  if (rentResult.status === "rejected")
    console.warn("[pepite] enrichissement loyers indisponible:", rentResult.reason);
  if (communeResult.status === "rejected")
    console.warn("[pepite] enrichissement commune indisponible:", communeResult.reason);
  if (pluResult.status === "rejected")
    console.warn("[pepite] enrichissement zonage PLU indisponible:", pluResult.reason);
  if (taxeFonciereResult.status === "rejected")
    console.warn("[pepite] enrichissement taxe foncière indisponible:", taxeFonciereResult.reason);

  const enrichments: Enrichments = {
    neighborhood: neighborhoodResult.status === "fulfilled" ? neighborhoodResult.value : undefined,
    risks: risksResult.status === "fulfilled" ? risksResult.value : undefined,
    rent: rentResult.status === "fulfilled" ? rentResult.value : undefined,
    // null = interrogé mais sans donnée (≠ undefined = non tenté/échoué)
    commune: communeResult.status === "fulfilled" ? communeResult.value : undefined,
    plu: pluResult.status === "fulfilled" ? pluResult.value : undefined,
    taxeFonciere: taxeFonciereResult.status === "fulfilled" ? taxeFonciereResult.value : undefined,
  };

  console.info("[pepite] enrichissements:", {
    quartier: enrichments.neighborhood !== undefined,
    risques: enrichments.risks !== undefined,
    loyers: enrichments.rent !== undefined,
    commune: enrichments.commune !== undefined,
    plu: enrichments.plu !== undefined,
    taxeFonciere: enrichments.taxeFonciere !== undefined,
  });

  return enrichments;
}
