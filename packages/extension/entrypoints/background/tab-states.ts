import { browser } from "wxt/browser";
import { isListingPage } from "@pepite/core";
import type { TabState } from "@/lib/messages";

const tabStates = new Map<number, TabState>();

/** Clé unique sous laquelle la Map est persistée dans chrome.storage.session. */
const TAB_STATES_STORAGE_KEY = "tabStates";

/**
 * Réhydratation lazy de tabStates depuis storage.session après la mort du
 * service worker MV3. La Map RAM reste le cache de travail ; storage.session
 * (mémoire navigateur, vidé à sa fermeture) survit aux redémarrages du SW.
 */
let hydration: Promise<void> | null = null;
export function hydrateTabStates(): Promise<void> {
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

export function getTabState(tabId: number): TabState | undefined {
  return tabStates.get(tabId);
}

export function setTabState(tabId: number, state: TabState) {
  tabStates.set(tabId, state);
  persistTabStates();
  void browser.runtime
    .sendMessage({ type: "TAB_STATE_CHANGED", tabId, state })
    .catch(() => {}); // personne n'écoute → normal
}

/** Onglet fermé : retire son état du cache RAM et du snapshot persisté. */
export async function removeTabState(tabId: number): Promise<void> {
  // Hydrater d'abord : sinon le snapshot persisté serait écrasé par une Map vide.
  await hydrateTabStates();
  tabStates.delete(tabId);
  persistTabStates();
}

/**
 * If the tab is on a supported listing page but its state is still idle (e.g.
 * after service-worker death), ask the content script to re-detect the listing.
 */
export function ensureTabState(tabId: number, url: string | undefined) {
  if (!url || !isListingPage(url)) return;
  // Un état non-idle existe déjà (annonce détectée, ou échec d'extraction
  // mémorisé) : ne pas relancer la détection — sinon chaque ouverture du side
  // panel après un échec d'extraction générique re-déclencherait un appel LLM.
  const state = tabStates.get(tabId);
  if (state && state.status !== "idle") return;
  void browser.tabs.sendMessage(tabId, { type: "REDETECT" }).catch(() => {});
}

/** Isolation des tests : vide la Map RAM et oublie l'hydratation single-flight. */
export function resetTabStatesForTests() {
  tabStates.clear();
  hydration = null;
}
