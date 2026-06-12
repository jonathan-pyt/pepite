import type { GeoPoint, ListingLocation } from "../types";

export interface GeocodeOptions {
  fetchFn?: typeof fetch;
}

interface BanFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    label: string;
    score: number;
    citycode: string;
    type: GeoPoint["precision"];
  };
}

export async function geocode(query: string, opts: GeocodeOptions = {}): Promise<GeoPoint | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`geocodage BAN: HTTP ${res.status}`);
  const json = (await res.json()) as { features: BanFeature[] };
  if (!Array.isArray(json.features)) throw new Error("geocodage BAN: réponse inattendue");
  const feature = json.features[0];
  if (!feature) return null;
  const [lon, lat] = feature.geometry.coordinates;
  return {
    lat,
    lon,
    citycode: feature.properties.citycode,
    label: feature.properties.label,
    score: feature.properties.score,
    precision: feature.properties.type,
  };
}

/**
 * Reconstruit la localisation d'une annonce depuis une adresse saisie par
 * l'utilisateur et son géocodage. Contrairement au flux d'analyse (qui préserve
 * les coordonnées de l'annonce), on ÉCRASE tout : l'utilisateur corrige une
 * localisation volontairement fausse. Le district d'origine est abandonné.
 * city/postalCode sont extraits du label BAN (« 12 Rue X 97400 Saint-Denis »).
 */
export function correctedLocation(userInput: string, point: GeoPoint): ListingLocation {
  const location: ListingLocation = {
    rawAddress: userInput,
    lat: point.lat,
    lon: point.lon,
    precision: point.precision,
    locationCorrected: true,
  };
  const match = /\b(\d{5})\s+(.+)$/.exec(point.label);
  if (match) {
    location.postalCode = match[1];
    location.city = match[2];
  } else if (point.precision === "municipality") {
    // Label d'une municipalité : juste le nom de la commune, sans code postal.
    location.city = point.label;
  }
  return location;
}
