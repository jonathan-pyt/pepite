import type { RentInfo, PropertyType } from "../types";

const CSV_LOYERS_APP =
  "https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-145010/pred-app-mef-dhup.csv";

const CSV_LOYERS_MAI =
  "https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-145010/pred-mai-mef-dhup.csv";

const CSV_ZONAGE =
  "https://www.data.gouv.fr/api/1/datasets/r/13f7282b-8a25-43ab-9713-8bb4e476df55";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toFloat(s: string): number {
  return parseFloat(s.replace(",", "."));
}

async function decodeLatin1(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

/** Retire les guillemets doubles ENGLOBANTS d'une cellule (le CSV loyers réel
 *  guillemette toutes les cellules texte ; le zonage non — strip inoffensif). */
function unquote(cell: string): string {
  return cell.trim().replace(/^"(.*)"$/, "$1");
}

function splitCsv(csv: string): string[][] {
  return csv
    .split(/\r?\n/)
    .map((line) => line.split(";").map(unquote));
}

function findIndex(headers: string[], matcher: (h: string) => boolean): number {
  const idx = headers.findIndex(matcher);
  if (idx === -1) throw new Error(`rent: colonne introuvable parmi [${headers.join(", ")}]`);
  return idx;
}

// ─── parseRentCsv ─────────────────────────────────────────────────────────────

export function parseRentCsv(csv: string): Map<string, Omit<RentInfo, "zoneAbc">> {
  const lines = splitCsv(csv);
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return new Map();

  const h = headerLine;
  const iInsee = findIndex(h, (c) => c === "INSEE_C");
  const iLoyer = findIndex(h, (c) => c === "loypredm2");
  const iLwr = findIndex(h, (c) => c === "lwr.IPm2");
  const iUpr = findIndex(h, (c) => c === "upr.IPm2");
  const iTyp = findIndex(h, (c) => c === "TYPPRED");
  const iNb = findIndex(h, (c) => c === "nbobs_com");

  const result = new Map<string, Omit<RentInfo, "zoneAbc">>();

  for (const cols of dataLines) {
    if (cols.length < 2) continue;
    const insee = cols[iInsee]?.trim();
    if (!insee) continue;
    const loyerM2 = toFloat(cols[iLoyer] ?? "");
    const loyerM2Bas = toFloat(cols[iLwr] ?? "");
    const loyerM2Haut = toFloat(cols[iUpr] ?? "");
    const typpred = (cols[iTyp] ?? "").trim();
    const nbAnnonces = parseInt(cols[iNb] ?? "0", 10);
    if (isNaN(loyerM2)) continue;

    result.set(insee, {
      loyerM2,
      loyerM2Bas,
      loyerM2Haut,
      fiable: typpred === "commune",
      nbAnnonces: isNaN(nbAnnonces) ? 0 : nbAnnonces,
    });
  }

  return result;
}

// ─── parseZonageCsv ───────────────────────────────────────────────────────────

export function parseZonageCsv(csv: string): Map<string, string> {
  const lines = splitCsv(csv);
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return new Map();

  const h = headerLine;
  const iCodgeo = findIndex(h, (c) => c === "CODGEO");
  // Match the zonage column by prefix "Zonage"
  const iZonage = findIndex(h, (c) => c.startsWith("Zonage"));

  const result = new Map<string, string>();

  for (const cols of dataLines) {
    if (cols.length < 2) continue;
    const insee = cols[iCodgeo]?.trim();
    if (!insee) continue;
    const zone = cols[iZonage]?.trim();
    if (zone) result.set(insee, zone);
  }

  return result;
}

// ─── fetchRentInfo ────────────────────────────────────────────────────────────

export interface FetchRentInfoOptions {
  fetchFn?: typeof fetch;
}

export async function fetchRentInfo(
  citycode: string,
  type: PropertyType,
  opts: FetchRentInfoOptions = {},
): Promise<RentInfo | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const loyersUrl = type === "Appartement" ? CSV_LOYERS_APP : CSV_LOYERS_MAI;

  // Fetch loyers CSV (mandatory)
  const loyersRes = await fetchFn(loyersUrl);
  if (!loyersRes.ok) throw new Error(`loyers CSV: HTTP ${loyersRes.status}`);
  const loyersCsv = await decodeLatin1(loyersRes);
  const loyersMap = parseRentCsv(loyersCsv);

  const entry = loyersMap.get(citycode);
  if (!entry) return null;

  // Fetch zonage CSV (optional — failure → zoneAbc undefined)
  let zoneAbc: string | undefined;
  try {
    const zonageRes = await fetchFn(CSV_ZONAGE);
    if (zonageRes.ok) {
      const zonageCsv = await decodeLatin1(zonageRes);
      const zonageMap = parseZonageCsv(zonageCsv);
      zoneAbc = zonageMap.get(citycode);
    }
  } catch {
    // zonage failure is non-fatal
  }

  return { ...entry, zoneAbc };
}
