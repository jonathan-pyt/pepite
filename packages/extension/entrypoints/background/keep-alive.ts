import { browser } from "wxt/browser";

/**
 * Maintient l'event page Firefox en vie pendant une opération longue.
 *
 * Sur Firefox MV3, le background est une event page tuée après ~30 s
 * d'inactivité ; un fetch en cours (appel LLM de 20-60 s) ne reset PAS le
 * timer — seuls les événements et appels d'API WebExtension le font
 * (bugzilla 1851373). Sans ça, la page meurt en pleine analyse et la
 * promesse sendMessage de l'appelant se résout avec undefined → spinner
 * infini côté side panel. Un appel d'API trivial toutes les 20 s reset le
 * timer ; inoffensif sur Chrome (service worker maintenu par ses propres
 * mécanismes).
 */
export async function withKeepAlive<T>(fn: () => Promise<T>): Promise<T> {
  const interval = setInterval(() => {
    void browser.runtime.getPlatformInfo().catch(() => {});
  }, 20_000);
  try {
    return await fn();
  } finally {
    clearInterval(interval);
  }
}
