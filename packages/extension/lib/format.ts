/**
 * Formate un pourcentage signé à la française : signe explicite + virgule
 * décimale, une décimale. Ex. 12.34 → "+12,3", -4.5 → "-4,5".
 */
export function formatPctFr(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}`;
}

/** Date ISO → format court français (JJ/MM/AAAA). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
