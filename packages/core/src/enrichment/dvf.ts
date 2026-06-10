import type { DvfSale, PropertyType, Comparable, MarketStats } from "../types";

const PRICE_PER_M2_MIN = 500;
const PRICE_PER_M2_MAX = 20_000;
const SURFACE_MIN = 9;
const SURFACE_MAX = 400;

export function parseDvfCsv(csv: string): DvfSale[] {
  const input = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const lines = input.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0]!.split(",");
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`dvf: colonne manquante ${name}`);
    return i;
  };
  const idx = {
    id: col("id_mutation"),
    date: col("date_mutation"),
    nature: col("nature_mutation"),
    valeur: col("valeur_fonciere"),
    numero: col("adresse_numero"),
    voie: col("adresse_nom_voie"),
    typeLocal: col("type_local"),
    surface: col("surface_reelle_bati"),
    pieces: col("nombre_pieces_principales"),
    lon: col("longitude"),
    lat: col("latitude"),
  };

  const byMutation = new Map<string, string[][]>();
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const id = cells[idx.id];
    if (!id) continue;
    const group = byMutation.get(id) ?? [];
    group.push(cells);
    byMutation.set(id, group);
  }

  const sales: DvfSale[] = [];
  for (const [id, rows] of byMutation) {
    const housing = rows.filter((cells) => {
      const t = cells[idx.typeLocal];
      return t === "Appartement" || t === "Maison";
    });
    // exactement 1 local d'habitation, sinon prix non ventilable (vente en bloc)
    if (housing.length !== 1) continue;
    const cells = housing[0]!;
    // allowlist volontaire : seul "Vente" passe (exclut Adjudication, Échange, VEFA…)
    if (cells[idx.nature] !== "Vente") continue;

    const price = Number(cells[idx.valeur]);
    const surface = Number(cells[idx.surface]);
    const lat = Number(cells[idx.lat]);
    const lon = Number(cells[idx.lon]);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!Number.isFinite(surface) || surface < SURFACE_MIN || surface > SURFACE_MAX) continue;
    if (!cells[idx.lat] || !cells[idx.lon] || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const pricePerM2 = price / surface;
    if (pricePerM2 < PRICE_PER_M2_MIN || pricePerM2 > PRICE_PER_M2_MAX) continue;

    sales.push({
      idMutation: id,
      date: cells[idx.date] ?? "",
      price,
      surface,
      rooms: Number(cells[idx.pieces]) || 0,
      pricePerM2,
      type: cells[idx.typeLocal] as PropertyType,
      lat,
      lon,
      address: [cells[idx.numero], cells[idx.voie]].filter(Boolean).join(" "),
    });
  }
  return sales;
}

const RADII_M = [500, 1000, 2000];
const MIN_SAMPLE = 10;
export const DVF_YEARS = [2023, 2024, 2025]; // fenêtre geo-dvf : 2021-2025 vérifiée 2026-06-10

export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const RECENT_MONTHS = 18;

function isRecent(date: string, now: Date): boolean {
  // date is "YYYY-MM-DD"
  const saleDate = new Date(date);
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RECENT_MONTHS);
  return saleDate >= cutoff;
}

export interface ComputeMarketStatsOpts {
  surface?: number;
  now?: Date;
}

export function computeMarketStats(
  sales: DvfSale[],
  center: { lat: number; lon: number },
  type: PropertyType,
  opts: ComputeMarketStatsOpts = {},
): MarketStats | null {
  const { surface, now = new Date() } = opts;
  const typed = sales.filter((s) => s.type === type);
  for (const radiusM of RADII_M) {
    const inRadius: Comparable[] = typed
      .map((s) => ({ ...s, distanceM: Math.round(haversineM(center.lat, center.lon, s.lat, s.lon)) }))
      .filter((s) => s.distanceM <= radiusM);
    const isLastRadius = radiusM === RADII_M[RADII_M.length - 1];
    if (inRadius.length < MIN_SAMPLE && !isLastRadius) continue;
    if (inRadius.length === 0) return null;

    // filtre aberrants : médiane ± 3×MAD
    const prices = inRadius.map((s) => s.pricePerM2);
    const med = median(prices);
    const mad = median(prices.map((p) => Math.abs(p - med))) || med * 0.15;
    const kept = inRadius.filter((s) => Math.abs(s.pricePerM2 - med) <= 3 * mad);
    if (kept.length === 0) return null;

    // Partition par surface similaire (±30 %) si surface fournie
    let similar: Comparable[];
    let others: Comparable[];

    if (surface !== undefined) {
      const threshold = 0.3 * surface;
      similar = kept
        .filter((s) => Math.abs(s.surface - surface) <= threshold)
        .map((s) => ({ ...s, similar: true }));
      others = kept
        .filter((s) => Math.abs(s.surface - surface) > threshold)
        .map((s) => ({ ...s, similar: false }));
    } else {
      similar = kept.map((s) => ({ ...s, similar: true }));
      others = [];
    }

    // Hiérarchie de recency (premier niveau avec ≥ MIN_SAMPLE l'emporte)
    // Niveau 1 : similaires récents
    // Niveau 2 : similaires (toutes dates)
    // Niveau 3 : récents toutes surfaces
    // Niveau 4 : tout kept
    let medianSource: Comparable[];
    let medianOnSimilar: boolean;
    let windowMonths: number;

    const similarRecent = similar.filter((s) => isRecent(s.date, now));
    const allRecent = kept.filter((s) => isRecent(s.date, now));

    if (surface !== undefined && similarRecent.length >= MIN_SAMPLE) {
      // Niveau 1
      medianSource = similarRecent;
      medianOnSimilar = true;
      windowMonths = 18;
    } else if (surface !== undefined && similar.length >= MIN_SAMPLE) {
      // Niveau 2
      medianSource = similar;
      medianOnSimilar = true;
      windowMonths = 36;
    } else if (allRecent.length >= MIN_SAMPLE) {
      // Niveau 3
      medianSource = allRecent;
      medianOnSimilar = false;
      windowMonths = 18;
    } else {
      // Niveau 4
      medianSource = kept;
      medianOnSimilar = false;
      windowMonths = 36;
    }

    const finalMedian = median(medianSource.map((s) => s.pricePerM2));
    const sampleSize = medianSource.length;

    // Comparables : jusqu'à 10 similaires + 6 autres (triés par distance dans chaque groupe)
    const topSimilar = similar.sort((a, b) => a.distanceM - b.distanceM).slice(0, 10);
    const topOthers = others.sort((a, b) => a.distanceM - b.distanceM).slice(0, 6);
    const comparables = [...topSimilar, ...topOthers];

    return {
      medianPricePerM2: Math.round(finalMedian),
      sampleSize,
      radiusM,
      confidence: sampleSize >= 30 ? "high" : sampleSize >= MIN_SAMPLE ? "medium" : "low",
      comparables,
      medianOnSimilar,
      windowMonths,
    };
  }
  return null;
}

export interface FetchSalesOptions {
  years?: number[];
  fetchFn?: typeof fetch;
}

export async function fetchCommuneSales(
  citycode: string,
  opts: FetchSalesOptions = {},
): Promise<DvfSale[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const years = opts.years ?? DVF_YEARS;
  // DOM/COM : répertoire département à 3 chiffres sur geo-dvf (971-976, 98x)
  const dept = citycode.startsWith("97") || citycode.startsWith("98") ? citycode.slice(0, 3) : citycode.slice(0, 2);
  const all: DvfSale[] = [];
  for (const year of years) {
    const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${dept}/${citycode}.csv`;
    const res = await fetchFn(url);
    if (!res.ok) continue; // année absente → on continue
    all.push(...parseDvfCsv(await res.text()));
  }
  return all;
}
