import { browser } from "wxt/browser";
import type { LlmProviderId } from "@pepite/core";

import { llmOriginPattern } from "@/lib/host-permissions";

type LlmOriginConfig = { provider: LlmProviderId; baseURL?: string };

/** Vrai si l'origine du fournisseur configuré est déjà accordée. */
export async function hasLlmPermission(cfg: LlmOriginConfig): Promise<boolean> {
  const pattern = llmOriginPattern(cfg);
  if (!pattern) return false;
  // API permissions absente (vieux navigateur) → on ne bloque pas.
  if (!browser.permissions?.contains) return true;
  try {
    return await browser.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

/**
 * Vérifie l'origine du fournisseur et la demande si absente. À appeler depuis
 * un geste utilisateur (clic) : permissions.request l'exige.
 */
export async function ensureLlmPermission(cfg: LlmOriginConfig): Promise<boolean> {
  if (await hasLlmPermission(cfg)) return true;
  const pattern = llmOriginPattern(cfg);
  if (!pattern || !browser.permissions?.request) return false;
  try {
    return await browser.permissions.request({ origins: [pattern] });
  } catch {
    // Origine absente d'optional_host_permissions (endpoint exotique) ou refus.
    return false;
  }
}
