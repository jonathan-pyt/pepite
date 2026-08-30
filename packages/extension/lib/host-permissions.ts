import type { LlmProviderId } from "@pepite/core";

/**
 * Origines réseau requises par l'extension (APIs publiques + CDN photos).
 *
 * Source unique partagée entre le manifest (wxt.config.ts) et le bandeau de
 * demande d'accès du side panel : sur Firefox MV3 les host_permissions sont
 * optionnelles (non accordées à l'installation), il faut les demander via
 * browser.permissions.request — la liste doit donc correspondre exactement
 * au manifest pour être « requestable ».
 *
 * Les origines des fournisseurs d'IA n'en font PAS partie : optionnelles,
 * demandées pour le seul fournisseur configuré (cf. OPTIONAL_HOST_PERMISSIONS).
 */
export const HOST_PERMISSIONS: string[] = [
  "https://data.geopf.fr/*",
  "https://files.data.gouv.fr/*",
  // Les CSV DVF de files.data.gouv.fr répondent par un 302 vers ce S3 OVH
  "https://*.io.cloud.ovh.net/*",
  "https://overpass-api.de/*",
  "https://overpass.osm.ch/*",
  "https://www.georisques.gouv.fr/*",
  "https://www.data.gouv.fr/*",
  "https://static.data.gouv.fr/*",
  "https://geo.api.gouv.fr/*",
  "https://apicarto.ign.fr/*",
  "https://data.economie.gouv.fr/*",
  // CDN photos des annonces (Restyle IA — fetch depuis la page extension),
  // domaines relevés dans packages/core/src/extraction (fixtures + parseurs)
  "https://img.leboncoin.fr/*",
  "https://mms.seloger.com/*",
  // Bien'ici sert ses photos depuis file.bienici.com (vérifié 2026-08-28 sur
  // le payload realEstateAd.json) — photo.bienici.com était une supposition.
  "https://file.bienici.com/*",
  "https://img.citya.com/*",
  "https://www.citya.com/*",
];

/** Origine de l'API officielle de chaque fournisseur d'IA. */
export const PROVIDER_ORIGINS: Record<LlmProviderId, string> = {
  google: "https://generativelanguage.googleapis.com/*",
  anthropic: "https://api.anthropic.com/*",
  openai: "https://api.openai.com/*",
};

/**
 * Origines IA, toutes optionnelles : fournisseurs officiels + endpoints
 * OpenAI-compatible (Ollama cloud + local). Demandées depuis les réglages
 * pour le seul fournisseur configuré — un utilisateur Gemini n'accorde
 * jamais l'accès à api.openai.com. Requises au manifest, en ajouter une
 * désactiverait l'extension chez les utilisateurs Chrome existants à la
 * mise à jour ; les grants déjà accordés en requis restent actifs après
 * le passage en optionnel (modèle granted/active de Chromium).
 */
export const OPTIONAL_HOST_PERMISSIONS: string[] = [
  ...Object.values(PROVIDER_ORIGINS),
  "https://ollama.com/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
];

/**
 * Match pattern de l'origine d'un endpoint configuré, tel qu'attendu par
 * permissions.request/contains. Les match patterns ignorent le port :
 * http://localhost:11434/v1 → http://localhost/*.
 */
export function endpointOriginPattern(baseURL: string): string | null {
  try {
    const u = new URL(baseURL.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

/**
 * Match pattern de l'origine que le fournisseur configuré doit pouvoir
 * joindre : l'endpoint OpenAI-compatible s'il est renseigné, sinon l'API
 * officielle du fournisseur. null si l'endpoint est invalide.
 */
export function llmOriginPattern(cfg: { provider: LlmProviderId; baseURL?: string }): string | null {
  if (cfg.provider === "openai" && cfg.baseURL?.trim()) {
    return endpointOriginPattern(cfg.baseURL);
  }
  return PROVIDER_ORIGINS[cfg.provider];
}

/**
 * Domaines couverts par le content script (badge sur les sites d'annonces).
 * Utilisés comme `matches` du content script et inclus dans la demande
 * d'accès Firefox : sur Firefox MV3, les matches des content scripts ne sont
 * pas accordés à l'installation non plus — sans eux, pas de badge.
 */
export const LISTING_MATCHES: string[] = [
  "*://*.leboncoin.fr/*",
  "*://*.seloger.com/*",
  "*://*.bienici.com/*",
  "*://*.citya.com/*",
];
