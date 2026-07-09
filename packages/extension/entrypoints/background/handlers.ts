import { browser } from "wxt/browser";
import {
  analyzeListing,
  computeGlobalScore,
  correctedLocation,
  extractListingGeneric,
  generateNegotiationEmails,
  geocode,
  type Enrichments,
  type Listing,
  type Report,
} from "@pepite/core";
import { hasLlmPermission } from "@/lib/llm-permission";
import type { PepiteRequest } from "@/lib/messages";
import { idbRepository } from "@/lib/repository-idb";
import { getSettings, toLlmConfig } from "@/lib/settings";
import { buildEnrichments } from "./enrichments";
import { withKeepAlive } from "./keep-alive";
import { resolvePoint, runListingPipeline } from "./pipeline";
import { openSidePanel } from "./side-panel";
import { ensureTabState, getTabState, hydrateTabStates, setTabState } from "./tab-states";

/** Message d'explication affiché par le side panel quand l'extraction générique échoue. */
export const EXTRACTION_FAILED_MESSAGE =
  "Pépite n'a pas réussi à identifier une annonce exploitable sur cette page (prix, surface…). " +
  "Recharge la page une fois l'annonce affichée, ou réessaie sur une autre annonce.";

/** Expéditeur d'un message runtime — seul le sous-ensemble utilisé est typé. */
export interface MessageSenderLike {
  tab?: { id?: number; url?: string };
}

/**
 * Traite une requête asynchrone et retourne le payload de réponse — ne touche
 * jamais à sendResponse (c'est l'affaire d'onRuntimeMessage). Les exceptions
 * remontent à l'appelant.
 */
export async function handleMessage(
  req: PepiteRequest,
  sender: MessageSenderLike,
): Promise<unknown> {
  // Réveil du service worker : recharger les états d'onglets persistés
  // avant tout accès à tabStates.
  await hydrateTabStates();
  switch (req.type) {
    case "LISTING_DETECTED": {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return null;
      return await runListingPipeline(tabId, req.listing);
    }
    case "EXTRACT_GENERIC": {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return null;
      const settings = await getSettings();
      const cfg = toLlmConfig(settings);
      // L'extraction générique coûte un appel LLM : sans clé, on ne tente rien.
      if (!cfg) return { error: "NO_API_KEY" };
      // Origine IA optionnelle non accordée : erreur actionnable plutôt qu'un échec CORS obscur.
      if (!(await hasLlmPermission(cfg))) return { error: "NO_HOST_PERMISSION" };
      let listing: Listing;
      try {
        // Appel LLM potentiellement long : keepalive pour l'event page Firefox.
        listing = await withKeepAlive(() => extractListingGeneric(req.pageText, req.url, cfg));
      } catch {
        // Pas d'annonce identifiable ou extraction invalide → badge neutre,
        // et état d'erreur mémorisé pour que le side panel explique.
        setTabState(tabId, { status: "error", error: EXTRACTION_FAILED_MESSAGE });
        return { error: "EXTRACTION_FAIBLE" };
      }
      // Garde qualité : résultat trop pauvre pour être présenté.
      if (
        !listing.price ||
        listing.price < 5000 ||
        (!listing.surface && !listing.rooms && !listing.propertyType)
      ) {
        setTabState(tabId, { status: "error", error: EXTRACTION_FAILED_MESSAGE });
        return { error: "EXTRACTION_FAIBLE" };
      }
      return await runListingPipeline(tabId, listing);
    }
    case "GET_TAB_STATE": {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tabId = req.tabId ?? tabs[0]?.id;
      const tabUrl = tabs[0]?.url;
      const resolvedState =
        tabId !== undefined
          ? (getTabState(tabId) ?? { status: "idle" as const })
          : { status: "idle" as const };
      if (tabId !== undefined && resolvedState.status === "idle") {
        ensureTabState(tabId, tabUrl);
      }
      return { tabId, state: resolvedState };
    }
    case "RUN_FULL_ANALYSIS": {
      const prev = getTabState(req.tabId);
      if (!prev?.listing || !prev.quick)
        return { error: "Aucune annonce analysée sur cet onglet" };
      // Captures locales : le narrowing du garde ci-dessus ne survit pas
      // dans la closure passée à withKeepAlive.
      const { listing, quick } = prev;
      const settings = await getSettings();
      const cfg = toLlmConfig(settings);
      if (!cfg) return { error: "NO_API_KEY" };
      if (!(await hasLlmPermission(cfg))) return { error: "NO_HOST_PERMISSION" };

      setTabState(req.tabId, { ...prev, status: "full-running" });
      try {
        // Enrichissements + appel LLM (20-60 s) : keepalive pour l'event page Firefox.
        return await withKeepAlive(async () => {
          // Recompute point if it was not resolved during quick analysis
          // (e.g. after a service-worker restart or when geocoding failed transiently).
          let point = prev.point ?? null;
          if (!point) {
            point = await resolvePoint(listing);
            if (point) setTabState(req.tabId, { ...prev, status: "full-running", point });
          }
          const enrichments: Enrichments | undefined = point
            ? await buildEnrichments(point, listing)
            : undefined;

          const analysis = await analyzeListing(
            {
              listing: listing,
              quick: quick,
              enrichments,
              searchProfile: settings.searchProfile.trim() || undefined,
            },
            cfg,
          );
          const globalScore = computeGlobalScore(quick, listing, enrichments) ?? undefined;
          const report: Report = {
            id: crypto.randomUUID(),
            listingUrl: listing.url,
            createdAt: new Date().toISOString(),
            listing: listing,
            quick: quick,
            analysis,
            provider: cfg.provider,
            model: cfg.model,
            enrichments,
            globalScore,
          };
          await idbRepository.saveReport(report);
          setTabState(req.tabId, { ...prev, status: "full-done", reportId: report.id });
          return { reportId: report.id, analysis, enrichments, globalScore };
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setTabState(req.tabId, { ...prev, status: "error", error: msg });
        return { error: msg };
      }
    }
    case "CORRECT_LOCATION": {
      const prev = getTabState(req.tabId);
      if (!prev?.listing)
        return { error: "Aucune annonce analysée sur cet onglet" };
      // Échec HTTP du géocodeur : l'erreur remonte via le catch d'onRuntimeMessage.
      const geo = await geocode(req.address);
      if (!geo)
        return {
          error:
            "Adresse introuvable — précise la ville (ex. « 12 rue X, 97400 Saint-Denis »)",
        };
      const listing: Listing = {
        ...prev.listing,
        location: correctedLocation(req.address, geo),
      };
      // Persisté AVANT le pipeline : runListingPipeline réapplique la
      // localisation corrigée sauvegardée — elle doit déjà être la nouvelle.
      await idbRepository.saveListing(listing);
      const quick = await runListingPipeline(req.tabId, listing);
      // Le badge du content script ne reçoit pas TAB_STATE_CHANGED
      // (broadcast limité aux pages d'extension) : on le notifie directement.
      if (quick)
        void browser.tabs
          .sendMessage(req.tabId, { type: "QUICK_UPDATED", quick })
          .catch(() => {});
      return { state: getTabState(req.tabId) ?? { status: "idle" } };
    }
    case "SAVE_USER_NOTES": {
      const prev = getTabState(req.tabId);
      if (!prev?.listing)
        return { error: "Aucune annonce analysée sur cet onglet" };
      // Notes vides → champ retiré (pas de section vide dans les prompts).
      const notes = req.notes.trim();
      const listing: Listing = { ...prev.listing, userNotes: notes || undefined };
      // Persisté dans l'IDB : runListingPipeline les réapplique au re-parse.
      await idbRepository.saveListing(listing);
      // Pas de relance du pipeline : les notes n'affectent pas le quick/marché —
      // c'est l'analyse IA (ou ⟳) qui les consomme.
      setTabState(req.tabId, { ...prev, listing });
      return { state: getTabState(req.tabId) ?? { status: "idle" } };
    }
    case "GENERATE_NEGOTIATION_EMAILS": {
      const report = await idbRepository.getReport(req.reportId);
      if (!report) return { error: "Rapport introuvable" };
      const settings = await getSettings();
      const cfg = toLlmConfig(settings);
      if (!cfg) return { error: "NO_API_KEY" };
      if (!(await hasLlmPermission(cfg))) return { error: "NO_HOST_PERMISSION" };
      try {
        // Appel LLM potentiellement long : keepalive pour l'event page Firefox.
        const emails = await withKeepAlive(() =>
          generateNegotiationEmails({
            listing: report.listing,
            quick: report.quick,
            analysis: report.analysis,
            enrichments: report.enrichments,
            settings: cfg,
          }),
        );
        // Persistance sur le rapport existant (même id, pas de nouveau rapport).
        await idbRepository.saveReport({ ...report, negotiationEmails: emails });
        return { emails };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    default:
      return null;
  }
}

/**
 * Listener runtime.onMessage câblé par index.ts. Porte les deux invariants :
 * - OPEN_SIDE_PANEL traité 100 % synchrone (le contexte user-gesture ne
 *   survit à aucun await) puis `return false` ;
 * - tout chemin asynchrone résout sendResponse exactement une fois, y compris
 *   sur exception — sans ça l'appelant resterait suspendu sur un sendMessage
 *   sans réponse.
 */
export function onRuntimeMessage(
  message: unknown,
  sender: MessageSenderLike,
  sendResponse: (r: unknown) => void,
): boolean {
  const req = message as PepiteRequest;

  if (req.type === "OPEN_SIDE_PANEL") {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url;
    if (tabId !== undefined) {
      openSidePanel(tabId);
      // ensureTabState n'exige pas le contexte user-gesture : on attend la
      // réhydratation pour ne pas relancer une détection déjà mémorisée.
      void hydrateTabStates().then(() => ensureTabState(tabId, tabUrl));
    }
    sendResponse(null);
    return false;
  }

  handleMessage(req, sender)
    .then(sendResponse)
    .catch((err: unknown) => {
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    });
  return true; // réponse asynchrone
}
