import { generateText } from "ai";
import type { LanguageModel } from "ai";
import { createModel } from "../analysis/provider";
import { getRestyleStyle } from "./styles";

/**
 * Modèle Gemini de génération/édition d'image.
 * Syntaxe vérifiée le 2026-06-11 sur https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai
 * (ai@6.0.199 / @ai-sdk/google@3.0.80) : generateText + image d'entrée en part
 * `{ type: "file", data, mediaType }` → images de sortie dans `result.files`.
 */
export const RESTYLE_IMAGE_MODEL = "gemini-2.5-flash-image";

/** Style demandé : preset connu (cf. RESTYLE_STYLES) ou description libre. */
export type RestyleStyleChoice = { preset: string } | { custom: string };

export interface RestyleImageInput {
  apiKey: string;
  image: { data: Uint8Array; mediaType: string };
  style: RestyleStyleChoice;
  roomHint?: string;
}

export interface RestyleImageOutput {
  data: Uint8Array;
  mediaType: string;
}

export function buildRestylePrompt(style: RestyleStyleChoice, roomHint?: string): string {
  let styleText: string;
  if ("preset" in style) {
    const preset = getRestyleStyle(style.preset);
    if (!preset) throw new Error(`Style inconnu : « ${style.preset} »`);
    styleText = preset.description;
  } else {
    styleText = style.custom;
  }
  const piece = roomHint ? `cette pièce (${roomHint})` : "cette pièce";
  return `Redessine la photo fournie, issue d'une annonce immobilière, pour montrer ${piece} redécorée.

CONTRAINTES STRICTES — à respecter absolument :
- Conserve STRICTEMENT l'architecture de la pièce : murs, fenêtres, portes et ouvertures, volumes, hauteur sous plafond, perspective et cadrage identiques à la photo d'origine.
- Ne déplace, n'ajoute et ne supprime aucun élément structurel.
- Change uniquement la décoration : mobilier, revêtements (sols, murs, plafond), couleurs, luminaires, textiles et objets décoratifs.
- Rendu photoréaliste, lumière naturelle cohérente avec la photo d'origine.
- Aucun texte, logo ou filigrane incrusté dans l'image.

Style à appliquer : ${styleText}`;
}

/**
 * Redessine une photo d'annonce selon un style déco via Gemini.
 * Restyle = Gemini uniquement, quel que soit le provider d'analyse.
 */
export async function restyleImage(
  input: RestyleImageInput,
  modelOverride?: LanguageModel,
): Promise<RestyleImageOutput> {
  const model =
    modelOverride ??
    createModel({ provider: "google", apiKey: input.apiKey, model: RESTYLE_IMAGE_MODEL });
  const result = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildRestylePrompt(input.style, input.roomHint) },
          { type: "file", data: input.image.data, mediaType: input.image.mediaType },
        ],
      },
    ],
  });
  const image = result.files.find((f) => f.mediaType.startsWith("image/"));
  if (!image) {
    throw new Error(
      "Gemini n'a renvoyé aucune image — réessayez, ou choisissez une autre photo.",
    );
  }
  return { data: image.uint8Array, mediaType: image.mediaType };
}
