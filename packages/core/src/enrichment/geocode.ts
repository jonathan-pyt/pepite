import type { GeoPoint } from "../types";

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
