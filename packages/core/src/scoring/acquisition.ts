import type { Listing } from "../types";

export interface AcquisitionCost {
  /** Prix affiché (FAI, agence incluse pour LBC) */
  prix: number;
  /** Frais de notaire : 7,8 % pour un bien ancien (taux constant, actes + droits de mutation) */
  fraisNotairePct: number;
  /** Frais de notaire arrondis à l'euro */
  fraisNotaire: number;
  /** Total estimé = prix + fraisNotaire */
  total: number;
  /** Taxe foncière annuelle si renseignée dans l'annonce, undefined sinon */
  taxeFonciereAnnuelle?: number;
}

/** Frais de notaire pour bien ancien : estimation usuelle en France (hors départements
 *  à droits de mutation réduits — 36, 38, 56 — et hors évolutions DMTO locales). */
const FRAIS_NOTAIRE_PCT = 7.8;

/**
 * Parse la valeur de taxe foncière depuis une chaîne brute.
 * Accepte "1 200 €", "1 180 €", "1180", "950 €".
 * Retourne undefined si le parsing échoue.
 */
function parseTaxeFonciere(raw: string): number | undefined {
  // Strip currency symbol, whitespace (including narrow no-break space U+202F), thin space
  const cleaned = raw.replace(/[€\s  ]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Estime le coût total d'acquisition d'un bien (notaire, taxe foncière si connue).
 * Les annonces LBC sont FAI (frais d'agence inclus dans le prix affiché).
 * Aucune ligne frais d'agence — voir caveat UI.
 */
export function estimateAcquisitionCost(listing: Listing): AcquisitionCost {
  const prix = listing.price;
  const fraisNotairePct = FRAIS_NOTAIRE_PCT;
  const fraisNotaire = Math.round(prix * (fraisNotairePct / 100));
  const total = prix + fraisNotaire;

  let taxeFonciereAnnuelle: number | undefined;
  if (listing.attributes) {
    const attr = listing.attributes.find((a) => /taxe fonci/i.test(a.label));
    if (attr) {
      taxeFonciereAnnuelle = parseTaxeFonciere(attr.value);
    }
  }

  return { prix, fraisNotairePct, fraisNotaire, total, taxeFonciereAnnuelle };
}
