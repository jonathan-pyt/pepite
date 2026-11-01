import type { Listing, PropertyType } from "../types";
import { buildRawAddress, readLdNodes, toLetter, toNumber, toPropertyType, toStr } from "./mapping";

const UNKNOWN = "iadfrance: structure inconnue";

// ex: /annonce/maison-vente-5-pieces-cauville-150m2/r1946966
//     /annonce/appartement-vente-4-pieces-paris-126m2/r2137679
// Location exclue (slug `-location-`) : le pipeline compare le prix aux ventes DVF, un loyer y serait absurde.
const LISTING_RE = /iadfrance\.fr\/annonce\/[a-z]+-vente-[a-z0-9-]+\/r\d+(?:[?#]|$)/;

export function isIadfranceListingPage(url: string): boolean {
  return LISTING_RE.test(url);
}

function text(el: Element | null | undefined): string | undefined {
  return toStr(el?.textContent?.replace(/\s+/g, " "));
}

interface SchemaProperty {
  "@type"?: unknown;
  numberOfBedrooms?: unknown;
  numberOfRooms?: unknown;
  address?: { addressLocality?: unknown; postalCode?: unknown };
  floorSize?: { value?: unknown };
}

interface SchemaOffer {
  "@type"?: unknown;
  price?: unknown;
}

/** Nœud du bien : identifié par sa forme (address + floorSize), pas par un @type figé
 * (observé : SingleFamilyResidence, Apartment — d'autres types de biens sont possibles). */
function readProperty(nodes: unknown[]): SchemaProperty | undefined {
  return nodes.find(
    (n): n is SchemaProperty => typeof n === "object" && n !== null && "floorSize" in n && "address" in n,
  );
}

function readOffer(nodes: unknown[]): SchemaOffer | undefined {
  return nodes.find(
    (n): n is SchemaOffer => typeof n === "object" && n !== null && (n as SchemaOffer)["@type"] === "Offer",
  );
}

function propertyTypeFromSchema(type: unknown): PropertyType | undefined {
  if (type === "Apartment") return "Appartement";
  if (type === "SingleFamilyResidence" || type === "House") return "Maison";
  return undefined;
}

/**
 * Lettre active d'une échelle DPE/GES : les 7 barres (A à G) sont toujours
 * présentes dans le DOM, seule celle en cours affiche sa lettre dans un
 * <span> (les autres sont des commentaires Vue vides).
 */
function readScaleLetter(doc: Document, prefix: "epc" | "ges"): string | undefined {
  const active = doc.querySelector(`li[class*="bg-${prefix}-"] span`)?.closest("li");
  const m = active?.className.match(new RegExp(`bg-${prefix}-([A-G])\\b`));
  return m ? toLetter(m[1]) : undefined;
}

/** Bloc "Description" : le <h3> au texte exact précède le conteneur au texte intégral. */
function readDescription(doc: Document): string {
  const heading = [...doc.querySelectorAll("h3")].find((h) => text(h) === "Description");
  const container = heading?.nextElementSibling?.querySelector(".whitespace-pre-line");
  return toStr(container?.textContent)?.trim() ?? "";
}

/** Photos visibles dans le DOM hydraté (la galerie complète ne charge qu'à l'ouverture de la lightbox). */
function readPhotos(doc: Document): string[] {
  const urls = [...doc.querySelectorAll("img")]
    .map((img) => img.getAttribute("src") ?? "")
    .filter((src) => /\/property\/broadcast\//.test(src))
    .map((src) => src.split("?")[0] ?? src);
  return [...new Set(urls)];
}

export function parseIadfrance(doc: Document, url: string): Listing {
  const nodes = readLdNodes(doc);
  const property = readProperty(nodes);
  const offer = readOffer(nodes);
  if (!property || !offer) throw new Error(UNKNOWN);

  const price = toNumber(offer.price);
  if (!price || price <= 0) throw new Error(UNKNOWN);

  const city = toStr(property.address?.addressLocality);
  const postalCode = toStr(property.address?.postalCode);
  const title =
    toStr(doc.querySelector('meta[property="og:title"]')?.getAttribute("content")) ??
    text(doc.querySelector("h1")) ??
    "";

  return {
    url,
    site: "iadfrance",
    extractedAt: new Date().toISOString(),
    title,
    price,
    surface: toNumber(property.floorSize?.value),
    rooms: toNumber(property.numberOfRooms),
    bedrooms: toNumber(property.numberOfBedrooms),
    propertyType: propertyTypeFromSchema(property["@type"]) ?? toPropertyType(title),
    location: { rawAddress: buildRawAddress(city, postalCode, undefined), city, postalCode },
    dpe: readScaleLetter(doc, "epc"),
    ges: readScaleLetter(doc, "ges"),
    description: readDescription(doc),
    photos: readPhotos(doc),
  };
}
