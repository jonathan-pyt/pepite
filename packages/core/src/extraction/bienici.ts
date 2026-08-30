import type { Listing } from "../types";
import { buildRawAddress, toLetter, toNumber, toPropertyType, toStr } from "./mapping";

/**
 * Bien'ici parser — lit l'API JSON du site plutôt que le DOM.
 *
 * Bien'ici est une SPA dont la page peut rester vide plus de 20 s : aucun
 * parseur DOM n'est fiable. L'application elle-même s'alimente auprès de
 * `realEstateAd.json`, même origine, sans authentification — on interroge la
 * même route (payload réel capturé dans fixtures/bienici-realEstateAd.json).
 */
const AD_ENDPOINT = "https://www.bienici.com/realEstateAd.json";

/** Une publicationDate à l'époque Unix signale un import automatique sans date. */
const MIN_PLAUSIBLE_YEAR = 1990;

interface BlurPosition {
  lat?: unknown;
  lon?: unknown;
}

interface BieniciAd {
  reference?: unknown;
  title?: unknown;
  propertyType?: unknown;
  price?: unknown;
  surfaceArea?: unknown;
  landSurfaceArea?: unknown;
  roomsQuantity?: unknown;
  bedroomsQuantity?: unknown;
  city?: unknown;
  postalCode?: unknown;
  district?: unknown;
  blurInfo?: { position?: BlurPosition; centroid?: BlurPosition };
  energyClassification?: unknown;
  greenhouseGazClassification?: unknown;
  description?: unknown;
  publicationDate?: unknown;
  modificationDate?: unknown;
  photos?: unknown;
  floor?: unknown;
  floorQuantity?: unknown;
  yearOfConstruction?: unknown;
  hasElevator?: unknown;
  enclosedParkingQuantity?: unknown;
  showerRoomsQuantity?: unknown;
  toiletQuantity?: unknown;
  annualCondominiumFees?: unknown;
  condominiumPartsQuantity?: unknown;
  isCondominiumInProcedure?: unknown;
  condominiumDetailedProcedure?: unknown;
  feesChargedTo?: unknown;
}

/**
 * Identifiant d'annonce porté par l'URL — dernier segment du chemin
 * (« …/3pieces/immo-facile-57156771 »). null hors page d'annonce.
 */
export function bieniciAdId(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!/^\/annonce\/(vente|location)\//.test(pathname)) return null;
  const segments = pathname.split("/").filter(Boolean);
  return segments.length > 3 ? (segments.at(-1) ?? null) : null;
}

function readDistrict(value: unknown): string | undefined {
  if (typeof value === "string") return toStr(value);
  if (value && typeof value === "object") {
    const d = value as { libelle?: unknown; name?: unknown };
    return toStr(d.libelle) ?? toStr(d.name);
  }
  return undefined;
}

function readPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((p) => (typeof p === "string" ? p : toStr((p as { url?: unknown })?.url)))
    .filter((p): p is string => typeof p === "string");
}

function readCoords(blur: BieniciAd["blurInfo"]): { lat?: number; lon?: number } {
  const pos = blur?.position ?? blur?.centroid;
  const lat = toNumber(pos?.lat);
  const lon = toNumber(pos?.lon);
  // toNumber refuse déjà NaN ; l'hémisphère sud (lat négative) doit passer.
  return typeof pos?.lat === "number" && typeof pos?.lon === "number"
    ? { lat: pos.lat, lon: pos.lon }
    : { lat, lon };
}

/** Date ISO exploitable, ou undefined si absente/à l'époque Unix (import auto). */
function readDate(value: unknown): string | undefined {
  const s = toStr(value);
  if (!s) return undefined;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.getUTCFullYear() >= MIN_PLAUSIBLE_YEAR ? s : undefined;
}

/** « 1158.96 » → « 1 159 € » (séparateur d'espace simple, sortie déterministe). */
function euros(value: number): string {
  return `${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;
}

const FEES_CHARGED_TO: Record<string, string> = {
  seller: "à la charge du vendeur",
  buyer: "à la charge de l'acquéreur",
};

function buildAttributes(ad: BieniciAd): { label: string; value: string }[] {
  const attrs: { label: string; value: string }[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value) attrs.push({ label, value });
  };

  const floor = toNumber(ad.floor);
  const floorQuantity = toNumber(ad.floorQuantity);
  if (floor !== undefined) {
    push("Étage", floorQuantity !== undefined ? `${floor} sur ${floorQuantity}` : String(floor));
  }
  if (typeof ad.hasElevator === "boolean") push("Ascenseur", ad.hasElevator ? "oui" : "non");

  const year = toNumber(ad.yearOfConstruction);
  if (year !== undefined) push("Année de construction", String(year));

  const parking = toNumber(ad.enclosedParkingQuantity);
  if (parking !== undefined && parking > 0) push("Parking fermé", String(parking));

  const showers = toNumber(ad.showerRoomsQuantity);
  if (showers !== undefined && showers > 0) push("Salles d'eau", String(showers));

  const toilets = toNumber(ad.toiletQuantity);
  if (toilets !== undefined && toilets > 0) push("WC", String(toilets));

  const fees = toNumber(ad.annualCondominiumFees);
  if (fees !== undefined && fees > 0) push("Charges de copropriété", `${euros(fees)}/an`);

  const lots = toNumber(ad.condominiumPartsQuantity);
  if (lots !== undefined && lots > 0) push("Lots de copropriété", String(lots));

  // Uniquement quand une procédure est en cours : « pas de procédure » est le
  // cas normal et n'a rien à faire dans les points de vigilance.
  if (ad.isCondominiumInProcedure === true) {
    push("Procédure copropriété", toStr(ad.condominiumDetailedProcedure) ?? "en cours");
  }

  push("Honoraires", FEES_CHARGED_TO[toStr(ad.feesChargedTo) ?? ""]);
  push("Référence", toStr(ad.reference));

  return attrs;
}

/** Convertit un payload `realEstateAd.json` en Listing normalisé. */
export function parseBieniciAd(payload: unknown, url: string): Listing {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("bienici: payload inattendu (objet JSON attendu)");
  }
  const ad = payload as BieniciAd;

  const price = toNumber(ad.price);
  if (price === undefined || price <= 0) {
    throw new Error("bienici: prix absent du payload de l'annonce");
  }

  const city = toStr(ad.city);
  const postalCode = toStr(ad.postalCode);
  const district = readDistrict(ad.district);
  const { lat, lon } = readCoords(ad.blurInfo);
  const attributes = buildAttributes(ad);

  return {
    url,
    site: "bienici",
    title: toStr(ad.title) ?? "",
    price,
    surface: toNumber(ad.surfaceArea),
    rooms: toNumber(ad.roomsQuantity),
    bedrooms: toNumber(ad.bedroomsQuantity),
    landSurface: toNumber(ad.landSurfaceArea),
    propertyType: toPropertyType(ad.propertyType),
    location: {
      rawAddress: buildRawAddress(city, postalCode, district),
      city,
      postalCode,
      district,
      lat,
      lon,
      // blurInfo est un disque (50 m par défaut) : jamais une adresse exacte.
      ...(lat !== undefined && lon !== undefined ? { precision: "district" } : {}),
    },
    dpe: toLetter(ad.energyClassification),
    ges: toLetter(ad.greenhouseGazClassification),
    description: toStr(ad.description) ?? "",
    photos: readPhotos(ad.photos),
    publishedAt: readDate(ad.publicationDate) ?? readDate(ad.modificationDate),
    extractedAt: new Date().toISOString(),
    attributes: attributes.length > 0 ? attributes : undefined,
  };
}

export interface FetchBieniciOptions {
  fetchFn?: typeof fetch;
}

/**
 * Récupère et normalise une annonce Bien'ici depuis l'URL de la page.
 * À appeler depuis un contexte de même origine (content script) : la route
 * répond aussi sans cookie, mais on laisse le navigateur les joindre.
 */
export async function fetchBienici(
  url: string,
  opts: FetchBieniciOptions = {},
): Promise<Listing> {
  const id = bieniciAdId(url);
  if (!id) throw new Error("bienici: identifiant d'annonce absent de l'URL");

  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(`${AD_ENDPOINT}?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`bienici: realEstateAd.json HTTP ${res.status}`);

  return parseBieniciAd(await res.json(), url);
}
