import { storage } from "wxt/utils/storage";
import type { LlmConfig, LlmProviderId } from "@pepite/core";
import { DEFAULT_MODELS } from "@pepite/core";

export interface Settings {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
  baseURL?: string;
  /** Profil de recherche du foyer (texte libre) — injecté dans chaque analyse IA. */
  searchProfile: string;
}

const settingsItem = storage.defineItem<Settings>("local:settings", {
  fallback: { provider: "google", apiKey: "", model: DEFAULT_MODELS.google, baseURL: "", searchProfile: "" },
});

/**
 * Carte « Personnalisez vos analyses » du side panel masquée définitivement
 * (« plus tard ») — distinct du profil lui-même pour survivre à un profil vidé.
 */
const profileCardDismissedItem = storage.defineItem<boolean>("local:profileCardDismissed", {
  fallback: false,
});

export async function getSettings(): Promise<Settings> {
  // Réglages enregistrés avant l'ajout de champs : valeurs absentes du store.
  const s = await settingsItem.getValue();
  return { ...s, baseURL: s.baseURL ?? "", searchProfile: s.searchProfile ?? "" };
}

export function getProfileCardDismissed(): Promise<boolean> {
  return profileCardDismissedItem.getValue();
}

export async function dismissProfileCard(): Promise<void> {
  await profileCardDismissedItem.setValue(true);
}

export async function saveSettings(s: Settings): Promise<void> {
  await settingsItem.setValue(s);
}

export function toLlmConfig(s: Settings): LlmConfig | null {
  if (!s.apiKey) return null;
  return {
    provider: s.provider,
    apiKey: s.apiKey,
    model: s.model,
    ...(s.provider === "openai" && s.baseURL?.trim() ? { baseURL: s.baseURL.trim() } : {}),
  };
}
