import type { Listing, PropertyType } from "../types";

export function isLeboncoinListingPage(url: string): boolean {
  return /leboncoin\.fr\/ad\/(ventes_immobilieres|immobilier)\/\d+/.test(url);
}

interface LbcAttribute {
  key: string;
  value: string;
}

function attr(attributes: LbcAttribute[], key: string): string | undefined {
  return attributes.find((a) => a.key === key)?.value;
}

function readNextData(doc: Document): Record<string, unknown> | null {
  const script = doc.querySelector("script#__NEXT_DATA__");
  if (!script?.textContent) return null;
  try {
    return JSON.parse(script.textContent) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseLeboncoin(doc: Document, url: string): Listing {
  const data = readNextData(doc) as {
    props?: { pageProps?: { ad?: Record<string, unknown> } };
  } | null;
  const ad = data?.props?.pageProps?.ad;
  if (!ad) throw new Error("leboncoin: __NEXT_DATA__.props.pageProps.ad introuvable");

  const attributes = (ad.attributes ?? []) as LbcAttribute[];
  const location = (ad.location ?? {}) as Record<string, unknown>;
  const images = (ad.images ?? {}) as { urls?: string[] };

  const priceRaw = ad.price;
  const price = Array.isArray(priceRaw) ? Number(priceRaw[0]) : Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) throw new Error("leboncoin: prix illisible");

  const surfaceRaw = attr(attributes, "square");
  const roomsRaw = attr(attributes, "rooms");
  const estateType = attr(attributes, "real_estate_type")?.toLowerCase();
  const propertyType: PropertyType | undefined =
    estateType === "1" || estateType === "maison"
      ? "Maison"
      : estateType === "2" || estateType === "appartement"
        ? "Appartement"
        : undefined;

  const dpe = attr(attributes, "energy_rate")?.toUpperCase();
  const ges = attr(attributes, "ges")?.toUpperCase();

  return {
    url,
    site: "leboncoin",
    title: String(ad.subject ?? ""),
    price,
    surface: surfaceRaw ? Number(surfaceRaw) : undefined,
    rooms: roomsRaw ? Number(roomsRaw) : undefined,
    propertyType,
    location: {
      rawAddress: [location.city, location.zipcode].filter(Boolean).join(" "),
      postalCode: location.zipcode ? String(location.zipcode) : undefined,
      city: location.city ? String(location.city) : undefined,
      lat: typeof location.lat === "number" ? location.lat : undefined,
      lon: typeof location.lng === "number" ? location.lng : undefined,
    },
    dpe: dpe && /^[A-G]$/.test(dpe) ? dpe : undefined,
    ges: ges && /^[A-G]$/.test(ges) ? ges : undefined,
    description: String(ad.body ?? ""),
    photos: images.urls ?? [],
    publishedAt: ad.first_publication_date ? String(ad.first_publication_date) : undefined,
    extractedAt: new Date().toISOString(),
  };
}
