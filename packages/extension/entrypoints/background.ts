import {
  analyzeListing,
  buildQuickAnalysis,
  computeGlobalScore,
  computeMarketStats,
  extractListingGeneric,
  fetchCommuneInfo,
  fetchCommuneSales,
  fetchNeighborhood,
  fetchPluZone,
  fetchRentInfo,
  fetchRisks,
  fetchTaxeFonciere,
  generateNegotiationEmails,
  geocode,
  isListingPage,
  type DvfSale,
  type Enrichments,
  type GeoPoint,
  type Listing,
  type QuickAnalysis,
  type Report,
} from "@pepite/core";
import { idbRepository } from "@/lib/repository-idb";
import { getSettings, toLlmConfig } from "@/lib/settings";
import type { PepiteRequest, TabState } from "@/lib/messages";

const DVF_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30 jours
const OSM_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30 jours
const RISQUES_CACHE_TTL = 90 * 24 * 3600 * 1000; // 90 jours
const LOYERS_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30 jours
const COMMUNE_CACHE_TTL = 90 * 24 * 3600 * 1000; // 90 jours
const PLU_CACHE_TTL = 90 * 24 * 3600 * 1000; // 90 jours
const TAXE_FONCIERE_CACHE_TTL = 90 * 24 * 3600 * 1000; // 90 jours

const tabStates = new Map<number, TabState>();

/** Clé unique sous laquelle la Map est persistée dans chrome.storage.session. */
const TAB_STATES_STORAGE_KEY = "tabStates";

/**
 * Réhydratation lazy de tabStates depuis storage.session après la mort du
 * service worker MV3. La Map RAM reste le cache de travail ; storage.session
 * (mémoire navigateur, vidé à sa fermeture) survit aux redémarrages du SW.
 */
let hydration: Promise<void> | null = null;
function hydrateTabStates(): Promise<void> {
  hydration ??= (async () => {
    try {
      const stored = await browser.storage.session.get(TAB_STATES_STORAGE_KEY);
      const saved = stored[TAB_STATES_STORAGE_KEY] as Record<string, TabState> | undefined;
      if (!saved) return;
      for (const [id, state] of Object.entries(saved)) {
        // La Map RAM (plus fraîche) garde la priorité sur le snapshot persisté.
        if (!tabStates.has(Number(id))) tabStates.set(Number(id), state);
      }
    } catch {
      // storage.session indisponible → on retombe sur le flux REDETECT existant.
    }
  })();
  return hydration;
}

/** Écrit le snapshot complet de la Map (TabState est du JSON pur). */
function persistTabStates() {
  void browser.storage.session
    .set({ [TAB_STATES_STORAGE_KEY]: Object.fromEntries(tabStates) })
    .catch(() => {});
}

function setTabState(tabId: number, state: TabState) {
  tabStates.set(tabId, state);
  persistTabStates();
  void browser.runtime
    .sendMessage({ type: "TAB_STATE_CHANGED", tabId, state })
    .catch(() => {}); // personne n'écoute → normal
}

/**
 * If the tab is on a supported listing page but its state is still idle (e.g.
 * after service-worker death), ask the content script to re-detect the listing.
 */
function ensureTabState(tabId: number, url: string | undefined) {
  if (!url || !isListingPage(url)) return;
  // Un état non-idle existe déjà (annonce détectée, ou échec d'extraction
  // mémorisé) : ne pas relancer la détection — sinon chaque ouverture du side
  // panel après un échec d'extraction générique re-déclencherait un appel LLM.
  const state = tabStates.get(tabId);
  if (state && state.status !== "idle") return;
  void browser.tabs.sendMessage(tabId, { type: "REDETECT" }).catch(() => {});
}

/** Message d'explication affiché par le side panel quand l'extraction générique échoue. */
const EXTRACTION_FAILED_MESSAGE =
  "Pépite n'a pas réussi à identifier une annonce exploitable sur cette page (prix, surface…). " +
  "Recharge la page une fois l'annonce affichée, ou réessaie sur une autre annonce.";

async function getSalesCached(citycode: string): Promise<DvfSale[]> {
  const key = `dvf:${citycode}`;
  const cached = await idbRepository.getCache<DvfSale[]>(key);
  if (cached) return cached;
  const sales = await fetchCommuneSales(citycode);
  await idbRepository.setCache(key, sales, DVF_CACHE_TTL);
  return sales;
}

/**
 * Resolve the best GeoPoint for a listing:
 * - If the listing already has lat/lon (district centroid or address), keep those coordinates.
 * - Always geocode the rawAddress to obtain the citycode; merge the citycode into the listing point
 *   so that enrichments (DVF, risks, rent) use the correct commune code while neighbourhood
 *   queries use the listing's more precise coordinates.
 */
async function resolvePoint(listing: Listing): Promise<GeoPoint | null> {
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
async function runQuickAnalysis(listing: Listing): Promise<{ quick: QuickAnalysis; point: GeoPoint | null }> {
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

/** Build enrichments via Promise.allSettled with IDB cache. */
async function buildEnrichments(
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

/**
 * Shared quick pipeline for a freshly extracted listing: persist it, run the
 * quick (no-LLM) analysis, update tab state, and resolve with the QuickAnalysis.
 * Returns null when the result is stale (another listing took over the tab).
 */
async function runListingPipeline(tabId: number, listing: Listing): Promise<QuickAnalysis | null> {
  const url = listing.url;
  setTabState(tabId, { status: "quick-running", listing });
  try {
    await idbRepository.saveListing(listing);
    const { quick, point } = await runQuickAnalysis(listing);
    // résultat périmé, une autre annonce a pris la main
    if (tabStates.get(tabId)?.listing?.url !== url) return null;
    setTabState(tabId, { status: "quick-done", listing, quick, point: point ?? undefined });
    return quick;
  } catch (e) {
    if (tabStates.get(tabId)?.listing?.url !== url) return null;
    setTabState(tabId, {
      status: "error",
      listing,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export default defineBackground(() => {
  // browser.sidePanel is typed by @wxt-dev/browser (Chrome 114+, MV3)
  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  browser.tabs.onRemoved.addListener((tabId) => {
    // Hydrater d'abord : sinon le snapshot persisté serait écrasé par une Map vide.
    void hydrateTabStates().then(() => {
      tabStates.delete(tabId);
      persistTabStates();
    });
  });

  browser.runtime.onMessage.addListener(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (message: any, sender: any, sendResponse: (r: unknown) => void) => {
      const req = message as PepiteRequest;

      // Handle synchronously (user-gesture context must not cross an await)
      if (req.type === "OPEN_SIDE_PANEL") {
        const tabId = sender.tab?.id;
        const tabUrl = sender.tab?.url;
        if (tabId !== undefined) {
          void browser.sidePanel.open({ tabId }).catch(() => {});
          // ensureTabState n'exige pas le contexte user-gesture : on attend la
          // réhydratation pour ne pas relancer une détection déjà mémorisée.
          void hydrateTabStates().then(() => ensureTabState(tabId, tabUrl));
        }
        sendResponse(null);
        return false;
      }

      (async () => {
        // Réveil du service worker : recharger les états d'onglets persistés
        // avant tout accès à tabStates.
        await hydrateTabStates();
        switch (req.type) {
          case "LISTING_DETECTED": {
            const tabId = sender.tab?.id;
            if (tabId === undefined) return sendResponse(null);
            sendResponse(await runListingPipeline(tabId, req.listing));
            return;
          }
          case "EXTRACT_GENERIC": {
            const tabId = sender.tab?.id;
            if (tabId === undefined) return sendResponse(null);
            const settings = await getSettings();
            const cfg = toLlmConfig(settings);
            // L'extraction générique coûte un appel LLM : sans clé, on ne tente rien.
            if (!cfg) return sendResponse({ error: "NO_API_KEY" });
            let listing: Listing;
            try {
              listing = await extractListingGeneric(req.pageText, req.url, cfg);
            } catch (e) {
              // Pas d'annonce identifiable ou extraction invalide → badge neutre,
              // et état d'erreur mémorisé pour que le side panel explique.
              setTabState(tabId, { status: "error", error: EXTRACTION_FAILED_MESSAGE });
              return sendResponse({ error: "EXTRACTION_FAIBLE" });
            }
            // Garde qualité : résultat trop pauvre pour être présenté.
            if (
              !listing.price ||
              listing.price < 5000 ||
              (!listing.surface && !listing.rooms && !listing.propertyType)
            ) {
              setTabState(tabId, { status: "error", error: EXTRACTION_FAILED_MESSAGE });
              return sendResponse({ error: "EXTRACTION_FAIBLE" });
            }
            sendResponse(await runListingPipeline(tabId, listing));
            return;
          }
          case "GET_TAB_STATE": {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            const tabId = req.tabId ?? tabs[0]?.id;
            const tabUrl = tabs[0]?.url;
            const resolvedState =
              tabId !== undefined
                ? (tabStates.get(tabId) ?? { status: "idle" })
                : { status: "idle" as const };
            if (tabId !== undefined && resolvedState.status === "idle") {
              ensureTabState(tabId, tabUrl);
            }
            sendResponse({ tabId, state: resolvedState });
            return;
          }
          case "RUN_FULL_ANALYSIS": {
            const prev = tabStates.get(req.tabId);
            if (!prev?.listing || !prev.quick)
              return sendResponse({ error: "Aucune annonce analysée sur cet onglet" });
            const settings = await getSettings();
            const cfg = toLlmConfig(settings);
            if (!cfg) return sendResponse({ error: "NO_API_KEY" });

            setTabState(req.tabId, { ...prev, status: "full-running" });
            try {
              // Recompute point if it was not resolved during quick analysis
              // (e.g. after a service-worker restart or when geocoding failed transiently).
              let point = prev.point ?? null;
              if (!point) {
                point = await resolvePoint(prev.listing);
                if (point) setTabState(req.tabId, { ...prev, status: "full-running", point });
              }
              const enrichments: Enrichments | undefined = point
                ? await buildEnrichments(point, prev.listing)
                : undefined;

              const analysis = await analyzeListing(
                { listing: prev.listing, quick: prev.quick, enrichments },
                cfg,
              );
              const globalScore = computeGlobalScore(prev.quick, prev.listing, enrichments) ?? undefined;
              const report: Report = {
                id: crypto.randomUUID(),
                listingUrl: prev.listing.url,
                createdAt: new Date().toISOString(),
                listing: prev.listing,
                quick: prev.quick,
                analysis,
                provider: cfg.provider,
                model: cfg.model,
                enrichments,
                globalScore,
              };
              await idbRepository.saveReport(report);
              setTabState(req.tabId, { ...prev, status: "full-done", reportId: report.id });
              sendResponse({ reportId: report.id, analysis, enrichments, globalScore });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setTabState(req.tabId, { ...prev, status: "error", error: msg });
              sendResponse({ error: msg });
            }
            return;
          }
          case "GENERATE_NEGOTIATION_EMAILS": {
            const report = await idbRepository.getReport(req.reportId);
            if (!report) return sendResponse({ error: "Rapport introuvable" });
            const settings = await getSettings();
            const cfg = toLlmConfig(settings);
            if (!cfg) return sendResponse({ error: "NO_API_KEY" });
            try {
              const emails = await generateNegotiationEmails({
                listing: report.listing,
                quick: report.quick,
                analysis: report.analysis,
                enrichments: report.enrichments,
                settings: cfg,
              });
              // Persistance sur le rapport existant (même id, pas de nouveau rapport).
              await idbRepository.saveReport({ ...report, negotiationEmails: emails });
              sendResponse({ emails });
            } catch (e) {
              sendResponse({ error: e instanceof Error ? e.message : String(e) });
            }
            return;
          }
          default:
            sendResponse(null);
            return;
        }
      })().catch((err: unknown) => {
        // Garantit une réponse sur tous les chemins : sans elle, l'appelant
        // resterait suspendu sur un sendMessage sans réponse.
        sendResponse({ error: err instanceof Error ? err.message : String(err) });
      });
      return true; // réponse asynchrone
    },
  );
});
