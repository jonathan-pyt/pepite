import type { Site } from "../types";
import { isLeboncoinListingPage } from "./leboncoin";
import { isSelogerListingPage } from "./seloger";
import { isCityaListingPage } from "./citya";
import { isParuvenduListingPage } from "./paruvendu";

/**
 * Registry of supported sites. Each entry knows how to recognise its domain
 * (`detect`) and whether a given URL points to a single listing (`isListing`).
 *
 * URL patterns are derived from real fixtures captured via the owner's browser
 * (updated 2026-06).
 *
 * SeLoger:  /annonces/achat/appartement/saint-denis-974/271190031.htm
 *           /annonce/achat/ile-de-france/paris-75/paris-75000/26SNZN4PBSMG  (since 2026-10)
 * Citya:    /annonces/vente/appartement/charleville-mezieres-08000/TAPP949326A
 * Bien'ici: /annonce/vente/{ville}/{type}/{N}pieces/{ref}  (SPA — fixture pending)
 * ParuVendu: /immobilier/vente/maison/1291571535A1KIVHMN000  (vente seule, 2026-10)
 */
type SupportedSite = Exclude<Site, "generic">;

interface SiteEntry {
  site: SupportedSite;
  /** Matches the site's domain (any page on the site). */
  detect: RegExp;
  /** True when the URL is a single property listing page. */
  isListing: (url: string) => boolean;
}

const SITES: SiteEntry[] = [
  {
    site: "leboncoin",
    detect: /(^|\.)leboncoin\.fr\//,
    isListing: isLeboncoinListingPage,
  },
  {
    site: "seloger",
    detect: /(^|\.)seloger\.com\//,
    // ex: /annonces/achat/appartement/saint-denis-974/271190031.htm
    //     /annonce/achat/ile-de-france/paris-75/paris-75000/26SNZN4PBSMG
    isListing: isSelogerListingPage,
  },
  {
    site: "bienici",
    detect: /(^|\.)bienici\.com\//,
    // ex: /annonce/vente/nantes/appartement/3pieces/ref
    //     /annonce/vente/{type}/{pieces}/{ref}
    //     /annonce/location/...
    isListing: (url) => /bienici\.com\/annonce\/(vente|location)\//.test(url),
  },
  {
    site: "citya",
    detect: /(^|\.)citya\.com\//,
    // ex: /annonces/vente/appartement/charleville-mezieres-08000/TAPP949326A
    isListing: isCityaListingPage,
  },
  {
    site: "paruvendu",
    detect: /(^|\.)paruvendu\.fr\//,
    // ex: /immobilier/vente/maison/1291571535A1KIVHMN000
    isListing: isParuvenduListingPage,
  },
];

export function detectSite(url: string): SupportedSite | null {
  for (const entry of SITES) {
    if (entry.detect.test(url)) return entry.site;
  }
  return null;
}

export function isListingPage(url: string): boolean {
  for (const entry of SITES) {
    if (entry.detect.test(url)) return entry.isListing(url);
  }
  return false;
}
