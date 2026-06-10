import type { Listing, QuickAnalysis, UsageProfile } from "../types";

const PROFILE_LABEL: Record<UsageProfile, string> = {
  residence: "achat en résidence principale",
  "locatif-nu": "investissement en location nue",
  airbnb: "investissement en location courte durée (Airbnb)",
  coloc: "investissement en colocation",
};

export const SYSTEM_PROMPT = `Tu es un expert en immobilier résidentiel français qui conseille un acheteur particulier.
Tu raisonnes à partir des données fournies (annonce + transactions DVF réelles du secteur), sans rien inventer :
si une donnée manque, dis-le plutôt que de supposer. Ton ton est direct, factuel, sans jargon inutile.
Tu réponds en français.`;

export function buildAnalysisPrompt(
  listing: Listing,
  quick: QuickAnalysis,
  profile: UsageProfile,
): string {
  const market = quick.market;
  const comparablesBlock =
    market && market.comparables.length > 0
      ? `\n- Ventes comparables :\n${market.comparables
          .map((c) => `- ${c.date} · ${c.type} ${c.surface} m² · ${c.price.toLocaleString("fr-FR")} € (${Math.round(c.pricePerM2)} €/m²) · à ${c.distanceM} m`)
          .join("\n")}`
      : "";

  return `Analyse ce bien pour un ${PROFILE_LABEL[profile]}.

## Annonce
- Titre : ${listing.title}
- Prix demandé : ${listing.price.toLocaleString("fr-FR")} €
- Surface : ${listing.surface ?? "inconnue"} m² · Pièces : ${listing.rooms ?? "?"} · Type : ${listing.propertyType ?? "?"}
- Localisation : ${listing.location.rawAddress}
- DPE : ${listing.dpe ?? "non renseigné"} · GES : ${listing.ges ?? "non renseigné"}
- Publiée le : ${listing.publishedAt ?? "date inconnue"}
- Description : ${listing.description.slice(0, 2500)}

## Marché local (transactions notariées DVF)
${
  market
    ? `- Médiane du secteur : ${market.medianPricePerM2} €/m² (${market.sampleSize} ventes, rayon ${market.radiusM} m, confiance ${market.confidence})
- Prix demandé : ${quick.listingPricePerM2} €/m², soit ${quick.marketGapPct! >= 0 ? "+" : ""}${quick.marketGapPct!.toFixed(1)} % vs médiane${comparablesBlock}`
    : "- Données DVF insuffisantes dans la zone : ne chiffre l'écart au marché que si la description le permet, et signale cette limite."
}

## Attendu
Remplis le schéma demandé : synthèse (2-3 paragraphes adaptés au profil), recommandation en une phrase,
points de vigilance concrets (DPE, copropriété, travaux, quartier, éléments suspects de l'annonce),
et négociation (cibleBasse, cibleHaute en euros, arguments factuels tirés des données).`;
}
