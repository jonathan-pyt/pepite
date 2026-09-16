import { describe, expect, it } from "vitest";
import type { Report } from "../types";
import { HistoryImportError, buildExport, parseImport } from "./io";

/** Rapport de fixture conforme exactement à l'interface `Report`. */
function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "rpt-1",
    listingUrl: "https://example.com/annonce/1",
    createdAt: "2026-01-10T09:00:00.000Z",
    provider: "google",
    model: "gemini-2.5-flash",
    listing: {
      url: "https://example.com/annonce/1",
      site: "seloger",
      title: "T3 lumineux avec balcon",
      price: 245000,
      surface: 62,
      location: { rawAddress: "12 rue des Fleurs, 69003 Lyon", city: "Lyon", postalCode: "69003" },
      description: "Bel appartement traversant.",
      photos: ["https://example.com/photo1.jpg", "https://example.com/photo2.jpg"],
      extractedAt: "2026-01-10T08:59:00.000Z",
    },
    quick: {
      listingPricePerM2: 3951,
      marketGapPct: -4.2,
      market: null,
      score: 78,
      scoreLabel: "Bon",
    },
    analysis: {
      synthese: "Bien correctement positionné par rapport au marché local.",
      recommandation: "Au vu des ventes du secteur, ce bien se situe dans les prix du marché.",
      pointsVigilance: [
        { titre: "Date de publication", detail: "En ligne depuis 3 jours.", niveau: "info" },
      ],
      negociation: {
        cibleBasse: 238000,
        cibleHaute: 245000,
        arguments: ["Écart de -4 % vs médiane DVF du secteur."],
      },
      profils: {
        residence: "Adapté à une résidence principale.",
        "locatif-nu": "Loyer plausible autour de 850 €.",
        airbnb: "Réglementation locale à vérifier.",
        coloc: "3 pièces : colocation possible.",
      },
      checklistVisite: ["Demander les PV d'AG", "Vérifier l'isolation des menuiseries"],
    },
    ...overrides,
  };
}

describe("buildExport", () => {
  it("produit une enveloppe versionnée avec la métadonnée fournie", () => {
    const env = buildExport([report()], { appVersion: "0.6.0", exportedAt: "2026-01-15T12:00:00.000Z" });
    expect(env.schemaVersion).toBe(1);
    expect(env.appVersion).toBe("0.6.0");
    expect(env.exportedAt).toBe("2026-01-15T12:00:00.000Z");
    expect(env.reports).toHaveLength(1);
  });

  it("horodate par défaut avec un ISO 8601 valide", () => {
    const env = buildExport([], { appVersion: "0.6.0" });
    expect(env.exportedAt).toBe(new Date(env.exportedAt).toISOString());
  });
});

describe("parseImport", () => {
  it("round-trip fidèle export → JSON → import (y compris champs optionnels)", () => {
    const original = report({
      globalScore: { score: 81, criteres: [{ id: "prix", label: "Prix", score: 80, poids: 40 }] },
      negotiationEmails: {
        assertif: { objet: "Offre d'achat", corps: "Bonjour, ..." },
        modere: { objet: "Proposition", corps: "Bonjour, ..." },
        aimable: { objet: "Intérêt pour votre bien", corps: "Bonjour, ..." },
      },
    });
    const text = JSON.stringify(buildExport([original], { appVersion: "0.6.0" }));
    const { reports } = parseImport(text);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(original);
  });

  it("rejette un JSON malformé", () => {
    expect(() => parseImport("{ pas du json")).toThrow(HistoryImportError);
  });

  it("rejette un JSON valide mais non-objet", () => {
    for (const text of ["null", "[]", "42", '"texte"']) {
      expect(() => parseImport(text)).toThrow(HistoryImportError);
    }
  });

  it("rejette une enveloppe sans schemaVersion", () => {
    const text = JSON.stringify({ exportedAt: "x", appVersion: "0.6.0", reports: [] });
    expect(() => parseImport(text)).toThrow(HistoryImportError);
  });

  it("rejette une version de schéma future avec un message dédié", () => {
    const text = JSON.stringify({ schemaVersion: 2, exportedAt: "x", appVersion: "9.0.0", reports: [] });
    expect(() => parseImport(text)).toThrow(/version plus récente/);
  });

  it("rejette un rapport dont le champ analysis est invalide", () => {
    const bad = report();
    // niveau hors enum
    (bad.analysis.pointsVigilance[0] as { niveau: string }).niveau = "urgent";
    const text = JSON.stringify(buildExport([bad], { appVersion: "0.6.0" }));
    expect(() => parseImport(text)).toThrow(HistoryImportError);
  });

  it("rejette un rapport privé des champs déréférencés par la page (location/photos/quick)", () => {
    for (const mutate of [
      (r: Report) => delete (r.listing as { location?: unknown }).location,
      (r: Report) => delete (r.listing as { photos?: unknown }).photos,
      (r: Report) => delete (r as { quick?: unknown }).quick,
    ]) {
      const bad = report();
      mutate(bad);
      const text = JSON.stringify({
        schemaVersion: 1,
        exportedAt: "x",
        appVersion: "0.6.0",
        reports: [bad],
      });
      expect(() => parseImport(text)).toThrow(HistoryImportError);
    }
  });
});
