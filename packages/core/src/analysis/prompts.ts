import type { Listing, QuickAnalysis, UsageProfile } from "../types";

export const PROFILE_LABEL: Record<UsageProfile, string> = {
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
  now: Date = new Date(),
): string {
  const market = quick.market;
  const comparablesBlock =
    market && market.comparables.length > 0
      ? `\n- Ventes comparables :\n${market.comparables
          .map((c) => `- ${c.date} · ${c.type} ${c.surface} m² · ${c.price.toLocaleString("fr-FR")} € (${Math.round(c.pricePerM2)} €/m²) · à ${c.distanceM} m`)
          .join("\n")}`
      : "";

  const dateStr = now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const attributesBlock =
    listing.attributes && listing.attributes.length > 0
      ? `\n- Caractéristiques complètes :\n${listing.attributes.map((a) => `  - ${a.label} : ${a.value}`).join("\n")}`
      : "";

  return `Nous sommes le ${dateStr}.

Analyse ce bien pour un acheteur particulier.

## Annonce
- Titre : ${listing.title}
- Prix demandé : ${listing.price.toLocaleString("fr-FR")} €
- Surface : ${listing.surface ?? "inconnue"} m² · Pièces : ${listing.rooms ?? "?"} · Type : ${listing.propertyType ?? "?"}
- Localisation : ${listing.location.rawAddress}
- DPE : ${listing.dpe ?? "non renseigné"} · GES : ${listing.ges ?? "non renseigné"}
- Publiée le : ${listing.publishedAt ?? "date inconnue"}
- Description : ${listing.description.slice(0, 2500)}${attributesBlock}

## Marché local (transactions notariées DVF)
${
  market
    ? `- Médiane du secteur : ${market.medianPricePerM2} €/m² (${market.sampleSize} ventes, rayon ${market.radiusM} m, confiance ${market.confidence})
- Prix demandé : ${quick.listingPricePerM2} €/m², soit ${quick.marketGapPct! >= 0 ? "+" : ""}${quick.marketGapPct!.toFixed(1)} % vs médiane${comparablesBlock}`
    : "- Données DVF insuffisantes dans la zone : ne chiffre l'écart au marché que si la description le permet, et signale cette limite."
}

## Attendu
Remplis le schéma demandé : synthèse globale (2-3 paragraphes), recommandation en une phrase,
points de vigilance concrets (DPE, copropriété, travaux, quartier, éléments suspects de l'annonce),
négociation (cibleBasse, cibleHaute en euros, arguments factuels tirés des données),
et un avis distinct par profil d'usage (1 paragraphe solide chacun, fondé uniquement sur les données fournies — si un loyer ou rendement ne peut pas être estimé à partir des données, le dire).
Exploite toutes les caractéristiques et la description : équipements (piscine, extérieur, salles de bain, stationnement…), atouts et défauts implicites — un acheteur ne doit rien rater d'important.
- ${PROFILE_LABEL["residence"]}
- ${PROFILE_LABEL["locatif-nu"]}
- ${PROFILE_LABEL["airbnb"]}
- ${PROFILE_LABEL["coloc"]}`;
}
