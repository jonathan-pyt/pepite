import type { Listing, MarketStats, QuickAnalysis } from "../types";

export function scoreLabel(score: number): string {
  if (score >= 80) return "Très bon";
  if (score >= 65) return "Bon";
  if (score >= 45) return "Moyen";
  return "Faible";
}

// v0.1 : score = position prix vs marché uniquement.
// 0 % d'écart → 60 ; chaque % sous la médiane rapporte 2,2 pts. Borné [5, 98].
export function buildQuickAnalysis(listing: Listing, market: MarketStats | null): QuickAnalysis {
  const listingPricePerM2 =
    listing.surface && listing.surface > 0 ? Math.round(listing.price / listing.surface) : null;

  if (!market || listingPricePerM2 === null) {
    return { listingPricePerM2, marketGapPct: null, market, score: null, scoreLabel: "Inconnu" };
  }

  const marketGapPct = ((listingPricePerM2 - market.medianPricePerM2) / market.medianPricePerM2) * 100;
  const raw = 60 - marketGapPct * 2.2;
  const score = Math.round(Math.min(98, Math.max(5, raw)));
  return { listingPricePerM2, marketGapPct, market, score, scoreLabel: scoreLabel(score) };
}
