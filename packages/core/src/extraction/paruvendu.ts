import type { Listing } from "../types";
import { buildRawAddress, toLetter, toNumber, toPropertyType, toStr } from "./mapping";

const UNKNOWN = "paruvendu: structure inconnue";

// Vente uniquement : le pipeline compare le prix aux ventes DVF, un loyer y serait absurde.
export function isParuvenduListingPage(url: string): boolean {
  return /paruvendu\.fr\/immobilier\/vente\/[a-z-]+\/\d{6,}[A-Z0-9]*(?:[?#]|$)/.test(url);
}

function text(el: Element | null | undefined): string | undefined {
  return toStr(el?.textContent?.replace(/\s+/g, " "));
}

/** Critères « libellé / valeur » du bloc résumé (pièces, surface, chambres, équipements). */
function readCriteria(doc: Document): { byLabel: Map<string, string>; equipments: string[] } {
  const byLabel = new Map<string, string>();
  const equipments: string[] = [];
  for (const labelEl of doc.querySelectorAll("li > span.uppercase")) {
    const values = [...(labelEl.parentElement?.querySelectorAll(":scope > span") ?? [])]
      .filter((s) => s !== labelEl)
      .map(text)
      .filter((v): v is string => v !== undefined);
    const label = text(labelEl);
    // Le libellé vide (&nbsp;) regroupe les équipements, un par span.
    if (!label) equipments.push(...values);
    else if (values[0] && !byLabel.has(label)) byLabel.set(label, values[0]);
  }
  return { byLabel, equipments };
}

/** « 93m2 environ » → 93 ; toNumber garderait le « 2 » de m2. */
function readSurface(value: string | undefined): number | undefined {
  const m = value?.match(/(\d+(?:[.,]\d+)?)\s*m/);
  return m?.[1] ? toNumber(m[1]) : undefined;
}

function readDescription(doc: Document): string {
  const node = doc.getElementById("txtAnnonceTrunc")?.cloneNode(true) as HTMLElement | undefined;
  if (!node) return "";
  node.querySelector("#localisation_bar_header")?.remove();
  for (const br of node.querySelectorAll("br")) br.replaceWith("\n");
  return (node.textContent ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ville et code postal depuis le fil d'Ariane JSON-LD (« Drancy (93700) »), sinon le <title>. */
function readCity(doc: Document): { city?: string; postalCode?: string } {
  const CITY_RE = /^(.+?) \((\d{5})\)$/;
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const items = (data as { itemListElement?: unknown }).itemListElement;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const m = toStr((item as { name?: unknown }).name)?.match(CITY_RE);
      if (m) return { city: m[1], postalCode: m[2] };
    }
  }
  const m = doc.title.match(/ à (.+?) \((\d{5})\)/);
  return m ? { city: m[1], postalCode: m[2] } : {};
}

/** Photos de la galerie principale seulement : d'autres carrousels montrent des annonces similaires. */
function readPhotos(doc: Document): string[] {
  const gallery = doc.querySelector(".conteneur_photo_principal_image")?.closest(".swiper-wrapper");
  if (!gallery) return [];
  const urls = [...gallery.querySelectorAll("img")]
    .map((img) => img.getAttribute("data-src") ?? img.getAttribute("src") ?? "")
    .filter((src) => src.startsWith("https://"));
  return [...new Set(urls)];
}

export function parseParuvendu(doc: Document, url: string): Listing {
  const price = toNumber(text(doc.getElementById("autoprix")));
  if (!price || price <= 0) throw new Error(UNKNOWN);

  const { byLabel, equipments } = readCriteria(doc);
  const { city, postalCode } = readCity(doc);
  const title =
    text(doc.getElementById("detail_h1")) ??
    toStr(doc.querySelector('meta[property="og:title"]')?.getAttribute("content")) ??
    "";

  return {
    url,
    site: "paruvendu",
    extractedAt: new Date().toISOString(),
    title,
    price,
    surface: readSurface(byLabel.get("Surface")),
    rooms: toNumber(byLabel.get("Nombre de pièces")),
    bedrooms: toNumber(byLabel.get("Nombre de chambres")),
    propertyType: toPropertyType(url.match(/\/immobilier\/vente\/([a-z-]+)\//)?.[1]),
    location: { rawAddress: buildRawAddress(city, postalCode, undefined), city, postalCode },
    dpe: toLetter(text(doc.querySelector(".DPE_consEnerNote"))),
    ges: toLetter(text(doc.querySelector(".DPE_effSerreNote"))),
    description: readDescription(doc),
    photos: readPhotos(doc),
    attributes:
      equipments.length > 0 ? equipments.map((value) => ({ label: "Équipement", value })) : undefined,
  };
}
