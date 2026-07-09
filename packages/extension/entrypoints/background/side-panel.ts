import { browser } from "wxt/browser";

/**
 * Firefox uniquement : équivalent du sidePanel Chrome (clé manifest
 * sidebar_action). Non typé par @wxt-dev/browser (types Chrome) → cast localisé.
 */
const sidebarAction = (
  browser as unknown as { sidebarAction?: { open(): Promise<void> } }
).sidebarAction;

/** Câble l'ouverture du panneau au clic sur l'icône de la barre d'outils. */
export function setupSidePanelActionBehavior() {
  // browser.sidePanel is typed by @wxt-dev/browser (Chrome 114+, MV3).
  // Absent sur Firefox (l'optional chaining court-circuite toute la chaîne) :
  // pas d'équivalent sidebarAction — l'ouverture passe par le badge (OPEN_SIDE_PANEL)
  // ou l'UI sidebar native de Firefox.
  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  // Firefox : équivalent du setPanelBehavior ci-dessus — le clic sur l'icône
  // Pépite de la barre d'outils ouvre la sidebar. action.onClicked est un vrai
  // « user input handler » (MDN User actions), contrairement au handler
  // runtime.onMessage du badge : l'appel doit rester synchrone (aucun await
  // avant), sinon le statut user-input est perdu et open() rejette.
  if (!browser.sidePanel && sidebarAction) {
    browser.action.onClicked.addListener(() => {
      void sidebarAction.open().catch(() => {});
    });
  }
}

/**
 * Ouverture depuis le badge (message OPEN_SIDE_PANEL) — SYNCHRONE : le contexte
 * user-gesture ne survit à aucun await.
 *
 * Chrome : sidePanel.open accepte un message issu d'un clic dans un content
 * script, tant qu'on reste dans le chemin synchrone.
 * Firefox : sidebarAction.open rejette TOUJOURS ici (« may only be called from
 * a user input handler ») — le statut user-input ne traverse pas
 * runtime.sendMessage depuis une page web (MDN User actions), même clic trusted
 * et listener 100 % synchrone. On tente quand même (gratuit, et prêt si Firefox
 * assouplit la règle) ; la vraie ouverture passe par action.onClicked ci-dessus.
 */
export function openSidePanel(tabId: number) {
  if (browser.sidePanel) void browser.sidePanel.open({ tabId }).catch(() => {});
  else void sidebarAction?.open().catch(() => {});
}
