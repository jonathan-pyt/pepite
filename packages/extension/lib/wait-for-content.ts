/**
 * Attente de l'hydratation d'une page SPA avant extraction.
 *
 * Les budgets sont mesurés en HORLOGE MURALE : pendant le boot d'une SPA
 * lourde, le thread principal est saturé et un `setTimeout(500)` peut mettre
 * près d'une seconde — compter les tours faisait dériver une limite « 20 s »
 * jusqu'à 33 s (mesuré sur Bien'ici).
 */

const POLL_MS = 500;
/** Texte stabilisé au-dessus de ce seuil : la page est prête. */
const STABLE_THRESHOLD = 1500;
/** Au-delà de la limite douce, ce volume suffit même sans stabilisation. */
const FALLBACK_THRESHOLD = 600;

/** Limite douce : on prévient l'appelant que la page traîne, sans abandonner. */
export const SLOW_DEADLINE_MS = 20_000;
/** Limite dure : la page ne rendra rien d'exploitable (splash bloqué, 404 SPA). */
export const HARD_DEADLINE_MS = 90_000;

export interface WaitForContentOptions {
  /** Longueur du texte rendu (typiquement `document.body.innerText.length`). */
  readLength: () => number;
  /** Horloge injectable pour les tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Annulation coopérative (navigation SPA, démontage du badge). */
  cancelled?: () => boolean;
  /** Appelé une seule fois si la page est encore vide à la limite douce. */
  onSlow?: () => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Résout `true` dès que la page porte un contenu exploitable, `false` si elle
 * n'en porte toujours pas à la limite dure. Contrairement à la version
 * précédente, l'attente ne s'arrête PAS à la limite douce : un contenu qui
 * arrive à 24 s est encore pris en compte.
 */
export async function waitForContent(opts: WaitForContentOptions): Promise<boolean> {
  const {
    readLength,
    now = () => Date.now(),
    sleep = defaultSleep,
    cancelled = () => false,
    onSlow,
  } = opts;

  const start = now();
  let previousLength = -1;
  let slowSignalled = false;

  for (;;) {
    if (cancelled()) return false;

    const length = readLength();
    const elapsed = now() - start;

    if (length > STABLE_THRESHOLD && length === previousLength) return true;
    previousLength = length;

    if (elapsed >= SLOW_DEADLINE_MS) {
      if (length >= FALLBACK_THRESHOLD) return true;
      if (!slowSignalled) {
        slowSignalled = true;
        onSlow?.();
      }
    }

    if (elapsed >= HARD_DEADLINE_MS) return false;

    await sleep(POLL_MS);
  }
}
