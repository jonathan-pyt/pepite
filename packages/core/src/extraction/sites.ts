import type { Site } from "../types";
import { isLeboncoinListingPage } from "./leboncoin";

/**
 * Registry of supported sites. Each entry knows how to recognise its domain
 * (`detect`) and whether a given URL points to a single listing (`isListing`).
 *
 * URL patterns for seloger/bienici/citya are derived from public URL structures
 * and coded defensively — they will be refined once real fixtures are captured
 * via the owner's browser (DataDome blocks server-side fetches).
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
    // ex: /annonces/achat/appartement/nantes-44/123456789.htm
    isListing: (url) => /seloger\.com\/annonces\/[^?#]*\/\d+\.htm/.test(url),
  },
  {
    site: "bienici",
    detect: /(^|\.)bienici\.com\//,
    // ex: /annonce/vente/nantes/appartement/3pieces/abc-123
    isListing: (url) => /bienici\.com\/annonce\/(vente|location)\//.test(url),
  },
  {
    site: "citya",
    detect: /(^|\.)citya\.com\//,
    // ex: /annonce/12345  ou /annonces/achat/appartement/nantes/12345
    isListing: (url) =>
      /citya\.com\/annonce\/\d+/.test(url) ||
      /citya\.com\/annonces\/[^?#]*\/\d+(\/|$|\?|#)/.test(url),
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
