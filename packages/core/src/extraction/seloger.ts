import type { Listing } from "../types";
import { buildRawAddress, toLetter, toNumber, toPropertyType, toStr } from "./mapping";

/**
 * SeLoger parser — TRIES known embedded-JSON patterns and THROWS a clear
 * "structure inconnue" error when the expected shape is not found.
 *
 * SeLoger embeds its listing state in a Next.js-style `__NEXT_DATA__` script.
 * The exact shape below is plausible but UNVERIFIED — real pages are behind
 * DataDome and could not be fetched. It will be refined with real fixtures
 * captured via the owner's browser. The generic LLM fallback is the production
 * value of this release.
 */
const UNKNOWN = "seloger: structure inconnue (fixtures réelles à capturer)";

interface SelogerListing {
  title?: unknown;
  propertyType?: unknown;
  price?: unknown;
  surface?: unknown;
  rooms?: unknown;
  city?: unknown;
  zipCode?: unknown;
  district?: unknown;
  energyClassification?: unknown;
  gasEmissionClassification?: unknown;
  description?: unknown;
  publicationDate?: unknown;
  photos?: unknown;
}

function readState(doc: Document): SelogerListing | null {
  const script = doc.querySelector("script#__NEXT_DATA__");
  if (!script?.textContent) return null;
  let data: unknown;
  try {
    data = JSON.parse(script.textContent);
  } catch {
    return null;
  }
  const listing = (data as { props?: { pageProps?: { listing?: unknown } } })?.props?.pageProps
    ?.listing;
  return listing && typeof listing === "object" ? (listing as SelogerListing) : null;
}

export function parseSeloger(doc: Document, url: string): Listing {
  const state = readState(doc);
  if (!state) throw new Error(UNKNOWN);

  const price = toNumber(state.price);
  if (price === undefined || price <= 0) throw new Error(UNKNOWN);

  const city = toStr(state.city);
  const postalCode = toStr(state.zipCode);
  const district = toStr(state.district);
  const photos = Array.isArray(state.photos)
    ? state.photos.filter((p): p is string => typeof p === "string")
    : [];

  return {
    url,
    site: "seloger",
    title: toStr(state.title) ?? "",
    price,
    surface: toNumber(state.surface),
    rooms: toNumber(state.rooms),
    propertyType: toPropertyType(state.propertyType),
    location: { rawAddress: buildRawAddress(city, postalCode, district), city, postalCode, district },
    dpe: toLetter(state.energyClassification),
    ges: toLetter(state.gasEmissionClassification),
    description: toStr(state.description) ?? "",
    photos,
    publishedAt: toStr(state.publicationDate),
    extractedAt: new Date().toISOString(),
  };
}
