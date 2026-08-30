import { describe, expect, it, vi } from "vitest";
import { HARD_DEADLINE_MS, SLOW_DEADLINE_MS, waitForContent } from "./wait-for-content";

/** Marge d'un tour de boucle sous charge, pour les bornes hautes des tests. */
const POLL_BUDGET_MS = 1000;

/**
 * Horloge simulée : `sleep` avance le temps du délai demandé, majoré de
 * `drift` pour reproduire un thread principal saturé (boot d'une SPA lourde).
 */
function fakeClock(drift = 0) {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms + drift;
    },
    get elapsed() {
      return t;
    },
  };
}

/** Longueurs de texte lues tour à tour ; la dernière vaut ensuite pour toujours. */
function lengths(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe("waitForContent", () => {
  it("résout true dès que le texte dépasse le seuil et se stabilise", async () => {
    const clock = fakeClock();
    const ready = await waitForContent({ readLength: lengths(0, 800, 4000, 4000), ...clock });
    expect(ready).toBe(true);
    expect(clock.elapsed).toBeLessThan(SLOW_DEADLINE_MS);
  });

  it("attend la stabilisation : un texte qui grossit encore ne suffit pas", async () => {
    const clock = fakeClock();
    const ready = await waitForContent({
      readLength: lengths(2000, 3000, 4000, 5000, 5000),
      ...clock,
    });
    expect(ready).toBe(true);
    // 5 lectures avant la stabilisation, pas la première.
    expect(clock.elapsed).toBeGreaterThanOrEqual(4 * 500);
  });

  it("mesure la limite douce en horloge murale, pas en nombre de tours", async () => {
    // Régression : la boucle comptait 40 tours de 500 ms et supposait 20 s.
    // Sous charge (boot de SPA), un tour coûtait ~840 ms → limite réelle 33 s.
    const clock = fakeClock(400); // chaque tour coûte 900 ms au lieu de 500
    let slowAt: number | null = null;
    await waitForContent({
      readLength: () => 0,
      onSlow: () => {
        slowAt = clock.now();
      },
      ...clock,
    });
    expect(slowAt).not.toBeNull();
    // 40 tours × 900 ms feraient 36 s ; l'horloge murale tient les 20 s.
    expect(slowAt!).toBeGreaterThanOrEqual(SLOW_DEADLINE_MS);
    expect(slowAt!).toBeLessThan(SLOW_DEADLINE_MS + POLL_BUDGET_MS);
  });

  it("signale une seule fois que la page est lente, puis continue d'attendre", async () => {
    const onSlow = vi.fn();
    const clock = fakeClock();
    // Page vide pendant 24 s (cas Bien'ici réel), puis contenu stable.
    let t = 0;
    const readLength = () => {
      t += 500;
      return t < 24_000 ? 0 : 6738;
    };
    const ready = await waitForContent({ readLength, onSlow, ...clock });
    expect(onSlow).toHaveBeenCalledTimes(1);
    expect(ready).toBe(true);
  });

  it("accepte un contenu non stabilisé une fois la limite douce passée", async () => {
    const clock = fakeClock();
    // 900 caractères qui changent en permanence : jamais « stable ».
    let n = 900;
    const ready = await waitForContent({ readLength: () => n++, ...clock });
    expect(ready).toBe(true);
    expect(clock.now()).toBeGreaterThanOrEqual(SLOW_DEADLINE_MS);
  });

  it("abandonne à la limite dure quand la page ne rend jamais rien", async () => {
    const clock = fakeClock();
    const ready = await waitForContent({ readLength: () => 0, ...clock });
    expect(ready).toBe(false);
    expect(clock.now()).toBeGreaterThanOrEqual(HARD_DEADLINE_MS);
  });

  it("s'arrête immédiatement quand l'appelant annule", async () => {
    const clock = fakeClock();
    const ready = await waitForContent({
      readLength: () => 0,
      cancelled: () => true,
      ...clock,
    });
    expect(ready).toBe(false);
    expect(clock.now()).toBe(0);
  });
});
