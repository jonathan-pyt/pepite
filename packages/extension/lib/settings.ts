import { storage } from "wxt/utils/storage";
import type { LlmConfig, LlmProviderId } from "@pepite/core";
import { DEFAULT_MODELS } from "@pepite/core";

export interface Settings {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
}

const settingsItem = storage.defineItem<Settings>("local:settings", {
  fallback: { provider: "google", apiKey: "", model: DEFAULT_MODELS.google },
});

export async function getSettings(): Promise<Settings> {
  return settingsItem.getValue();
}

export async function saveSettings(s: Settings): Promise<void> {
  await settingsItem.setValue(s);
}

export function toLlmConfig(s: Settings): LlmConfig | null {
  if (!s.apiKey) return null;
  return { provider: s.provider, apiKey: s.apiKey, model: s.model };
}
