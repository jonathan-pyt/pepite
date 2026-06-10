import type { DvfSale, PropertyType } from "../types";

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
