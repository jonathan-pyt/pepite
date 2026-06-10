import { z } from "zod";

export type Site = "leboncoin" | "seloger" | "bienici" | "citya" | "generic";
export type UsageProfile = "residence" | "locatif-nu" | "airbnb" | "coloc";
export type PropertyType = "Appartement" | "Maison";

export interface ListingLocation {
  rawAddress: string;
  postalCode?: string;
  city?: string;
  district?: string;
  precision?: string;
  lat?: number;
  lon?: number;
}

export interface Listing {
  url: string;
  site: Site;
  title: string;
  price: number;
  surface?: number;
  rooms?: number;
  bedrooms?: number;
  landSurface?: number;
  propertyType?: PropertyType;
  location: ListingLocation;
  dpe?: string;
  ges?: string;
  description: string;
  photos: string[];
  publishedAt?: string;
  extractedAt: string;
  attributes?: { label: string; value: string }[];
}

export interface GeoPoint {
  lat: number;
  lon: number;
  citycode: string;
  label: string;
  score: number;
  precision: "housenumber" | "street" | "locality" | "municipality";
}

export interface DvfSale {
  idMutation: string;
  date: string;
  price: number;
  surface: number;
  rooms: number;
  pricePerM2: number;
  type: PropertyType;
  lat: number;
  lon: number;
  address: string;
}

export interface Comparable extends DvfSale {
  distanceM: number;
  similar?: boolean;
}

export interface MarketStats {
  medianPricePerM2: number;
  p25PricePerM2?: number;
  p75PricePerM2?: number;
  sampleSize: number;
  radiusM: number;
  confidence: "high" | "medium" | "low";
  comparables: Comparable[];
  medianOnSimilar?: boolean;
  windowMonths?: number;
}

export interface QuickAnalysis {
  listingPricePerM2: number | null;
  marketGapPct: number | null;
  market: MarketStats | null;
  score: number | null;
  scoreLabel: string;
}

export const analysisSchema = z.object({
  synthese: z.string().describe("Synthèse rédigée de 2 à 3 paragraphes, en français"),
  recommandation: z
    .string()
    .describe(
      "Recommandation en une phrase, formulée en termes de valeur estimée et de défendabilité — ex. « Au vu des ventes du secteur, ce bien se situe dans les prix du marché ; marge de négociation limitée (2-3 %) » ou « Le bien paraît surcoté d'environ X % par rapport aux ventes comparables — une offre vers Y € est défendable ». Ne jamais formuler de promesses assertives du type « négociable à X € ».",
    ),
  pointsVigilance: z
    .array(
      z.object({
        titre: z.string(),
        detail: z.string(),
        niveau: z.enum(["info", "attention", "critique"]),
      }),
    )
    .describe(
      "Liste TOUS les points de vigilance pertinents (généralement 4 à 8, pas de limite) — inclure SYSTÉMATIQUEMENT un point sur la date de publication de l'annonce.",
    ),
  negociation: z.object({
    cibleBasse: z
      .number()
      .describe(
        "Offre basse DÉFENDABLE, justifiée uniquement par les données fournies (écart vs médiane DVF des biens comparables, durée de publication, défauts objectifs) — jamais une décote arbitraire. Si le prix demandé est déjà sous la médiane, rester proche du prix demandé.",
      ),
    cibleHaute: z
      .number()
      .describe(
        "Prix d'accord plausible ; si le prix demandé est cohérent avec le marché, rester proche du prix demandé.",
      ),
    arguments: z
      .array(z.string())
      .describe(
        "Chaque argument doit citer une donnée fournie (médiane, vente comparable, DPE, durée de publication…) — aucun argument inventé.",
      ),
  }),
  profils: z.object({
    residence: z.string().describe("Avis résidence principale, 1 paragraphe"),
    "locatif-nu": z.string().describe("Avis location nue (loyer plausible si estimable, sinon le dire)"),
    airbnb: z.string().describe("Avis courte durée (potentiel, contraintes réglementaires à vérifier)"),
    coloc: z.string().describe("Avis colocation (adéquation pièces/surface, demande locale)"),
  }),
});
export type AnalysisResult = z.infer<typeof analysisSchema>;

export interface PoiCategory {
  count: number;
  nearest: { name: string; distanceM: number }[]; // ≤3, nommés uniquement
}

export interface NeighborhoodStats {
  radiusM: number;
  ecoles: PoiCategory;
  commerces: PoiCategory;
  sante: PoiCategory;
  transports: PoiCategory;
  espacesVerts: PoiCategory;
}

export interface RiskItem {
  libelle: string;
  statut: string;
}

export interface RiskReport {
  naturels: RiskItem[];
  technologiques: RiskItem[]; // uniquement les présents
}

export interface RentInfo {
  loyerM2: number; // €/m² charges comprises (médiane prédite)
  loyerM2Bas: number; // IC 80 %
  loyerM2Haut: number;
  fiable: boolean; // TYPPRED === "commune"
  nbAnnonces: number; // nbobs_com
  zoneAbc?: string; // A bis / A / B1 / B2 / C
}

export interface Enrichments {
  neighborhood?: NeighborhoodStats;
  risks?: RiskReport;
  rent?: RentInfo;
}

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

export interface Report {
  id: string;
  listingUrl: string;
  createdAt: string;
  listing: Listing;
  quick: QuickAnalysis;
  analysis: AnalysisResult;
  provider: string;
  model: string;
  enrichments?: Enrichments;
  globalScore?: GlobalScore;
}
