import {
  analyzeListing,
  buildQuickAnalysis,
  computeMarketStats,
  fetchCommuneSales,
  geocode,
  type DvfSale,
  type Listing,
  type QuickAnalysis,
  type Report,
} from "@pepite/core";
import { idbRepository } from "@/lib/repository-idb";
import { getSettings, toLlmConfig } from "@/lib/settings";
import type { PepiteRequest, TabState } from "@/lib/messages";

const DVF_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30 jours
const tabStates = new Map<number, TabState>();

function setTabState(tabId: number, state: TabState) {
  tabStates.set(tabId, state);
  void browser.runtime
    .sendMessage({ type: "TAB_STATE_CHANGED", tabId, state })
    .catch(() => {}); // personne n'écoute → normal
}

async function getSalesCached(citycode: string): Promise<DvfSale[]> {
  const key = `dvf:${citycode}`;
  const cached = await idbRepository.getCache<DvfSale[]>(key);
  if (cached) return cached;
  const sales = await fetchCommuneSales(citycode);
  await idbRepository.setCache(key, sales, DVF_CACHE_TTL);
  return sales;
}

async function runQuickAnalysis(listing: Listing): Promise<QuickAnalysis> {
  const point =
    listing.location.lat && listing.location.lon
      ? { lat: listing.location.lat, lon: listing.location.lon, citycode: "" }
      : await geocode(listing.location.rawAddress);
  if (!point) return buildQuickAnalysis(listing, null);

  let citycode = point.citycode;
  if (!citycode) {
    const geo = await geocode(listing.location.rawAddress);
    citycode = geo?.citycode ?? "";
  }
  if (!citycode) return buildQuickAnalysis(listing, null);

  if (!listing.propertyType) return buildQuickAnalysis(listing, null);

  const sales = await getSalesCached(citycode);
  const market = computeMarketStats(
    sales,
    { lat: point.lat, lon: point.lon },
    listing.propertyType,
  );
  return buildQuickAnalysis(listing, market);
}

export default defineBackground(() => {
  // browser.sidePanel is typed by @wxt-dev/browser (Chrome 114+, MV3)
  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  browser.tabs.onRemoved.addListener((tabId) => tabStates.delete(tabId));

  browser.runtime.onMessage.addListener(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (message: any, sender: any, sendResponse: (r: unknown) => void) => {
      const req = message as PepiteRequest;

      // Handle synchronously (user-gesture context must not cross an await)
      if (req.type === "OPEN_SIDE_PANEL") {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) void browser.sidePanel.open({ tabId }).catch(() => {});
        sendResponse(null);
        return false;
      }

      (async () => {
        switch (req.type) {
          case "LISTING_DETECTED": {
            const tabId = sender.tab?.id;
            if (tabId === undefined) return sendResponse(null);
            const url = req.listing.url;
            setTabState(tabId, { status: "quick-running", listing: req.listing });
            try {
              await idbRepository.saveListing(req.listing);
              const quick = await runQuickAnalysis(req.listing);
              // résultat périmé, une autre annonce a pris la main
              if (tabStates.get(tabId)?.listing?.url !== url) return sendResponse(null);
              setTabState(tabId, { status: "quick-done", listing: req.listing, quick });
              sendResponse(quick);
            } catch (e) {
              // résultat périmé, une autre annonce a pris la main
              if (tabStates.get(tabId)?.listing?.url !== url) return sendResponse(null);
              setTabState(tabId, {
                status: "error",
                listing: req.listing,
                error: e instanceof Error ? e.message : String(e),
              });
              sendResponse(null);
            }
            return;
          }
          case "GET_TAB_STATE": {
            const tabId =
              req.tabId ??
              (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
            sendResponse({
              tabId,
              state:
                tabId !== undefined
                  ? (tabStates.get(tabId) ?? { status: "idle" })
                  : { status: "idle" },
            });
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
              const analysis = await analyzeListing(
                { listing: prev.listing, quick: prev.quick, profile: req.profile },
                cfg,
              );
              const report: Report = {
                id: crypto.randomUUID(),
                listingUrl: prev.listing.url,
                createdAt: new Date().toISOString(),
                profile: req.profile,
                listing: prev.listing,
                quick: prev.quick,
                analysis,
                provider: cfg.provider,
                model: cfg.model,
              };
              await idbRepository.saveReport(report);
              setTabState(req.tabId, { ...prev, status: "full-done", reportId: report.id });
              sendResponse({ reportId: report.id, analysis });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setTabState(req.tabId, { ...prev, status: "error", error: msg });
              sendResponse({ error: msg });
            }
            return;
          }
          default:
            sendResponse(null);
            return;
        }
      })();
      return true; // réponse asynchrone
    },
  );
});
