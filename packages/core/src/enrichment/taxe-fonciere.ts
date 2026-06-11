import type { TaxeFonciereInfo } from "../types";

const API_BASE =
  "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers-geo/records";

export interface FetchTaxeFonciereOptions {
  fetchFn?: typeof fetch;
}

/**
 * Taux communal de taxe foncière sur le bâti (data.economie.gouv.fr, sans clé).
 * On prend le 1er résultat (exercice le plus récent, tri desc). Taux en %.
 * Retourne null quand la commune n'a aucun enregistrement — pas une erreur.
 */
export async function fetchTaxeFonciere(
  citycode: string,
  opts: FetchTaxeFonciereOptions = {},
): Promise<TaxeFonciereInfo | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const where = encodeURIComponent(`insee_com="${citycode}"`);
  const orderBy = encodeURIComponent("exercice desc");
  const url = `${API_BASE}?select=exercice,taux_global_tfb,taux_plein_teom&where=${where}&order_by=${orderBy}&limit=1`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`taxe foncière data.economie.gouv.fr: HTTP ${res.status}`);
  const json = (await res.json()) as {
    results?: { exercice?: string; taux_global_tfb?: number; taux_plein_teom?: number | null }[];
  };
  const first = json.results?.[0];
  if (!first || !first.exercice || typeof first.taux_global_tfb !== "number") return null;
  return {
    exercice: first.exercice,
    tauxGlobalTfb: first.taux_global_tfb,
    tauxTeom: typeof first.taux_plein_teom === "number" ? first.taux_plein_teom : null,
  };
}
