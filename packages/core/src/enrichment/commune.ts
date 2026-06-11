import type { CommuneInfo } from "../types";

const API_BASE = "https://geo.api.gouv.fr/communes";

export interface FetchCommuneInfoOptions {
  fetchFn?: typeof fetch;
}

/**
 * Population et densité de la commune via geo.api.gouv.fr (sans clé).
 * `surface` est renvoyée en HECTARES → densité hab/km² = population / (surface / 100).
 * Erreur réseau ou réponse invalide → throw (le pipeline gère via allSettled).
 */
export async function fetchCommuneInfo(
  citycode: string,
  opts: FetchCommuneInfoOptions = {},
): Promise<CommuneInfo> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${API_BASE}/${encodeURIComponent(citycode)}?fields=nom,population,surface`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`commune geo.api.gouv.fr: HTTP ${res.status}`);
  const json = (await res.json()) as {
    nom?: string;
    population?: number;
    surface?: number;
  };
  if (
    !json.nom ||
    typeof json.population !== "number" ||
    typeof json.surface !== "number" ||
    json.surface <= 0
  ) {
    throw new Error(`commune geo.api.gouv.fr: réponse incomplète pour ${citycode}`);
  }
  return {
    nom: json.nom,
    population: json.population,
    densityPerKm2: Math.round(json.population / (json.surface / 100)),
  };
}
