import type { Listing } from "../types";
import { buildRawAddress, toLetter, toNumber, toPropertyType, toStr } from "./mapping";

/**
 * Bien'ici parser — TRIES known embedded-JSON patterns and THROWS a clear
 * "structure inconnue" error when not found.
 *
 * Bien'ici embeds its ad payload in a JSON script tag. The shape below is
 * plausible but UNVERIFIED — real pages could not be fetched (DataDome). It
 * will be refined with real fixtures captured via the owner's browser. The
 * generic LLM fallback is the production value of this release.
 */
const UNKNOWN = "bienici: structure inconnue (fixtures réelles à capturer)";

interface BieniciAd {
  title?: unknown;
  propertyType?: unknown;
  price?: unknown;
  surfaceArea?: unknown;
  roomsQuantity?: unknown;
  city?: unknown;
  postalCode?: unknown;
  district?: unknown;
  energyClassification?: unknown;
  greenhouseGazClassification?: unknown;
  description?: unknown;
  publicationDate?: unknown;
  photos?: unknown;
}

function readAd(doc: Document): BieniciAd | null {
  // Bien'ici embeds JSON in a script tag; try the data-testid hooks first,
  // then any application/json script that parses to an object with a price.
  const scripts = [
    ...doc.querySelectorAll<HTMLScriptElement>('script[data-testid*="ad"]'),
    ...doc.querySelectorAll<HTMLScriptElement>('script[type="application/json"]'),
  ];
  for (const script of scripts) {
    if (!script.textContent) continue;
    try {
      const data = JSON.parse(script.textContent) as unknown;
      if (data && typeof data === "object") return data as BieniciAd;
    } catch {
      // try next script
    }
  }
  return null;
}

function readDistrict(value: unknown): string | undefined {
  if (typeof value === "string") return toStr(value);
  if (value && typeof value === "object") return toStr((value as { name?: unknown }).name);
  return undefined;
}

function readPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((p) => (typeof p === "string" ? p : toStr((p as { url?: unknown })?.url)))
    .filter((p): p is string => typeof p === "string");
}

export function parseBienici(doc: Document, url: string): Listing {
  const ad = readAd(doc);
  if (!ad) throw new Error(UNKNOWN);

  const price = toNumber(ad.price);
  if (price === undefined || price <= 0) throw new Error(UNKNOWN);

  const city = toStr(ad.city);
  const postalCode = toStr(ad.postalCode);
  const district = readDistrict(ad.district);

  return {
    url,
    site: "bienici",
    title: toStr(ad.title) ?? "",
    price,
    surface: toNumber(ad.surfaceArea),
    rooms: toNumber(ad.roomsQuantity),
    propertyType: toPropertyType(ad.propertyType),
    location: { rawAddress: buildRawAddress(city, postalCode, district), city, postalCode, district },
    dpe: toLetter(ad.energyClassification),
    ges: toLetter(ad.greenhouseGazClassification),
    description: toStr(ad.description) ?? "",
    photos: readPhotos(ad.photos),
    publishedAt: toStr(ad.publicationDate),
    extractedAt: new Date().toISOString(),
  };
}
