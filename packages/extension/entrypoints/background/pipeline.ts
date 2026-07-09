import {
  buildQuickAnalysis,
  computeMarketStats,
  geocode,
  type GeoPoint,
  type Listing,
  type QuickAnalysis,
} from "@pepite/core";
import { idbRepository } from "@/lib/repository-idb";
import { getSalesCached } from "./enrichments";
import { getTabState, setTabState } from "./tab-states";

/**
 * Resolve the best GeoPoint for a listing:
 * - If the listing already has lat/lon (district centroid or address), keep those coordinates.
 * - Always geocode the rawAddress to obtain the citycode; merge the citycode into the listing point
 *   so that enrichments (DVF, risks, rent) use the correct commune code while neighbourhood
 *   queries use the listing's more precise coordinates.
 */
export async function resolvePoint(listing: Listing): Promise<GeoPoint | null> {
  const hasCoords = !!listing.location.lat && !!listing.location.lon;

  // Geocode to get citycode (always needed for DVF / enrichment APIs).
  const geo = await geocode(listing.location.rawAddress);
  if (!geo) return null;

  if (hasCoords) {
    // Prefer the listing's own coordinates (district centroid or address-level precision)
    // but use the geocoder's citycode so commune-level APIs work correctly.
    return { ...geo, lat: listing.location.lat!, lon: listing.location.lon! };
  }
  return geo;
}

/** Returns both the quick analysis and the resolved GeoPoint for later reuse. */
export async function runQuickAnalysis(listing: Listing): Promise<{ quick: QuickAnalysis; point: GeoPoint | null }> {
  const point = await resolvePoint(listing);
  if (!point) return { quick: buildQuickAnalysis(listing, null), point: null };
  if (!point.citycode) return { quick: buildQuickAnalysis(listing, null), point: null };

  if (!listing.propertyType) return { quick: buildQuickAnalysis(listing, null), point };

  const sales = await getSalesCached(point.citycode);
  const market = computeMarketStats(
    sales,
    { lat: point.lat, lon: point.lon },
    listing.propertyType,
    { surface: listing.surface },
  );
  return { quick: buildQuickAnalysis(listing, market), point };
}

/**
 * Shared quick pipeline for a freshly extracted listing: persist it, run the
 * quick (no-LLM) analysis, update tab state, and resolve with the QuickAnalysis.
 * Returns null when the result is stale (another listing took over the tab).
 */
export async function runListingPipeline(tabId: number, listing: Listing): Promise<QuickAnalysis | null> {
  const url = listing.url;
  // Une localisation corrigée par l'utilisateur survit aux re-détections
  // (reload, navigation SPA) : sinon l'annonce ré-extraite restaurerait la
  // localisation fausse de l'annonce.
  try {
    const saved = await idbRepository.getListingByUrl(url);
    if (saved?.location.locationCorrected) listing = { ...listing, location: saved.location };
    // Les notes utilisateur (visite, agent) survivent aussi aux re-parses —
    // même garde par URL que la localisation corrigée.
    if (saved?.userNotes) listing = { ...listing, userNotes: saved.userNotes };
  } catch {
    // IDB indisponible → on continue avec la localisation extraite.
  }
  setTabState(tabId, { status: "quick-running", listing });
  try {
    await idbRepository.saveListing(listing);
    const { quick, point } = await runQuickAnalysis(listing);
    // résultat périmé, une autre annonce a pris la main
    if (getTabState(tabId)?.listing?.url !== url) return null;
    setTabState(tabId, { status: "quick-done", listing, quick, point: point ?? undefined });
    return quick;
  } catch (e) {
    if (getTabState(tabId)?.listing?.url !== url) return null;
    setTabState(tabId, {
      status: "error",
      listing,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
