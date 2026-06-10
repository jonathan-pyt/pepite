import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDvfCsv } from "./dvf";

const csv = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/dvf-sample.csv"),
  "utf8",
);

describe("parseDvfCsv", () => {
  const sales = parseDvfCsv(csv);

  it("garde la vente simple et la vente avec dépendance", () => {
    const ids = sales.map((s) => s.idMutation);
    expect(ids).toContain("2024-1");
    expect(ids).toContain("2024-2"); // la dépendance n'invalide pas la mutation
    expect(ids).toContain("2024-5"); // maison
  });

  it("exclut bloc, aberrant, adjudication, sans GPS", () => {
    const ids = sales.map((s) => s.idMutation);
    expect(ids).not.toContain("2024-3"); // 2 logements même mutation → prix non ventilable
    expect(ids).not.toContain("2024-4"); // 600 000 €/m² → borne dure
    expect(ids).not.toContain("2024-6"); // Adjudication
    expect(ids).not.toContain("2024-7"); // pas de coordonnées
  });

  it("calcule le prix au m²", () => {
    const s1 = sales.find((s) => s.idMutation === "2024-1")!;
    expect(s1.pricePerM2).toBeCloseTo(316000 / 71, 1);
    expect(s1.type).toBe("Appartement");
    expect(s1.rooms).toBe(4);
    expect(s1.date).toBe("2024-01-03");
  });
});
