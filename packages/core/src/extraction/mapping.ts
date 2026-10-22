import type { PropertyType } from "../types";

/** Coerce an unknown value to a finite positive number (parses strings like "289 000 €"). */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,]/g, "").replace(/\s/g, "").replace(",", ".");
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Surface d'un libellé (« 93m2 environ », « 1 250 m² ») ; toNumber garderait le « 2 » de m2. */
export function toSurface(value: unknown): number | undefined {
  const m = toStr(value)?.match(/(\d[\d\s  ]*(?:[.,]\d+)?)\s*m/);
  return m?.[1] ? toNumber(m[1]) : undefined;
}

/** Flatten any JSON-LD payload (object, array, @graph) into a flat node list. */
export function ldNodes(data: unknown): unknown[] {
  if (Array.isArray(data)) return data.flatMap(ldNodes);
  if (data && typeof data === "object") {
    const obj = data as { "@graph"?: unknown };
    if (Array.isArray(obj["@graph"])) return obj["@graph"].flatMap(ldNodes);
    return [data];
  }
  return [];
}

/** Every JSON-LD node of the page, flattened; unparseable scripts are skipped. */
export function readLdNodes(doc: Document): unknown[] {
  return [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
    if (!script.textContent) return [];
    try {
      return ldNodes(JSON.parse(script.textContent));
    } catch {
      return [];
    }
  });
}

export function toStr(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t : undefined;
}

/** Normalise a DPE/GES letter; returns undefined unless it's a single A-G letter. */
export function toLetter(value: unknown): string | undefined {
  const s = toStr(value);
  if (!s) return undefined;
  const up = s.toUpperCase();
  return /^[A-G]$/.test(up) ? up : undefined;
}

/** Map a site-specific property-type token to the normalised PropertyType. */
export function toPropertyType(value: unknown): PropertyType | undefined {
  const s = toStr(value)?.toLowerCase();
  if (!s) return undefined;
  if (/(appartement|flat|apartment)/.test(s)) return "Appartement";
  if (/(maison|house|villa)/.test(s)) return "Maison";
  return undefined;
}

export function buildRawAddress(
  city: string | undefined,
  postalCode: string | undefined,
  district: string | undefined,
): string {
  return [city, postalCode, district].filter(Boolean).join(" ");
}
