import { describe, it, expect, vi } from "vitest";
import { fetchRisks } from "./risks";

// ─── Fixtures recorded from real API responses ───────────────────────────────

/**
 * Nantes 44109 — risquesNaturels: inondation(present), radon niveau 3(present), argiles(present)
 *               — risquesTechnologiques: ICPE(present)
 */
const NANTES_RESPONSE = {
  risquesNaturels: {
    inondation: { present: true, libelleStatutCommune: "Commune concernée par un risque d'inondation" },
    seisme: { present: false, libelleStatutCommune: "Commune non concernée par le risque de séisme" },
    mouvementsDeTerrain: { present: false, libelleStatutCommune: "Commune non concernée" },
    retraitGonflementArgiles: { present: true, libelleStatutCommune: "Exposition forte aux argiles" },
    radon: { present: true, libelleStatutCommune: "Potentiel radon de niveau 3 (fort)" },
    feuDeForet: { present: false, libelleStatutCommune: "Commune non concernée" },
    avalanche: { present: false, libelleStatutCommune: "Commune non concernée" },
    eruptionVolcanique: { present: false, libelleStatutCommune: "Commune non concernée" },
    cyclone: { present: false, libelleStatutCommune: "Commune non concernée" },
  },
  risquesTechnologiques: {
    icpe: { present: true, libelleStatutCommune: "Commune concernée par une ICPE" },
    pollutionDesSols: { present: false, libelleStatutCommune: "Aucun site pollué recensé" },
    canalisation: { present: false, libelleStatutCommune: "Commune non concernée" },
    nucleaire: { present: false, libelleStatutCommune: "Commune non concernée" },
    ruptureDeBarrage: { present: false, libelleStatutCommune: "Commune non concernée" },
  },
};

/**
 * Saint-Denis 97411 — cyclone(present), eruptionVolcanique(present), seisme(present)
 *                    — risquesTechnologiques: all false
 */
const SAINT_DENIS_RESPONSE = {
  risquesNaturels: {
    inondation: { present: false, libelleStatutCommune: "Commune non concernée" },
    seisme: { present: true, libelleStatutCommune: "Commune en zone sismique 3" },
    mouvementsDeTerrain: { present: false, libelleStatutCommune: "Commune non concernée" },
    retraitGonflementArgiles: { present: false, libelleStatutCommune: "Commune non concernée" },
    radon: { present: false, libelleStatutCommune: "Commune non concernée" },
    feuDeForet: { present: false, libelleStatutCommune: "Commune non concernée" },
    avalanche: { present: false, libelleStatutCommune: "Commune non concernée" },
    eruptionVolcanique: { present: true, libelleStatutCommune: "Commune exposée à l'éruption volcanique" },
    cyclone: { present: true, libelleStatutCommune: "Commune exposée aux cyclones tropicaux" },
  },
  risquesTechnologiques: {
    icpe: { present: false, libelleStatutCommune: "Commune non concernée" },
    pollutionDesSols: { present: false, libelleStatutCommune: "Aucun site pollué recensé" },
    canalisation: { present: false, libelleStatutCommune: "Commune non concernée" },
    nucleaire: { present: false, libelleStatutCommune: "Commune non concernée" },
    ruptureDeBarrage: { present: false, libelleStatutCommune: "Commune non concernée" },
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("fetchRisks", () => {
  it("appelle le bon endpoint avec le code INSEE de Nantes", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => NANTES_RESPONSE,
    });

    await fetchRisks("44109", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("georisques.gouv.fr");
    expect(url).toContain("code_insee=44109");
  });

  it("Nantes 44109 — retourne inondation, argiles, radon dans naturels", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => NANTES_RESPONSE,
    });

    const report = await fetchRisks("44109", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(report.naturels).toHaveLength(3);
    const libelles = report.naturels.map((r) => r.libelle);
    expect(libelles).toContain("Inondation");
    expect(libelles).toContain("Retrait-gonflement des argiles");
    expect(libelles).toContain("Radon");
  });

  it("Nantes 44109 — retourne ICPE dans technologiques", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => NANTES_RESPONSE,
    });

    const report = await fetchRisks("44109", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(report.technologiques).toHaveLength(1);
    expect(report.technologiques[0]!.libelle).toBe("ICPE");
  });

  it("Nantes 44109 — le statut est bien copié depuis libelleStatutCommune", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => NANTES_RESPONSE,
    });

    const report = await fetchRisks("44109", { fetchFn: mockFetch as unknown as typeof fetch });

    const radon = report.naturels.find((r) => r.libelle === "Radon");
    expect(radon?.statut).toBe("Potentiel radon de niveau 3 (fort)");
  });

  it("Nantes 44109 — risques absents (seisme, cyclone…) ne figurent pas dans le rapport", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => NANTES_RESPONSE,
    });

    const report = await fetchRisks("44109", { fetchFn: mockFetch as unknown as typeof fetch });

    const allLibelles = [...report.naturels, ...report.technologiques].map((r) => r.libelle);
    expect(allLibelles).not.toContain("Séisme");
    expect(allLibelles).not.toContain("Cyclone");
    expect(allLibelles).not.toContain("Éruption volcanique");
  });

  it("Saint-Denis 97411 — retourne cyclone, éruption volcanique, séisme dans naturels", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => SAINT_DENIS_RESPONSE,
    });

    const report = await fetchRisks("97411", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(report.naturels).toHaveLength(3);
    const libelles = report.naturels.map((r) => r.libelle);
    expect(libelles).toContain("Cyclone");
    expect(libelles).toContain("Éruption volcanique");
    expect(libelles).toContain("Séisme");
  });

  it("Saint-Denis 97411 — technologiques vides", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => SAINT_DENIS_RESPONSE,
    });

    const report = await fetchRisks("97411", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(report.technologiques).toHaveLength(0);
  });

  it("erreur HTTP → throw avec le status", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    await expect(
      fetchRisks("44109", { fetchFn: mockFetch as unknown as typeof fetch }),
    ).rejects.toThrow("risques Géorisques: HTTP 503");
  });

  it("clé inconnue avec present:true → incluse avec un libellé humanisé", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        risquesNaturels: {
          risqueMysterieuXY: { present: true, libelleStatutCommune: "Statut mystère" },
        },
        risquesTechnologiques: {},
      }),
    });

    const report = await fetchRisks("00000", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(report.naturels).toHaveLength(1);
    // Key humanized from camelCase: "risque Mysterieu XY" or similar — just check it exists and isn't empty
    expect(report.naturels[0]!.libelle.length).toBeGreaterThan(0);
    expect(report.naturels[0]!.statut).toBe("Statut mystère");
  });
});
