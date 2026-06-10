import type { Listing } from "../types";
import { buildRawAddress, toLetter, toNumber, toPropertyType, toStr } from "./mapping";

const UNKNOWN = "seloger: structure inconnue";

export function isSelogerListingPage(url: string): boolean {
  return /seloger\.com\/annonces\/[^?#]*\/\d+\.htm/.test(url);
}

// ── Types for the __UFRN_LIFECYCLE_SERVERREQUEST__ state ──────────────────

interface SelogerFact {
  type: string;
  splitValue?: string;
}

interface SelogerCategoryElement {
  icon?: string;
  value: string;
}

interface SelogerCategory {
  title: string;
  elements: SelogerCategoryElement[];
}

interface SelogerState {
  app_cldp?: {
    data?: {
      classified?: {
        metadata?: { creationDate?: string };
        rawData?: { propertyTypeLabel?: string; propertyType?: string };
        legacyTracking?: {
          products?: Array<{
            price?: number;
            space?: number;
            nb_rooms?: number;
            nb_bedrooms?: number;
            estate_postalcode?: string;
          }>;
        };
        sections?: {
          hardFacts?: { title?: string; facts?: SelogerFact[] };
          location?: { address?: { city?: string; zipCode?: string } };
          description?: { description?: string };
          gallery?: { images?: Array<{ url?: string }> };
          energy?: {
            certificates?: Array<{
              scales?: Array<{ name?: string; rating?: string; value?: string }>;
            }>;
          };
          features?: {
            details?: { categories?: SelogerCategory[] };
          };
          price?: {
            base?: { main?: { value?: { main?: { ariaLabel?: string } } } };
          };
        };
      };
    };
  };
}

/**
 * Parse the __UFRN_LIFECYCLE_SERVERREQUEST__ state from a raw script text.
 * The script content looks like:
 *   window["__UFRN_LIFECYCLE_SERVERREQUEST__"]=JSON.parse("{\"app_cldp\":{...}}");
 * The argument is a JSON-encoded string (doubly escaped), so we match the full
 * JS string literal (handling \" escapes) and JSON.parse it twice.
 */
function parseStateFromText(text: string): SelogerState | null {
  if (!text.includes("__UFRN_LIFECYCLE_SERVERREQUEST__")) return null;
  // Match a JS string literal: "..." where \" is an escaped quote
  const m = text.match(
    /__UFRN_LIFECYCLE_SERVERREQUEST__[^=]*=\s*JSON\.parse\(("(?:[^"\\]|\\.)*")\)/,
  );
  if (!m || !m[1]) return null;
  try {
    // m[1] is e.g. "{\"app_cldp\":{...}}" — JSON.parse gives the inner JSON string
    const jsonStr = JSON.parse(m[1]) as string;
    return JSON.parse(jsonStr) as SelogerState;
  } catch {
    return null;
  }
}

function readStateFromHtml(html: string): SelogerState | null {
  // Split the raw HTML on script boundaries and probe each script block
  // This avoids relying on DOM parsing (which may drop large inline scripts)
  const regex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const block = match[1];
    if (!block) continue;
    const state = parseStateFromText(block);
    if (state) return state;
  }
  return null;
}

function readState(doc: Document): SelogerState | null {
  // In a live browser context (content-script), scripts are present in the DOM.
  const scripts = doc.querySelectorAll<HTMLScriptElement>("script:not([src])");
  for (const script of scripts) {
    const state = parseStateFromText(script.textContent ?? "");
    if (state) return state;
  }
  return null;
}

function findFact(facts: SelogerFact[], type: string): number | undefined {
  const f = facts.find((x) => x.type === type);
  return f?.splitValue ? Number(f.splitValue) : undefined;
}

function buildAttributes(
  categories: SelogerCategory[],
): { label: string; value: string }[] {
  const result: { label: string; value: string }[] = [];
  for (const cat of categories) {
    for (const el of cat.elements) {
      if (el.value?.trim()) {
        result.push({ label: cat.title, value: el.value });
      }
    }
  }
  return result;
}

function extractDpe(
  scales: Array<{ name?: string; rating?: string; value?: string }> | undefined,
): string | undefined {
  if (!scales) return undefined;
  for (const scale of scales) {
    const v = scale.rating ?? scale.value;
    const letter = toLetter(v);
    if (letter) return letter;
  }
  return undefined;
}

function buildListing(state: SelogerState, url: string): Listing {
  const classified = state.app_cldp?.data?.classified;
  if (!classified) throw new Error(UNKNOWN);
  if (!state) throw new Error(UNKNOWN);

  const ltProduct = classified.legacyTracking?.products?.[0];
  const sections = classified.sections;
  const rawData = classified.rawData;

  // Price — prefer numeric legacyTracking, fallback to ariaLabel string
  let price: number | undefined = ltProduct?.price ?? undefined;
  if (!price || price <= 0) {
    const ariaLabel = sections?.price?.base?.main?.value?.main?.ariaLabel;
    price = toNumber(ariaLabel);
  }
  if (!price || price <= 0) throw new Error(UNKNOWN);

  // Surface, rooms, bedrooms from legacyTracking (cleanest numeric source)
  const surface = ltProduct?.space ?? undefined;
  const rooms = ltProduct?.nb_rooms ?? undefined;
  const bedrooms = ltProduct?.nb_bedrooms ?? undefined;

  // Location
  const locAddr = sections?.location?.address;
  const city = toStr(locAddr?.city);
  const postalCode = toStr(locAddr?.zipCode) ?? toStr(ltProduct?.estate_postalcode);

  // Title
  const title = toStr(sections?.hardFacts?.title) ?? "";

  // Property type
  const propTypeStr = toStr(rawData?.propertyTypeLabel) ?? toStr(rawData?.propertyType);
  const propertyType = toPropertyType(propTypeStr);

  // Description
  const description = toStr(sections?.description?.description) ?? "";

  // Photos
  const photos = (sections?.gallery?.images ?? [])
    .map((img) => img.url)
    .filter((u): u is string => typeof u === "string");

  // DPE / GES — from energy certificates scales (may be absent for exempt properties)
  const certificates = sections?.energy?.certificates ?? [];
  const dpeScales = certificates[0]?.scales;
  const gesScales = certificates[1]?.scales;
  const dpe = extractDpe(dpeScales);
  const ges = extractDpe(gesScales);

  // Attributes from features.details.categories
  const categories = sections?.features?.details?.categories ?? [];
  const attrs = buildAttributes(categories);

  return {
    url,
    site: "seloger",
    title,
    price,
    surface: surface ? Number(surface) : undefined,
    rooms: rooms ? Number(rooms) : undefined,
    bedrooms: bedrooms ? Number(bedrooms) : undefined,
    propertyType,
    location: {
      rawAddress: buildRawAddress(city, postalCode, undefined),
      city,
      postalCode,
    },
    dpe,
    ges,
    description,
    photos,
    publishedAt: toStr(classified.metadata?.creationDate),
    extractedAt: new Date().toISOString(),
    attributes: attrs.length > 0 ? attrs : undefined,
  };
}

/** Parse from a live browser Document (content-script context). */
export function parseSeloger(doc: Document, url: string): Listing {
  const state = readState(doc);
  if (!state) throw new Error(UNKNOWN);
  return buildListing(state, url);
}

/** Parse from a raw HTML string (fixture tests, server-side). */
export function parseSelogerHtml(html: string, url: string): Listing {
  const state = readStateFromHtml(html);
  if (!state) throw new Error(UNKNOWN);
  return buildListing(state, url);
}
