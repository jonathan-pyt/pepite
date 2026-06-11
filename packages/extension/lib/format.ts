/**
 * Formate un pourcentage signé à la française : signe explicite + virgule
 * décimale, une décimale. Ex. 12.34 → "+12,3", -4.5 → "-4,5".
 */
export function formatPctFr(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}`;
}
