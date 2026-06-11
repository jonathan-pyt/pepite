import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { buildRestylePrompt, restyleImage } from "./restyle";
import { buildRestyleCostPrompt, estimateRestyleCost } from "./cost";
import { RESTYLE_STYLES, getRestyleStyle } from "./styles";
import type { Listing } from "../types";

const listing = {
  url: "https://www.leboncoin.fr/ad/ventes_immobilieres/1",
  site: "leboncoin",
  title: "Appartement T3 64 m²",
  price: 289_000,
  surface: 64,
  rooms: 3,
  propertyType: "Appartement",
  location: { rawAddress: "Nantes 44000", city: "Nantes", postalCode: "44000" },
  dpe: "C",
  description: "Bel appartement lumineux au 3e étage…",
  photos: ["https://img.leboncoin.fr/api/v1/images/photo1.jpg"],
  extractedAt: "2026-06-10T00:00:00.000Z",
} as Listing;

const usage = {
  inputTokens: { total: 100, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 200, text: undefined, reasoning: undefined },
};

const sourceImage = { data: new Uint8Array([1, 2, 3, 4]), mediaType: "image/jpeg" };

describe("RESTYLE_STYLES", () => {
  it("expose les 7 presets de la maquette avec paires de couleurs et description", () => {
    expect(RESTYLE_STYLES.map((s) => s.nom)).toEqual([
      "Scandinave",
      "Industriel",
      "Minimaliste",
      "Haussmannien moderne",
      "Bohème",
      "Japandi",
      "Campagne chic",
    ]);
    for (const s of RESTYLE_STYLES) {
      expect(s.colors).toHaveLength(2);
      expect(s.colors[0]).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.description.length).toBeGreaterThan(40);
    }
  });

  it("getRestyleStyle retrouve un preset par nom", () => {
    expect(getRestyleStyle("Japandi")?.colors).toEqual(["#ded5c4", "#3d3a34"]);
    expect(getRestyleStyle("Gothique")).toBeUndefined();
  });
});

describe("buildRestylePrompt", () => {
  it("impose la conservation stricte de l'architecture et le rendu photoréaliste", () => {
    const prompt = buildRestylePrompt({ preset: "Scandinave" });
    expect(prompt).toContain("STRICTEMENT l'architecture");
    expect(prompt).toContain("murs, fenêtres, portes et ouvertures, volumes");
    expect(prompt).toContain("perspective");
    expect(prompt).toContain("photoréaliste");
    expect(prompt).toContain("Aucun texte, logo ou filigrane");
  });

  it("injecte la description du preset choisi", () => {
    const prompt = buildRestylePrompt({ preset: "Industriel" });
    expect(prompt).toContain(getRestyleStyle("Industriel")!.description);
  });

  it("injecte le prompt libre tel quel", () => {
    const prompt = buildRestylePrompt({ custom: "Murs vert sauge, parquet clair conservé" });
    expect(prompt).toContain("Murs vert sauge, parquet clair conservé");
  });

  it("mentionne la pièce quand roomHint est fourni", () => {
    const prompt = buildRestylePrompt({ preset: "Bohème" }, "séjour");
    expect(prompt).toContain("séjour");
  });

  it("rejette un preset inconnu avec une erreur claire", () => {
    expect(() => buildRestylePrompt({ preset: "Gothique" })).toThrow("Style inconnu");
  });
});

describe("restyleImage", () => {
  it("retourne la première image de result.files", async () => {
    const generated = new Uint8Array([137, 80, 78, 71]);
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [
          { type: "text", text: "Voici le rendu." },
          { type: "file", data: generated, mediaType: "image/png" },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      }),
    });
    const out = await restyleImage(
      { apiKey: "test", image: sourceImage, style: { preset: "Scandinave" } },
      model,
    );
    expect(out.mediaType).toBe("image/png");
    expect(out.data).toEqual(generated);
  });

  it("envoie le prompt et la photo d'origine dans le message utilisateur", async () => {
    let sentPrompt: unknown;
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        sentPrompt = options.prompt;
        return {
          content: [{ type: "file", data: new Uint8Array([1]), mediaType: "image/png" }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        };
      },
    });
    await restyleImage(
      { apiKey: "test", image: sourceImage, style: { preset: "Japandi" }, roomHint: "cuisine" },
      model,
    );
    const messages = sentPrompt as { role: string; content: { type: string; mediaType?: string; text?: string }[] }[];
    const user = messages.find((m) => m.role === "user")!;
    const text = user.content.find((p) => p.type === "text")!;
    const file = user.content.find((p) => p.type === "file")!;
    expect(text.text).toContain("STRICTEMENT l'architecture");
    expect(text.text).toContain("cuisine");
    expect(file.mediaType).toBe("image/jpeg");
  });

  it("erreur claire si le modèle ne renvoie aucune image", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: "Je ne peux pas générer cette image." }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      }),
    });
    await expect(
      restyleImage({ apiKey: "test", image: sourceImage, style: { preset: "Scandinave" } }, model),
    ).rejects.toThrow("aucune image");
  });
});

describe("estimateRestyleCost", () => {
  const fakeCost = {
    postes: [
      { label: "Peinture murs + plafond", montant: 1900 },
      { label: "Sol / ponçage parquet", montant: 1450 },
      { label: "Mobilier & luminaires", montant: 2800 },
    ],
    totalMin: 5500,
    totalMax: 7200,
    commentaire:
      "Fourchette indicative pour cette pièce — utilisable comme argument de négociation.",
  };

  it("parse la sortie structurée du modèle", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify(fakeCost) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      }),
    });
    const cost = await estimateRestyleCost(
      {
        listing,
        styleLabel: "Scandinave",
        roomHint: "séjour",
        settings: { provider: "google", apiKey: "test", model: "gemini-2.5-flash" },
      },
      model,
    );
    expect(cost.postes).toHaveLength(3);
    expect(cost.postes[0]!.montant).toBe(1900);
    expect(cost.totalMin).toBe(5500);
    expect(cost.totalMax).toBe(7200);
    expect(cost.commentaire).toContain("négociation");
  });
});

describe("buildRestyleCostPrompt", () => {
  it("inclut surface, pièces, DPE, type de bien et style choisi", () => {
    const prompt = buildRestyleCostPrompt({ listing, styleLabel: "Haussmannien moderne" });
    expect(prompt).toContain("64 m²");
    expect(prompt).toContain("Pièces : 3");
    expect(prompt).toContain("DPE : C");
    expect(prompt).toContain("Appartement");
    expect(prompt).toContain("Haussmannien moderne");
  });

  it("demande une fourchette prudente formulée en argument de négociation", () => {
    const prompt = buildRestyleCostPrompt({ listing, styleLabel: "Scandinave" });
    expect(prompt).toContain("fourchette indicative");
    expect(prompt).toContain("prudent");
    expect(prompt).toContain("négociation");
    expect(prompt).toContain("CETTE pièce");
  });

  it("mentionne la pièce quand roomHint est fourni", () => {
    const prompt = buildRestyleCostPrompt({ listing, styleLabel: "Bohème", roomHint: "séjour 28 m²" });
    expect(prompt).toContain("séjour 28 m²");
  });
});
