import { onRuntimeMessage } from "./handlers";
import { setupSidePanelActionBehavior } from "./side-panel";
import { removeTabState } from "./tab-states";

// Entrypoint minimal : uniquement le câblage des listeners — la logique vit
// dans les modules frères, testables sans defineBackground. Aucun side effect
// top-level : WXT importe ce fichier en Node au build pour lire les options.
export default defineBackground(() => {
  setupSidePanelActionBehavior();

  // Première installation : ouvre la page d'accueil/réglages (votre projet,
  // deux modes d'analyse). Uniquement à l'install — jamais sur les mises à jour.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") void browser.runtime.openOptionsPage();
  });

  browser.tabs.onRemoved.addListener((tabId) => void removeTabState(tabId));

  browser.runtime.onMessage.addListener(onRuntimeMessage);
});
