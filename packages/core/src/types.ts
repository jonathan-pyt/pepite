import { z } from "zod";

export type Site = "leboncoin" | "seloger" | "bienici" | "citya" | "generic";
export type UsageProfile = "residence" | "locatif-nu" | "airbnb" | "coloc";
export type PropertyType = "Appartement" | "Maison";

export interface ListingLocation {
  rawAddress: string;
  postalCode?: string;
  city?: string;
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
  propertyType?: PropertyType;
  location: ListingLocation;
  dpe?: string;
  ges?: string;
  description: string;
  photos: string[];
  publishedAt?: string;
  extractedAt: string;
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
}

export interface MarketStats {
  medianPricePerM2: number;
  sampleSize: number;
  radiusM: number;
  confidence: "high" | "medium" | "low";
  comparables: Comparable[];
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
    .describe("Recommandation en une phrase, ex. « Bien intéressant, négociable autour de 277 000 € »"),
  pointsVigilance: z.array(
    z.object({
      titre: z.string(),
      detail: z.string(),
      niveau: z.enum(["info", "attention", "critique"]),
    }),
  ),
  negociation: z.object({
    cibleBasse: z.number().describe("Prix d'offre basse réaliste en euros"),
    cibleHaute: z.number().describe("Prix d'accord probable en euros"),
    arguments: z.array(z.string()).describe("Arguments factuels utilisables avec le vendeur"),
  }),
});
export type AnalysisResult = z.infer<typeof analysisSchema>;

export interface Report {
  id: string;
  listingUrl: string;
  createdAt: string;
  profile: UsageProfile;
  listing: Listing;
  quick: QuickAnalysis;
  analysis: AnalysisResult;
  provider: string;
  model: string;
}
