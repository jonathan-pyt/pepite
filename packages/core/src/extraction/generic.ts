import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import type { Listing, PropertyType } from "../types";
import { createModel, type LlmConfig } from "../analysis/provider";
import { detectSite } from "./sites";

/** Schema mirroring the extractable fields of a Listing. */
const extractionSchema = z.object({
  title: z.string().describe("Titre de l'annonce"),
  price: z
    .number()
    .nullable()
    .describe("Prix de vente en euros (nombre, sans symbole ni séparateur). null si la page ne contient pas une annonce identifiable."),
  surface: z.number().nullable().describe("Surface habitable en m²"),
  rooms: z.number().nullable().describe("Nombre de pièces"),
  propertyType: z
    .enum(["Appartement", "Maison"])
    .nullable()
    .describe("Type de bien, uniquement Appartement ou Maison si clairement indiqué"),
  city: z.string().nullable().describe("Ville"),
  postalCode: z.string().nullable().describe("Code postal (5 chiffres)"),
  district: z.string().nullable().describe("Quartier si mentionné"),
  dpe: z.string().nullable().describe("Lettre DPE (A à G) si indiquée"),
  ges: z.string().nullable().describe("Lettre GES (A à G) si indiquée"),
  description: z.string().describe("Description du bien, texte brut"),
  publishedAt: z
    .string()
    .nullable()
    .describe("Date de publication de l'annonce si indiquée (format ISO ou texte)"),
  attributes: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe("Caractéristiques clairement étiquetées (étage, ascenseur, chauffage…), max 30"),
});

type Extraction = z.infer<typeof extractionSchema>;
const partialExtractionSchema = extractionSchema.partial();

const SYSTEM_PROMPT = `Tu es un extracteur de données d'annonces immobilières françaises.
À partir du texte brut d'une page d'annonce, tu renvoies UNIQUEMENT les informations réellement présentes.
Règles strictes :
- N'INVENTE JAMAIS une valeur. Si une donnée n'est pas explicitement présente, renvoie null (ou un tableau vide pour attributes).
- Le titre doit être celui de l'ANNONCE (type de bien, surface, ville) — jamais le titre générique du site. Si la page ne contient pas une annonce immobilière identifiable, renvoie price: null.
- Le prix est exprimé en euros, sous forme de nombre entier (ex : 289000), sans symbole, espace ni séparateur de milliers.
- La surface est en m² (nombre).
- propertyType vaut « Appartement » ou « Maison » uniquement si le type est clairement indiqué, sinon null.
- dpe et ges : une seule lettre A à G si indiquée, sinon null.
- description : le texte descriptif tel quel, sans reformulation.
- attributes : uniquement des caractéristiques clairement étiquetées (label + valeur), 30 au maximum.`;

function buildPrompt(pageText: string): string {
  return `Voici le contenu textuel d'une page d'annonce immobilière. Extrais les données structurées.\n\n---\n${pageText}\n---`;
}

function buildJsonPrompt(pageText: string): string {
  return `${buildPrompt(pageText)}

Réponds uniquement avec un objet JSON valide, sans bloc Markdown, avec ces clés :
title, price, surface, rooms, propertyType, city, postalCode, district, dpe, ges, description, publishedAt, attributes.
Utilise null pour les valeurs absentes et [] pour attributes si aucune caractéristique n'est exploitable.`;
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("generic: sortie JSON introuvable");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

function normalizeExtraction(raw: unknown): Extraction {
  const ex = partialExtractionSchema.parse(raw);
  return {
    title: ex.title ?? "",
    price: ex.price ?? null,
    surface: ex.surface ?? null,
    rooms: ex.rooms ?? null,
    propertyType: ex.propertyType ?? null,
    city: ex.city ?? null,
    postalCode: ex.postalCode ?? null,
    district: ex.district ?? null,
    dpe: ex.dpe ?? null,
    ges: ex.ges ?? null,
    description: ex.description ?? "",
    publishedAt: ex.publishedAt ?? null,
    attributes: ex.attributes ?? [],
  };
}

function letter(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const up = value.trim().toUpperCase();
  return /^[A-G]$/.test(up) ? up : undefined;
}

function num(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: string | null | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function toListing(ex: Extraction, url: string): Listing {
  if (ex.price === null) {
    throw new Error("generic: page sans annonce identifiable");
  }

  const site = detectSite(url) ?? "generic";
  const city = str(ex.city);
  const postalCode = str(ex.postalCode);
  const district = str(ex.district);
  const rawAddress = [city, postalCode, district].filter(Boolean).join(" ");

  const propertyType: PropertyType | undefined =
    ex.propertyType === "Appartement" || ex.propertyType === "Maison" ? ex.propertyType : undefined;

  const attributes = ex.attributes
    .filter((a) => a.label.trim().length > 0)
    .slice(0, 30)
    .map((a) => ({ label: a.label.trim(), value: a.value.trim() }));

  return {
    url,
    site,
    title: ex.title.trim(),
    price: ex.price,
    surface: num(ex.surface),
    rooms: num(ex.rooms),
    propertyType,
    location: {
      rawAddress,
      city,
      postalCode,
      district,
    },
    dpe: letter(ex.dpe),
    ges: letter(ex.ges),
    description: ex.description.trim(),
    photos: [],
    publishedAt: str(ex.publishedAt),
    extractedAt: new Date().toISOString(),
    attributes: attributes.length > 0 ? attributes : undefined,
  };
}

/**
 * Generic LLM-based extractor: turns the prepared text of a listing page into a
 * normalised `Listing`. The caller prepares `pageText` (title + meta description
 * + main text, capped ~12k chars). Throws `NoObjectGeneratedError` when the model
 * fails to produce a valid object.
 */
export async function extractListingGeneric(
  pageText: string,
  url: string,
  cfg: LlmConfig,
  modelOverride?: LanguageModel,
): Promise<Listing> {
  const model = modelOverride ?? createModel(cfg);
  if (cfg.provider === "openai" && cfg.baseURL?.trim()) {
    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: buildJsonPrompt(pageText),
    });
    return toListing(normalizeExtraction(parseJsonObject(text)), url);
  }

  const { output } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(pageText),
    output: Output.object({ schema: extractionSchema }),
  });
  return toListing(output, url);
}
