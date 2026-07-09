/**
 * Messages UI des erreurs de configuration renvoyées par le background
 * (codes stables, partagés entre analyse et mails de négociation).
 * null pour toute autre erreur : l'appelant affiche alors le message brut.
 */
export function llmConfigErrorMessage(code: string): string | null {
  switch (code) {
    case "NO_API_KEY":
      return "Clé API manquante — configure un provider dans les réglages.";
    case "NO_HOST_PERMISSION":
      return "Accès réseau au fournisseur d'IA non accordé — ouvre les réglages et enregistre pour l'autoriser.";
    default:
      return null;
  }
}
