import type { NeighborhoodStats, PoiCategory } from "../types";
import { haversineM } from "./dvf";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const USER_AGENT = "Pepite-extension/0.2 (analyse immobiliere perso)";
const DEFAULT_RADIUS_M = 800;
const DEFAULT_TIMEOUT = 15;
// Timeout client (légèrement > timeout serveur Overpass de 15 s) : sans lui,
// un endpoint qui ne répond pas bloque indéfiniment la requête.
const CLIENT_TIMEOUT_MS = 20_000;

function buildQuery(lat: number, lon: number, radiusM: number): string {
  const r = radiusM;
  return `[out:json][timeout:${DEFAULT_TIMEOUT}];
(
  node(around:${r},${lat},${lon})[amenity~"^(school|kindergarten|college|university)$"];
  node(around:${r},${lat},${lon})[amenity~"^(pharmacy|doctors|hospital|clinic|dentist)$"];
  node(around:${r},${lat},${lon})[shop~"^(supermarket|bakery|butcher|convenience|greengrocer)$"];
  node(around:${r},${lat},${lon})[highway=bus_stop];
  node(around:${r},${lat},${lon})[railway~"^(station|tram_stop|subway_entrance)$"];
  way(around:${r},${lat},${lon})[amenity~"^(school|kindergarten|college|university)$"];
  way(around:${r},${lat},${lon})[amenity~"^(pharmacy|doctors|hospital|clinic|dentist)$"];
  way(around:${r},${lat},${lon})[shop~"^(supermarket|bakery|butcher|convenience|greengrocer)$"];
  way(around:${r},${lat},${lon})[leisure~"^(park|garden|playground)$"];
  node(around:${r},${lat},${lon})[leisure~"^(park|garden|playground)$"];
);
out center tags 300;`;
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements: OverpassElement[];
};

const CATEGORY_MATCHERS: Record<
  keyof Omit<NeighborhoodStats, "radiusM">,
  (tags: Record<string, string>) => boolean
> = {
  ecoles: (tags) => /^(school|kindergarten|college|university)$/.test(tags.amenity ?? ""),
  commerces: (tags) => /^(supermarket|bakery|butcher|convenience|greengrocer)$/.test(tags.shop ?? ""),
  sante: (tags) => /^(pharmacy|doctors|hospital|clinic|dentist)$/.test(tags.amenity ?? ""),
  transports: (tags) =>
    tags.highway === "bus_stop" ||
    /^(station|tram_stop|subway_entrance)$/.test(tags.railway ?? ""),
  espacesVerts: (tags) => /^(park|garden|playground)$/.test(tags.leisure ?? ""),
};

type CategoryKey = keyof typeof CATEGORY_MATCHERS;

export function parseOverpass(
  json: unknown,
  lat: number,
  lon: number,
  radiusM: number,
): NeighborhoodStats {
  const data = json as OverpassResponse;
  const elements = data?.elements ?? [];

  const seenIds = new Set<number>();

  const buckets: Record<CategoryKey, { name?: string; distanceM: number }[]> = {
    ecoles: [],
    commerces: [],
    sante: [],
    transports: [],
    espacesVerts: [],
  };

  for (const el of elements) {
    const tags = el.tags ?? {};

    // Determine position
    let elLat: number | undefined;
    let elLon: number | undefined;
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      elLat = el.lat;
      elLon = el.lon;
    } else if (el.center) {
      elLat = el.center.lat;
      elLon = el.center.lon;
    }
    if (elLat === undefined || elLon === undefined) continue;

    // Determine category — an element matches at most one category (first match wins)
    let matched: CategoryKey | null = null;
    for (const [key, test] of Object.entries(CATEGORY_MATCHERS) as [CategoryKey, (t: Record<string, string>) => boolean][]) {
      if (test(tags)) {
        matched = key;
        break;
      }
    }
    if (matched === null) continue;

    // Dedup by id within transports (PTv2 duplicates)
    if (matched === "transports") {
      if (seenIds.has(el.id)) continue;
      seenIds.add(el.id);
    }

    const distanceM = Math.round(haversineM(lat, lon, elLat, elLon));
    const name = tags.name;
    buckets[matched].push({ name, distanceM });
  }

  function toCategory(items: { name?: string; distanceM: number }[]): PoiCategory {
    const sorted = [...items].sort((a, b) => a.distanceM - b.distanceM);
    const named = sorted.filter((item) => item.name !== undefined) as { name: string; distanceM: number }[];
    // Dédoublonnage par nom (ex. arrêts de bus jumeaux, un par sens) — on garde le plus proche
    const seenNames = new Set<string>();
    const unique = named.filter((item) => {
      if (seenNames.has(item.name)) return false;
      seenNames.add(item.name);
      return true;
    });
    return {
      count: items.length,
      nearest: unique.slice(0, 3).map(({ name, distanceM }) => ({ name, distanceM })),
    };
  }

  return {
    radiusM,
    ecoles: toCategory(buckets.ecoles),
    commerces: toCategory(buckets.commerces),
    sante: toCategory(buckets.sante),
    transports: toCategory(buckets.transports),
    espacesVerts: toCategory(buckets.espacesVerts),
  };
}

export interface FetchNeighborhoodOptions {
  radiusM?: number;
  fetchFn?: typeof fetch;
}

export async function fetchNeighborhood(
  lat: number,
  lon: number,
  opts: FetchNeighborhoodOptions = {},
): Promise<NeighborhoodStats> {
  const radiusM = opts.radiusM ?? DEFAULT_RADIUS_M;
  const fetchFn = opts.fetchFn ?? fetch;
  const query = buildQuery(lat, lon, radiusM);
  const body = `data=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": USER_AGENT,
  };

  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchFn(endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      if (!res.ok) {
        lastError = new Error(`Overpass ${endpoint} responded ${res.status}`);
        continue;
      }
      const json: unknown = await res.json();
      return parseOverpass(json, lat, lon, radiusM);
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `fetchNeighborhood: tous les endpoints Overpass ont échoué. Dernière erreur : ${String(lastError)}`,
  );
}
