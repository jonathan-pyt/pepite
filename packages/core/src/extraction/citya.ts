import type { Listing } from "../types";
import { buildRawAddress, toLetter, toNumber, toPropertyType, toStr } from "./mapping";

const UNKNOWN = "citya: structure inconnue";

export function isCityaListingPage(url: string): boolean {
  return /citya\.com\/annonces\/[^?#]+\/[A-Z]+\d+[A-Z]*/.test(url);
}

// ── JSON-LD helpers ───────────────────────────────────────────────────────

interface RealEstateListing {
  "@type"?: unknown;
  mainEntity?: unknown;
  image?: unknown;
}

interface ItemOffered {
  "@type"?: unknown;
  name?: unknown;
  description?: unknown;
  address?: unknown;
  numberOfRooms?: unknown;
  floorSize?: unknown;
}

interface Offer {
  "@type"?: unknown;
  price?: unknown;
  priceCurrency?: unknown;
  itemOffered?: unknown;
}

interface LegacyProduct {
  "@type"?: unknown;
  name?: unknown;
  description?: unknown;
  image?: unknown;
  offers?: unknown;
  address?: unknown;
}

/** Flatten any JSON-LD payload (object, array, @graph) into a flat node list. */
function ldNodes(data: unknown): unknown[] {
  if (Array.isArray(data)) return data.flatMap(ldNodes);
  if (data && typeof data === "object") {
    const obj = data as { "@graph"?: unknown };
    if (Array.isArray(obj["@graph"])) return obj["@graph"].flatMap(ldNodes);
    return [data];
  }
  return [];
}

function readImages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((p): p is string => typeof p === "string");
  return [];
}

/**
 * Try the REAL structure (observed 2026-06):
 *   RealEstateListing → mainEntity: Offer → itemOffered: Apartment
 */
function tryRealEstateListing(
  node: unknown,
  topImage: unknown,
): Omit<Listing, "url" | "site" | "extractedAt"> | null {
  const n = node as RealEstateListing;
  if (n["@type"] !== "RealEstateListing") return null;
  const offer = n.mainEntity as Offer | undefined;
  if (!offer) return null;

  const price = toNumber(offer.price);
  if (!price || price <= 0) return null;

  const item = (offer.itemOffered ?? {}) as ItemOffered;
  const address = (item.address ?? {}) as Record<string, unknown>;
  const floorSize = (item.floorSize ?? {}) as Record<string, unknown>;

  const city = toStr(address.addressLocality);
  const postalCode = toStr(address.postalCode);
  const surface = toNumber(floorSize.value);
  const rooms = toNumber(item.numberOfRooms);
  const title = toStr(item.name) ?? "";
  const description = toStr(item.description) ?? "";
  const propertyType = toPropertyType(item["@type"]) ?? toPropertyType(item.name);

  // image lives at RealEstateListing level
  const photos = readImages(n.image ?? topImage);

  return {
    title,
    price,
    surface,
    rooms,
    propertyType,
    location: { rawAddress: buildRawAddress(city, postalCode, undefined), city, postalCode },
    description,
    photos,
  };
}

/**
 * Fallback: legacy Product/Offer shape (observed in earlier versions / other
 * properties). Kept for robustness.
 */
function tryLegacyProduct(
  node: unknown,
): Omit<Listing, "url" | "site" | "extractedAt"> | null {
  const n = node as LegacyProduct;
  const offers = n.offers;
  if (!offers || typeof offers !== "object") return null;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const price = toNumber((offer as { price?: unknown })?.price);
  if (!price || price <= 0) return null;

  const address = (n.address ?? {}) as Record<string, unknown>;
  const city = toStr(address.addressLocality);
  const postalCode = toStr(address.postalCode);

  return {
    title: toStr(n.name) ?? "",
    price,
    propertyType: toPropertyType(n.name),
    location: { rawAddress: buildRawAddress(city, postalCode, undefined), city, postalCode },
    dpe: toLetter((n as Record<string, unknown>).energyEfficiencyScaleMin),
    ges: toLetter((n as Record<string, unknown>).co2EmissionsScaleMin),
    description: toStr(n.description) ?? "",
    photos: readImages(n.image),
  };
}

export function parseCitya(doc: Document, url: string): Listing {
  const scripts = doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');

  for (const script of scripts) {
    if (!script.textContent) continue;
    let data: unknown;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }

    for (const node of ldNodes(data)) {
      // Try real structure first
      const real = tryRealEstateListing(node, (node as Record<string, unknown>).image);
      if (real) {
        return { url, site: "citya", extractedAt: new Date().toISOString(), ...real };
      }

      // Fallback: legacy Product/Offer
      const legacy = tryLegacyProduct(node);
      if (legacy) {
        return { url, site: "citya", extractedAt: new Date().toISOString(), ...legacy };
      }
    }
  }

  throw new Error(UNKNOWN);
}
