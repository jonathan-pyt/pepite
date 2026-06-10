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
