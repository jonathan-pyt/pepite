/**
 * Origines réseau requises par l'extension (APIs publiques + CDN photos).
 *
 * Source unique partagée entre le manifest (wxt.config.ts) et le bandeau de
 * demande d'accès du side panel : sur Firefox MV3 les host_permissions sont
 * optionnelles (non accordées à l'installation), il faut les demander via
 * browser.permissions.request — la liste doit donc correspondre exactement
 * au manifest pour être « requestable ».
 */
export const HOST_PERMISSIONS: string[] = [
  "https://data.geopf.fr/*",
  "https://files.data.gouv.fr/*",
  // Les CSV DVF de files.data.gouv.fr répondent par un 302 vers ce S3 OVH
  "https://*.io.cloud.ovh.net/*",
  "https://generativelanguage.googleapis.com/*",
  "https://api.anthropic.com/*",
  "https://api.openai.com/*",
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
  "https://photo.bienici.com/*",
  "https://img.citya.com/*",
  "https://www.citya.com/*",
];

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
