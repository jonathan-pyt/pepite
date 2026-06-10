import type { Enrichments, Listing, QuickAnalysis } from "../types";

export interface GlobalScoreCritere {
  id: string;
  label: string;
  score: number;
  /** Poids renormalisé arrondi (les poids somment à 100). */
  poids: number;
}

export interface GlobalScore {
  score: number;
  criteres: GlobalScoreCritere[];
}

// ---------------------------------------------------------------------------
// Barèmes individuels
// ---------------------------------------------------------------------------

const DPE_SCORES: Record<string, number> = {
  A: 95,
  B: 85,
  C: 70,
  D: 55,
  E: 40,
  F: 25,
  G: 10,
};

function scoreDpe(dpe: string | undefined): number | null {
  if (!dpe) return null;
  return DPE_SCORES[dpe.toUpperCase()] ?? null;
}

function scoreRisques(risks: Enrichments["risks"]): number | null {
  if (!risks) return null;
  const raw = 90 - 12 * risks.naturels.length - 8 * risks.technologiques.length;
  return Math.min(95, Math.max(10, raw));
}

function scoreByCount(
  count: number,
  bands: [number, number][],
): number {
  // bands: sorted ascending by threshold, value returned when count >= threshold
  // Falls through to last band
  let result: number = bands[0]?.[1] ?? 0;
  for (const [threshold, val] of bands) {
    if (count >= threshold) result = val;
  }
  return result;
}

const TRANSPORT_BANDS: [number, number][] = [
  [0, 15],
  [1, 40],
  [3, 60],
  [6, 75],
  [11, 85],
  [21, 95],
];

const COMMERCES_BANDS: [number, number][] = TRANSPORT_BANDS;

const ECOLES_BANDS: [number, number][] = [
  [0, 30],
  [1, 60],
  [3, 85],
];

const ESPACES_VERTS_BANDS: [number, number][] = [
  [0, 30],
  [1, 65],
  [3, 85],
];

function scoreTransports(nb: Enrichments["neighborhood"]): number | null {
  if (!nb) return null;
  return scoreByCount(nb.transports.count, TRANSPORT_BANDS);
}

function scoreCommerces(nb: Enrichments["neighborhood"]): number | null {
  if (!nb) return null;
  return scoreByCount(nb.commerces.count + nb.sante.count, COMMERCES_BANDS);
}

function scoreEcoles(nb: Enrichments["neighborhood"]): number | null {
  if (!nb) return null;
  return scoreByCount(nb.ecoles.count, ECOLES_BANDS);
}

function scoreEspacesVerts(nb: Enrichments["neighborhood"]): number | null {
  if (!nb) return null;
  return scoreByCount(nb.espacesVerts.count, ESPACES_VERTS_BANDS);
}

function scoreTensionLocative(rent: Enrichments["rent"]): number | null {
  if (!rent?.zoneAbc) return null;
  const zone = rent.zoneAbc.trim();
  if (zone === "A bis" || zone === "A") return 90;
  if (zone === "B1") return 75;
  if (zone === "B2") return 55;
  if (zone === "C") return 40;
  return null;
}

// ---------------------------------------------------------------------------
// Pondérations nominales
// ---------------------------------------------------------------------------

interface CritereSpec {
  id: string;
  label: string;
  poidsNominal: number;
  computeScore: (
    quick: QuickAnalysis,
    listing: Listing,
    enrichments: Enrichments | undefined,
  ) => number | null;
}

const CRITERES_SPECS: CritereSpec[] = [
  {
    id: "prix",
    label: "Prix vs marché",
    poidsNominal: 35,
    computeScore: (quick) => quick.score,
  },
  {
    id: "dpe",
    label: "DPE",
    poidsNominal: 15,
    computeScore: (_quick, listing) => scoreDpe(listing.dpe),
  },
  {
    id: "risques",
    label: "Risques",
    poidsNominal: 15,
    computeScore: (_quick, _listing, enrichments) => scoreRisques(enrichments?.risks),
  },
  {
    id: "transports",
    label: "Transports",
    poidsNominal: 10,
    computeScore: (_quick, _listing, enrichments) => scoreTransports(enrichments?.neighborhood),
  },
  {
    id: "commerces",
    label: "Commerces & services",
    poidsNominal: 10,
    computeScore: (_quick, _listing, enrichments) => scoreCommerces(enrichments?.neighborhood),
  },
  {
    id: "ecoles",
    label: "Écoles",
    poidsNominal: 5,
    computeScore: (_quick, _listing, enrichments) => scoreEcoles(enrichments?.neighborhood),
  },
  {
    id: "espacesVerts",
    label: "Espaces verts",
    poidsNominal: 5,
    computeScore: (_quick, _listing, enrichments) => scoreEspacesVerts(enrichments?.neighborhood),
  },
  {
    id: "tensionLocative",
    label: "Tension locative",
    poidsNominal: 5,
    computeScore: (_quick, _listing, enrichments) => scoreTensionLocative(enrichments?.rent),
  },
];

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Calcule un score global /100 à partir de tous les critères disponibles.
 * Les poids des critères manquants sont redistribués proportionnellement.
 * Retourne null si aucun critère n'est calculable.
 */
export function computeGlobalScore(
  quick: QuickAnalysis,
  listing: Listing,
  enrichments: Enrichments | undefined,
): GlobalScore | null {
  // 1. Calculer tous les scores disponibles
  const available: { id: string; label: string; poidsNominal: number; score: number }[] = [];
  for (const spec of CRITERES_SPECS) {
    const s = spec.computeScore(quick, listing, enrichments);
    if (s !== null) {
      available.push({ id: spec.id, label: spec.label, poidsNominal: spec.poidsNominal, score: s });
    }
  }

  if (available.length === 0) return null;

  // 2. Renormaliser les poids (arrondi entier, somme forcée à 100)
  const totalNominal = available.reduce((s, c) => s + c.poidsNominal, 0);

  // Calcul des poids bruts (non arrondis)
  const rawPoids = available.map((c) => (c.poidsNominal / totalNominal) * 100);

  // Arrondi de Bresenham / largest-remainder pour somme exacte = 100
  const floored: number[] = rawPoids.map(Math.floor);
  const remainders: number[] = rawPoids.map((v, i) => v - (floored[i] ?? 0));
  const shortfall = 100 - floored.reduce((s, v) => s + v, 0);
  // Distribuer le reste aux critères ayant la plus grande partie décimale
  const order: number[] = remainders
    .map((r, i) => ({ i, r }))
    .sort((a, b) => b.r - a.r)
    .map((x) => x.i);
  const finalPoids: number[] = [...floored];
  for (let k = 0; k < shortfall; k++) {
    const idx = order[k];
    if (idx !== undefined) finalPoids[idx] = (finalPoids[idx] ?? 0) + 1;
  }

  // 3. Score global pondéré
  const rawGlobal = available.reduce((s, c, i) => s + c.score * ((finalPoids[i] ?? 0) / 100), 0);
  const globalScore = Math.round(rawGlobal);

  const criteres: GlobalScoreCritere[] = available.map((c, i) => ({
    id: c.id,
    label: c.label,
    score: c.score,
    poids: finalPoids[i] ?? 0,
  }));

  return { score: globalScore, criteres };
}
