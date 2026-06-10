import type { Listing } from "../types";
import { buildRawAddress, toLetter, toNumber, toPropertyType, toStr } from "./mapping";

/**
 * Citya parser — TRIES schema.org JSON-LD (the most stable public structure on
 * Citya pages) and THROWS a clear "structure inconnue" error when no usable
 * offer is found.
 *
 * The exact JSON-LD shape is plausible but UNVERIFIED — real pages could not be
 * fetched. It will be refined with real fixtures captured via the owner's
 * browser. The generic LLM fallback is the production value of this release.
 */
const UNKNOWN = "citya: structure inconnue (fixtures réelles à capturer)";

interface JsonLdProduct {
  "@type"?: unknown;
  name?: unknown;
  description?: unknown;
  image?: unknown;
  offers?: unknown;
  address?: unknown;
}

/** Flatten any JSON-LD payload (object, array, or @graph) into a node list. */
function ldNodes(data: unknown): JsonLdProduct[] {
  if (Array.isArray(data)) return data.flatMap(ldNodes);
  if (data && typeof data === "object") {
    const obj = data as { "@graph"?: unknown };
    if (Array.isArray(obj["@graph"])) return obj["@graph"].flatMap(ldNodes);
    return [data as JsonLdProduct];
  }
  return [];
}

function priceOf(node: JsonLdProduct): number | undefined {
  const offers = node.offers;
  if (!offers || typeof offers !== "object") return undefined;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  return toNumber((offer as { price?: unknown })?.price);
}

function readImages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((p): p is string => typeof p === "string");
  return [];
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
      const price = priceOf(node);
      if (price === undefined || price <= 0) continue;

      const address = (node.address ?? {}) as Record<string, unknown>;
      const city = toStr(address.addressLocality);
      const postalCode = toStr(address.postalCode);

      return {
        url,
        site: "citya",
        title: toStr(node.name) ?? "",
        price,
        propertyType: toPropertyType(node.name),
        location: { rawAddress: buildRawAddress(city, postalCode, undefined), city, postalCode },
        dpe: toLetter((node as Record<string, unknown>).energyEfficiencyScaleMin),
        ges: toLetter((node as Record<string, unknown>).co2EmissionsScaleMin),
        description: toStr(node.description) ?? "",
        photos: readImages(node.image),
        extractedAt: new Date().toISOString(),
      };
    }
  }
  throw new Error(UNKNOWN);
}
