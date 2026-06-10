import "@/assets/tailwind.css";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import {
  detectSite,
  isListingPage,
  parseBienici,
  parseCitya,
  parseLeboncoin,
  parseLeboncoinHtml,
  parseSeloger,
  type Listing,
  type QuickAnalysis,
  type Site,
} from "@pepite/core";
import { Loader2, KeyRound } from "lucide-react";
import { PepiteMark, ScoreRing } from "@/components/pepite";
import { sendRequest, type PepiteContentRequest } from "@/lib/messages";

/** Domaines couverts par le content script (doivent rester alignés avec `matches`). */
export const LISTING_MATCHES = [
  "*://*.leboncoin.fr/*",
  "*://*.seloger.com/*",
  "*://*.bienici.com/*",
  "*://*.citya.com/*",
];

/* ---------- helpers ---------- */

function scoreLabelText(score: number): string {
  if (score >= 80) return "Très bon";
  if (score >= 65) return "Bon";
  if (score >= 45) return "Moyen";
  return "Faible";
}

const GENERIC_PARSERS: Partial<Record<Site, (doc: Document, url: string) => Listing>> = {
  seloger: parseSeloger,
  bienici: parseBienici,
  citya: parseCitya,
};

/**
 * Attend que le DOM SPA soit hydraté avec un contenu substantiel.
 * Poll toutes les 500 ms jusqu'à :
 *  - innerText > 1500 chars ET stable sur deux polls consécutifs → résout true
 *  - timeout 20 s ET texte < 600 chars → résout false (page vide / splash écran)
 * La promesse est annulée proprement si `cancelledRef.current` passe à true.
 */
function waitForContent(cancelledRef: { current: boolean }): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const POLL_MS = 500;
    const MAX_POLLS = 40; // 20 s
    const STABLE_THRESHOLD = 1500;
    const FALLBACK_THRESHOLD = 600;
    let polls = 0;
    let prevLen = -1;

    function check() {
      if (cancelledRef.current) return resolve(false);
      const len = document.body?.innerText?.length ?? 0;
      polls += 1;

      if (len > STABLE_THRESHOLD && len === prevLen) {
        return resolve(true);
      }

      prevLen = len;

      if (polls >= MAX_POLLS) {
        return resolve(len >= FALLBACK_THRESHOLD);
      }

      setTimeout(check, POLL_MS);
    }

    setTimeout(check, POLL_MS);
  });
}

/** Prépare le texte de page pour l'extracteur LLM (titre + meta description + texte principal). */
function collectPageText(): string {
  const title = document.title ?? "";
  const meta =
    document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
  const body = document.body?.innerText ?? "";
  const text = [title, meta, body].filter(Boolean).join("\n\n");
  return text.slice(0, 12_000);
}

/* ---------- Mini Pépite wordmark (variante sourdine) ---------- */

function MiniWordmark() {
  return (
    <div className="flex items-center gap-[5px]">
      <PepiteMark className="size-[14px]" />
      <span className="text-[11px] font-medium tracking-[-0.01em] text-ink-3">Pépite</span>
    </div>
  );
}

/* ---------- Badge component ---------- */

type BadgeState = QuickAnalysis | null | "loading" | "error" | "needs-key";

const CARD_CLASS =
  "fixed right-4 top-24 z-[2147483000] inline-flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 py-2.5 text-ink shadow-pepite-lg select-none";

function Badge({ url, viaFetch }: { url: string; viaFetch: boolean }) {
  const [quick, setQuick] = useState<BadgeState>("loading");
  const [parsedListing, setParsedListing] = useState<Listing | null>(null);
  const [nonce, setNonce] = useState(0);

  const site = detectSite(url);
  const onListing = isListingPage(url);

  useEffect(() => {
    if (!onListing) return;
    let cancelled = false;
    // Pour Leboncoin, une navigation SPA ne ré-hydrate pas toujours le DOM :
    // on refait un fetch HTML frais. Pour les autres sites, on relit le DOM live.
    const forceViaFetch = site === "leboncoin" && (viaFetch || nonce > 0);

    // cancelledRef permet à waitForContent de détecter l'annulation.
    const cancelledRef = { current: false };

    async function run() {
      try {
        if (site === "leboncoin") {
          let listing: Listing;
          if (!forceViaFetch) {
            listing = parseLeboncoin(document, url);
          } else {
            const resp = await fetch(url, { credentials: "include" });
            const html = await resp.text();
            listing = parseLeboncoinHtml(html, url);
          }
          if (cancelled) return;
          setParsedListing(listing);
          const q = await sendRequest<QuickAnalysis | null>({ type: "LISTING_DETECTED", listing });
          if (cancelled) return;
          setQuick(q ?? null);
          return;
        }

        // Attendre que le SPA soit hydraté avant de tenter le parseur ou l'extraction générique.
        const ready = await waitForContent(cancelledRef);
        if (cancelled) return;
        if (!ready) {
          // Page trop vide après 20 s (splash écran, contenu bloqué) → badge masqué.
          setQuick(null);
          return;
        }

        // Sites à parseur dédié : on tente le DOM live, fallback extraction générique.
        const parser = site ? GENERIC_PARSERS[site] : undefined;
        let listing: Listing | null = null;
        if (parser) {
          try {
            listing = parser(document, url);
          } catch {
            listing = null; // structure inconnue → fallback générique
          }
        }

        if (listing) {
          if (cancelled) return;
          setParsedListing(listing);
          const q = await sendRequest<QuickAnalysis | null>({ type: "LISTING_DETECTED", listing });
          if (cancelled) return;
          setQuick(q ?? null);
          return;
        }

        // Fallback : extraction générique LLM côté background (nécessite une clé API).
        const pageText = collectPageText();
        const resp = await sendRequest<QuickAnalysis | { error: string } | null>({
          type: "EXTRACT_GENERIC",
          url,
          pageText,
        });
        if (cancelled) return;
        if (resp && typeof resp === "object" && "error" in resp) {
          setQuick(resp.error === "NO_API_KEY" ? "needs-key" : "error");
          return;
        }
        setQuick((resp as QuickAnalysis | null) ?? null);
      } catch {
        if (!cancelled) setQuick("error");
      }
    }

    if (nonce > 0) setQuick("loading");
    void run();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [url, viaFetch, nonce, site, onListing]);

  // Register REDETECT message listener
  useEffect(() => {
    const listener = (msg: unknown) => {
      const m = msg as PepiteContentRequest;
      if (m?.type === "REDETECT") {
        setNonce((n) => n + 1);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  if (!onListing) return null;

  if (quick === "error") return null;

  /* Needs API key state (site sans parseur dédié, extraction générique payante) */
  if (quick === "needs-key") {
    return (
      <div
        className={CARD_CLASS}
        role="button"
        title="Ouvrir les réglages Pépite"
        onClick={() => void sendRequest({ type: "OPEN_SIDE_PANEL" }).catch(() => {})}
      >
        <PepiteMark className="size-[24px]" />
        <div>
          <div className="flex items-center gap-[7px]">
            <KeyRound className="size-[13px] shrink-0 text-accent" />
            <span className="text-[12.5px] font-semibold text-ink">Clé API requise</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-ink-3">
            Clé API requise pour analyser ce site
          </div>
        </div>
      </div>
    );
  }

  /* Loading state */
  if (quick === "loading") {
    return (
      <div
        className={CARD_CLASS}
        role="button"
        title="Ouvrir l'analyse Pépite"
        onClick={() => void sendRequest({ type: "OPEN_SIDE_PANEL" }).catch(() => {})}
      >
        <PepiteMark className="size-[24px]" />
        <div>
          <div className="flex items-center gap-[7px]">
            <Loader2 className="size-[13px] shrink-0 animate-spin text-accent" />
            <span className="text-[12.5px] font-semibold text-ink">Analyse en cours…</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-ink-3">calcul en cours…</div>
        </div>
      </div>
    );
  }

  /* Result state */
  const hasScore = quick !== null && quick.score !== null;

  const listingPpm2 = quick?.listingPricePerM2 ?? null;
  const medianPpm2 = quick?.market?.medianPricePerM2 ?? null;
  const gapPct = quick?.marketGapPct ?? null;

  const hasMarket = quick !== null && quick.market !== null;

  let marketSubLine: string | null = null;
  if (!hasMarket) {
    marketSubLine =
      parsedListing?.propertyType === undefined
        ? "Type de bien non comparé (parking, terrain…)"
        : "Marché inconnu (pas assez de ventes)";
  }

  const showPriceDetails = hasScore && listingPpm2 !== null && medianPpm2 !== null;
  const showUnusualGap = gapPct !== null && Math.abs(gapPct) > 60;

  return (
    <div
      className={CARD_CLASS}
      role="button"
      title="Ouvrir l'analyse Pépite"
      onClick={() => void sendRequest({ type: "OPEN_SIDE_PANEL" }).catch(() => {})}
    >
      {/* Left: score ring or dash */}
      {hasScore && quick !== null && quick.score !== null ? (
        <ScoreRing score={quick.score} size={38} stroke={4} />
      ) : (
        <div className="flex size-[38px] shrink-0 items-center justify-center text-[19px] font-bold text-ink-3">
          —
        </div>
      )}

      {/* Right: wordmark + label + gap */}
      <div className="leading-tight">
        <MiniWordmark />
        <div className="mt-1">
          {hasScore && quick !== null ? (
            <>
              <div className="text-[12.5px] font-semibold text-ink">
                {scoreLabelText(quick.score!)}
              </div>
              <div className="mt-px text-[11px] text-ink-3 tabular-nums">
                {gapPct !== null
                  ? `${gapPct > 0 ? "+" : ""}${gapPct.toFixed(1).replace(".", ",")} % vs marché`
                  : "marché inconnu"}
              </div>
              {showPriceDetails && (
                <div className="mt-px text-[10.5px] text-ink-3 tabular-nums">
                  {listingPpm2?.toLocaleString("fr-FR")} €/m² · secteur{" "}
                  {medianPpm2?.toLocaleString("fr-FR")} €/m²
                </div>
              )}
              {showUnusualGap && (
                <div className="mt-px text-[10.5px] text-warn">
                  Écart inhabituel — vérifier surface/type
                </div>
              )}
            </>
          ) : (
            <div className="mt-px text-[11px] text-ink-3">{marketSubLine ?? "marché inconnu"}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default defineContentScript({
  matches: LISTING_MATCHES,
  cssInjectionMode: "ui",
  async main(ctx) {
    let root: ReactDOM.Root | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: "pepite-badge",
      position: "inline",
      anchor: "body",
      onMount: (container) => {
        root = ReactDOM.createRoot(container);
        root.render(<Badge key={location.href} url={location.href} viaFetch={false} />);
        return root;
      },
      onRemove: (r) => r?.unmount(),
    });
    ui.mount();

    ctx.addEventListener(window, "wxt:locationchange", ({ newUrl }: { newUrl: string | URL }) => {
      if (root) {
        const url = String(newUrl);
        root.render(<Badge key={url} url={url} viaFetch={true} />);
      }
    });
  },
});
