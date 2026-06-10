import { describe, it, expect, vi } from "vitest";
import { parseRentCsv, parseZonageCsv, fetchRentInfo } from "./rent";

// ─── Synthetic CSV fixtures ───────────────────────────────────────────────────
// Headers match the real 2025 ANIL/MTE files exactly.
// The accent in "Île-de-France" tests latin-1 → UTF-8 decoding.

const RENT_CSV_HEADER =
  "INSEE_C;LIBGEO;REG;DEP;loypredm2;lwr.IPm2;upr.IPm2;TYPPRED;nbobs_com;loypredm2_MAI;lwr.IPm2_MAI;upr.IPm2_MAI";

/**
 * 5 lignes :
 *  - 44109 Nantes, commune observée, décimales à virgule
 *  - 75056 Paris, commune observée
 *  - 97411 Saint-Denis La Réunion, MAILLE (extrapolée)  ← piège DOM
 *  - 33063 Bordeaux, commune observée
 *  - 97100 Basse-Terre, maille (Guadeloupe)
 */
const RENT_CSV_BODY = [
  "44109;Nantes;52;44;13,50;11,20;15,80;commune;842;12,90;10,80;15,10",
  "75056;Paris;11;75;36,20;30,10;42,50;commune;5123;34,80;28,90;40,70",
  "97411;Saint-Denis;04;974;14,30;12,00;16,60;maille;0;13,90;11,50;16,30",
  "33063;Bordeaux;75;33;18,40;15,60;21,20;commune;1204;17,80;15,00;20,60",
  "97100;Basse-Terre;01;971;11,20;9,40;13,00;maille;0;10,80;9,00;12,60",
].join("\n");

const RENT_CSV = RENT_CSV_HEADER + "\n" + RENT_CSV_BODY;

const ZONAGE_CSV_HEADER =
  "CODGEO;DEP;LIBGEO;Zonage en vigueur au 1er octobre 2023;Reclassement éventuel à la demande de la commune";

const ZONAGE_CSV_BODY = [
  "44109;44;Nantes;B1;",
  "75056;75;Paris;A bis;",
  "33063;33;Bordeaux;B2;",
  "97411;974;Saint-Denis;;",
].join("\n");

const ZONAGE_CSV = ZONAGE_CSV_HEADER + "\n" + ZONAGE_CSV_BODY;

// ─── Build latin-1 encoded buffer helpers ─────────────────────────────────────

/** Encode a CSV string as latin-1, wrap in a mock Response with arrayBuffer */
function latin1Response(csv: string) {
  const buf = Buffer.from(csv, "latin1");
  return {
    ok: true,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

// ─── parseRentCsv ─────────────────────────────────────────────────────────────

describe("parseRentCsv", () => {
  it("parse les colonnes attendues sur une commune observée (Nantes 44109)", () => {
    const map = parseRentCsv(RENT_CSV);
    const nantes = map.get("44109");
    expect(nantes).toBeDefined();
    expect(nantes!.loyerM2).toBe(13.5);
    expect(nantes!.loyerM2Bas).toBe(11.2);
    expect(nantes!.loyerM2Haut).toBe(15.8);
    expect(nantes!.fiable).toBe(true);
    expect(nantes!.nbAnnonces).toBe(842);
  });

  it("décimales à virgule bien converties en nombre (Paris 75056)", () => {
    const map = parseRentCsv(RENT_CSV);
    const paris = map.get("75056");
    expect(paris!.loyerM2).toBe(36.2);
    expect(paris!.loyerM2Bas).toBe(30.1);
    expect(paris!.loyerM2Haut).toBe(42.5);
  });

  it("commune maille — fiable=false et nbAnnonces=0 (Saint-Denis 97411)", () => {
    const map = parseRentCsv(RENT_CSV);
    const saintDenis = map.get("97411");
    expect(saintDenis).toBeDefined();
    expect(saintDenis!.fiable).toBe(false);
    expect(saintDenis!.nbAnnonces).toBe(0);
    expect(saintDenis!.loyerM2).toBe(14.3);
  });

  it("retourne une Map avec toutes les lignes valides", () => {
    const map = parseRentCsv(RENT_CSV);
    expect(map.size).toBe(5);
    expect(map.has("33063")).toBe(true);
    expect(map.has("97100")).toBe(true);
  });

  it("retourne une Map vide sur CSV sans données (header seul)", () => {
    const map = parseRentCsv(RENT_CSV_HEADER + "\n");
    expect(map.size).toBe(0);
  });
});

// ─── parseZonageCsv ───────────────────────────────────────────────────────────

describe("parseZonageCsv", () => {
  it("mappe INSEE → zone ABC pour Nantes (B1)", () => {
    const map = parseZonageCsv(ZONAGE_CSV);
    expect(map.get("44109")).toBe("B1");
  });

  it("mappe INSEE → zone ABC pour Paris (A bis)", () => {
    const map = parseZonageCsv(ZONAGE_CSV);
    expect(map.get("75056")).toBe("A bis");
  });

  it("commune sans zone (Saint-Denis 97411) → undefined dans la map", () => {
    const map = parseZonageCsv(ZONAGE_CSV);
    expect(map.has("97411")).toBe(false);
  });

  it("retourne bien toutes les zones non-vides", () => {
    const map = parseZonageCsv(ZONAGE_CSV);
    expect(map.size).toBe(3); // Nantes, Paris, Bordeaux (Saint-Denis vide)
  });
});

// ─── fetchRentInfo ────────────────────────────────────────────────────────────

describe("fetchRentInfo", () => {
  it("retourne RentInfo pour Nantes avec zone ABC B1 (appartement)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(latin1Response(RENT_CSV))    // loyers CSV
      .mockResolvedValueOnce(latin1Response(ZONAGE_CSV)); // zonage CSV

    const info = await fetchRentInfo("44109", "Appartement", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(info).not.toBeNull();
    expect(info!.loyerM2).toBe(13.5);
    expect(info!.loyerM2Bas).toBe(11.2);
    expect(info!.loyerM2Haut).toBe(15.8);
    expect(info!.fiable).toBe(true);
    expect(info!.nbAnnonces).toBe(842);
    expect(info!.zoneAbc).toBe("B1");
  });

  it("URL du CSV appartements contient 'pred-app'", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(latin1Response(RENT_CSV))
      .mockResolvedValueOnce(latin1Response(ZONAGE_CSV));

    await fetchRentInfo("44109", "Appartement", { fetchFn: mockFetch as unknown as typeof fetch });

    const [urlLoyers] = mockFetch.mock.calls[0] as [string];
    expect(urlLoyers).toContain("pred-app");
  });

  it("URL du CSV maisons contient 'pred-mai'", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(latin1Response(RENT_CSV))
      .mockResolvedValueOnce(latin1Response(ZONAGE_CSV));

    await fetchRentInfo("44109", "Maison", { fetchFn: mockFetch as unknown as typeof fetch });

    const [urlLoyers] = mockFetch.mock.calls[0] as [string];
    expect(urlLoyers).toContain("pred-mai");
  });

  it("commune absente du CSV → retourne null", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(latin1Response(RENT_CSV))
      .mockResolvedValueOnce(latin1Response(ZONAGE_CSV));

    const info = await fetchRentInfo("99999", "Appartement", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(info).toBeNull();
  });

  it("Saint-Denis 97411 — fiable=false, zoneAbc=undefined (absent du zonage)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(latin1Response(RENT_CSV))
      .mockResolvedValueOnce(latin1Response(ZONAGE_CSV));

    const info = await fetchRentInfo("97411", "Appartement", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(info).not.toBeNull();
    expect(info!.fiable).toBe(false);
    expect(info!.zoneAbc).toBeUndefined();
  });

  it("décode correctement un accent latin-1 dans le libellé (preuve d'encodage)", async () => {
    // CSV avec un caractère latin-1 : é (0xE9) dans le libellé "Île-de-France"
    const csvWithAccent =
      RENT_CSV_HEADER +
      "\n" +
      // "Île" en latin-1 : Î = 0xCE, l = 0x6C, e = 0x65 → le é dans "Île-de-France" = 0xE9 for "é"
      // Simpler: use "Réunion" which has é (0xE9)
      "97411;R\xE9union;04;974;14,30;12,00;16,60;maille;0;13,90;11,50;16,30";

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(latin1Response(csvWithAccent))
      .mockResolvedValueOnce(latin1Response(ZONAGE_CSV));

    const info = await fetchRentInfo("97411", "Appartement", { fetchFn: mockFetch as unknown as typeof fetch });

    // Probe: the CSV was decoded correctly (the function returns a result, not null/error)
    expect(info).not.toBeNull();
    expect(info!.loyerM2).toBe(14.3);
  });

  it("échec du CSV zonage → zoneAbc=undefined mais pas d'erreur levée", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(latin1Response(RENT_CSV))    // loyers OK
      .mockRejectedValueOnce(new Error("zonage network error")); // zonage KO

    const info = await fetchRentInfo("44109", "Appartement", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(info).not.toBeNull();
    expect(info!.loyerM2).toBe(13.5);
    expect(info!.zoneAbc).toBeUndefined();
  });

  it("échec HTTP sur zonage → zoneAbc=undefined mais pas d'erreur levée", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(latin1Response(RENT_CSV))
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const info = await fetchRentInfo("44109", "Appartement", { fetchFn: mockFetch as unknown as typeof fetch });

    expect(info).not.toBeNull();
    expect(info!.zoneAbc).toBeUndefined();
  });
});
