import type { Enrichments, Listing, NeighborhoodStats, QuickAnalysis, RentInfo, RiskReport, UsageProfile } from "../types";

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

function dpeLine(listing: Listing): string {
  if (listing.dpe !== undefined) {
    return `DPE : ${listing.dpe}`;
  }
  const postal = listing.location.postalCode ?? "";
  if (postal.startsWith("97") || postal.startsWith("98")) {
    return "DPE : non applicable (outre-mer — méthode DPE non publiée pour ce territoire, opposabilité prévue 2028+ ; ne pas traiter l'absence de DPE comme un point de vigilance)";
  }
  return "DPE : non renseigné";
}

function buildNeighborhoodSection(n: NeighborhoodStats): string {
  function catLine(label: string, cat: { count: number; nearest: { name: string; distanceM: number }[] }): string {
    const nearestStr = cat.nearest.length > 0
      ? ` (${cat.nearest.map((p) => `${p.name} à ${p.distanceM} m`).join(", ")})`
      : "";
    return `- ${label} : ${cat.count}${nearestStr}`;
  }
  return `## Quartier (rayon ${n.radiusM} m, OpenStreetMap)
${catLine("Écoles", n.ecoles)}
${catLine("Commerces", n.commerces)}
${catLine("Santé", n.sante)}
${catLine("Transports", n.transports)}
${catLine("Espaces verts", n.espacesVerts)}`;
}

function buildRisksSection(r: RiskReport): string {
  const all = [...r.naturels, ...r.technologiques];
  if (all.length === 0) {
    return `## Risques recensés sur la commune (Géorisques)
- Aucun risque naturel ou technologique présent sur cette commune.`;
  }
  const lines = all.map((item) => `- ${item.libelle} : ${item.statut}`).join("\n");
  return `## Risques recensés sur la commune (Géorisques)
${lines}`;
}

function buildRentSection(rent: RentInfo): string {
  const fiabilite = rent.fiable
    ? `observé sur la commune (${rent.nbAnnonces} annonces)`
    : "extrapolé (maille) — prudence";
  const zoneStr = rent.zoneAbc ? `\n- Zone ABC : ${rent.zoneAbc}` : "";
  return `## Marché locatif (carte des loyers 2025)
- Loyer médian prédit : ${rent.loyerM2} €/m² CC
- Intervalle de confiance 80 % : ${rent.loyerM2Bas} – ${rent.loyerM2Haut} €/m²
- Fiabilité : ${fiabilite}${zoneStr}`;
}

export function buildAnalysisPrompt(
  listing: Listing,
  quick: QuickAnalysis,
  enrichments?: Enrichments,
  now: Date = new Date(),
): string {
  const market = quick.market;
  const comparablesBlock =
    market && market.comparables.length > 0
      ? `\n- Ventes comparables :\n${market.comparables
          .map((c) => {
            const line = `- ${c.date} · ${c.type} ${c.surface} m² · ${c.price.toLocaleString("fr-FR")} € (${Math.round(c.pricePerM2)} €/m²) · à ${c.distanceM} m`;
            return c.similar === false ? `${line} (surface éloignée du bien)` : line;
          })
          .join("\n")}${market.medianOnSimilar ? `\n- Médiane calculée sur les ${market.sampleSize} ventes de surface comparable (±30 %).` : ""}`
      : "";

  const dateStr = now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const attributesBlock =
    listing.attributes && listing.attributes.length > 0
      ? `\n- Caractéristiques complètes :\n${listing.attributes.map((a) => `  - ${a.label} : ${a.value}`).join("\n")}`
      : "";

  const neighborhoodBlock = enrichments?.neighborhood
    ? buildNeighborhoodSection(enrichments.neighborhood)
    : `## Quartier (rayon 800 m, OpenStreetMap)\n- données quartier indisponibles`;

  const risksBlock = enrichments?.risks
    ? buildRisksSection(enrichments.risks)
    : `## Risques recensés sur la commune (Géorisques)\n- données risques indisponibles`;

  const rentBlock = enrichments?.rent
    ? buildRentSection(enrichments.rent)
    : `## Marché locatif (carte des loyers 2025)\n- données loyers indisponibles`;

  const dispersionLine =
    market?.p25PricePerM2 !== undefined && market?.p75PricePerM2 !== undefined
      ? `\n- Dispersion du secteur : P25 ${market.p25PricePerM2} €/m² · P75 ${market.p75PricePerM2} €/m²`
      : "";

  return `Nous sommes le ${dateStr}.

Analyse ce bien pour un acheteur particulier.

## Annonce
- Titre : ${listing.title}
- Prix demandé : ${listing.price.toLocaleString("fr-FR")} €
- Surface : ${listing.surface ?? "inconnue"} m² · Pièces : ${listing.rooms ?? "?"} · Type : ${listing.propertyType ?? "?"}
- Localisation : ${listing.location.rawAddress}
- ${dpeLine(listing)} · GES : ${listing.ges ?? "non renseigné"}
- Publiée le : ${listing.publishedAt ?? "date inconnue"}
- Description : ${listing.description.slice(0, 2500)}${attributesBlock}

## Marché local (transactions notariées DVF)
${
  market
    ? `- Médiane du secteur : ${market.medianPricePerM2} €/m² (${market.sampleSize} ventes${market.windowMonths === 18 ? " des 18 derniers mois" : " des 3 dernières années"}, rayon ${market.radiusM} m, confiance ${market.confidence})${dispersionLine}
- Prix demandé : ${quick.listingPricePerM2} €/m², soit ${quick.marketGapPct! >= 0 ? "+" : ""}${quick.marketGapPct!.toFixed(1)} % vs médiane${comparablesBlock}`
    : "- Données DVF insuffisantes dans la zone : ne chiffre l'écart au marché que si la description le permet, et signale cette limite."
}

${neighborhoodBlock}

${risksBlock}

${rentBlock}

## Règles pour la négociation

- Tiens compte de l'ancienneté de chaque vente comparable : le marché évolue, une vente d'il y a 2-3 ans ne reflète pas nécessairement les prix actuels.
- La marge de négociation se DÉDUIT des données, elle ne s'invente pas. En France, la marge habituelle constatée est de 2 à 5 % ; au-delà de 8-10 %, il faut des arguments objectifs forts (surcote manifeste vs ventes DVF comparables, annonce ancienne, travaux lourds, DPE F/G).
- Si le prix demandé est égal ou inférieur à la médiane des ventes comparables : le dire explicitement, et proposer une marge faible voire nulle (cibleBasse proche du prix demandé). Ne JAMAIS proposer une décote importante sur un bien déjà sous le marché.
- Formuler la recommandation en termes de VALEUR estimée et de défendabilité (« vaut plutôt autour de… au vu de… »), pas en promesse (« négociable à… »).
- Si les données marché sont absentes ou peu fiables (confiance basse, type non comparé), dire que la marge ne peut pas être chiffrée sérieusement.
- Avant de conclure « surcoté » : confronter l'écart vs médiane à la DISPERSION du secteur (P25/P75). Un prix au-dessus de la médiane mais sous le P75 se situe dans la fourchette haute normale du secteur — ce n'est pas une anomalie, et un verdict « forte surcote » n'est pas fondé sur la seule médiane.
- Confronter l'écart aux atouts objectifs du bien : caractéristiques de l'annonce (résidence de standing, ascenseur, terrasse, étage élevé, état/rénovation récente, prestations supérieures) ET qualité de micro-localisation visible dans les données quartier (commodités à pied nombreuses = premium de localisation plausible). Formuler ainsi : « premium de X % par rapport à la médiane, possiblement justifié par [éléments cités] » ou « écart difficile à justifier au vu de [absence d'atouts distinctifs] » — jamais de verdict brut « forte surcote » fondé sur la seule médiane.
- Symétrie : un prix sous le P25 mérite aussi un commentaire — soit une opportunité réelle (bien en bon état, bon secteur), soit un signal d'alerte (expliquer pourquoi si bas : travaux, situation, contrainte ?).
- Pour le profil locatif-nu : si des données loyers sont disponibles (ci-dessus), calculer un rendement brut indicatif (loyer médian × surface × 12 / prix demandé) et l'afficher comme estimation ; indiquer l'incertitude si fiabilité maille. Si les données loyers sont indisponibles, le dire explicitement sans inventer de chiffre.
- Pour le profil Airbnb : pas de données courte durée fournies — ne pas inventer de taux d'occupation ni de revenu estimé ; se limiter aux éléments objectifs de l'annonce et aux contraintes réglementaires.

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
