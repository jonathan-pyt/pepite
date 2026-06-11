import type { PluZone } from "../types";

const API_BASE = "https://apicarto.ign.fr/api/gpu/zone-urba";

export interface FetchPluZoneOptions {
  fetchFn?: typeof fetch;
}

/**
 * Zonage PLU au point via le Géoportail de l'Urbanisme (apicarto, sans clé).
 *
 * ⚠️ GET obligatoire : le POST de cette API IGNORE le filtre `geom` et renvoie
 * des zones arbitraires (vérifié empiriquement le 2026-06-11).
 * ⚠️ GeoJSON : coordinates dans l'ordre [longitude, latitude].
 *
 * Retourne null quand aucune zone ne couvre le point (commune sans PLU
 * numérisé ou point hors zonage) — ce n'est pas une erreur.
 * On ne conserve que `properties` (les géométries des features sont lourdes).
 */
export async function fetchPluZone(
  lat: number,
  lon: number,
  opts: FetchPluZoneOptions = {},
): Promise<PluZone | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const geom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
  const url = `${API_BASE}?geom=${encodeURIComponent(geom)}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`zonage PLU apicarto: HTTP ${res.status}`);
  const json = (await res.json()) as {
    features?: { properties?: { libelle?: string; typezone?: string } }[];
  };
  const props = json.features?.[0]?.properties;
  if (!props?.libelle || !props.typezone) return null;
  return { libelle: props.libelle, typezone: props.typezone };
}
