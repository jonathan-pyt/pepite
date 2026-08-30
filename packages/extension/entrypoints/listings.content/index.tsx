import "@/assets/tailwind.css";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import {
  detectSite,
  fetchBienici,
  isListingPage,
  parseCitya,
  parseLeboncoin,
  parseLeboncoinHtml,
  parseSeloger,
  type Listing,
  type QuickAnalysis,
  type Site,
} from "@pepite/core";
import { Loader2, KeyRound, RotateCw } from "lucide-react";
import { PepiteMark, ScoreRing } from "@/components/pepite";
import { formatPctFr } from "@/lib/format";
import { sendRequest, type PepiteContentRequest } from "@/lib/messages";
import { LISTING_MATCHES } from "@/lib/host-permissions";
import { waitForContent } from "@/lib/wait-for-content";

/* ---------- helpers ---------- */

function scoreLabelText(score: number): string {
  if (score >= 80) return "Très bon";
  if (score >= 65) return "Bon";
  if (score >= 45) return "Moyen";
  return "Faible";
}

/** Sites dont l'annonce est lisible dans le DOM une fois la page hydratée. */
const DOM_PARSERS: Partial<Record<Site, (doc: Document, url: string) => Listing>> = {
  seloger: parseSeloger,
  citya: parseCitya,
};

/**
 * Sites dont l'annonce se lit sur une API JSON de même origine. Aucune
 * dépendance à l'hydratation du DOM (Bien'ici peut rester blanc > 20 s) et
 * aucun appel LLM : c'est la voie privilégiée quand elle existe.
 */
const API_EXTRACTORS: Partial<Record<Site, (url: string) => Promise<Listing>>> = {
  bienici: (url) => fetchBienici(url),
};

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

/**
 * États non-résultat du badge. « extract-failed » ne couvre plus que le cas où
 * une extraction a bien tourné sans trouver d'annonce : une page qui n'a jamais
 * fini de charger dit maintenant autre chose (page-slow / page-blank), pour ne
 * pas faire passer un problème de chargement pour un problème d'annonce.
 */
type BadgeState =
  | QuickAnalysis
  | null
  | "loading"
  | "page-slow"
  | "page-blank"
  | "error"
  | "needs-key"
  | "extract-failed";

// Vrai <button> (focusable, activable au clavier) — text-left neutralise le
// text-align:center par défaut des boutons, le reste écrase le style natif.
const CARD_CLASS =
  "fixed right-4 top-24 z-[2147483000] inline-flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 py-2.5 text-left text-ink shadow-pepite-lg select-none";

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

        // Voie API de même origine (Bien'ici) : immédiate, sans attendre le DOM.
        const viaApi = site ? API_EXTRACTORS[site] : undefined;
        if (viaApi) {
          try {
            const listing = await viaApi(url);
            if (cancelled) return;
            setParsedListing(listing);
            const q = await sendRequest<QuickAnalysis | null>({
              type: "LISTING_DETECTED",
              listing,
            });
            if (cancelled) return;
            setQuick(q ?? null);
            return;
          } catch {
            // Annonce retirée, réponse inattendue, réseau : on retombe sur le DOM.
          }
        }

        // Attendre que le SPA soit hydraté avant de tenter le parseur ou l'extraction générique.
        const ready = await waitForContent({
          readLength: () => document.body?.innerText?.length ?? 0,
          cancelled: () => cancelledRef.current,
          onSlow: () => {
            if (!cancelled) setQuick("page-slow");
          },
        });
        if (cancelled) return;
        if (!ready) {
          // La page n'a jamais rendu de contenu : problème de chargement, pas
          // d'annonce introuvable — on le dit tel quel.
          setQuick("page-blank");
          return;
        }
        setQuick("loading");

        // Sites à parseur dédié : on tente le DOM live, fallback extraction générique.
        const parser = site ? DOM_PARSERS[site] : undefined;
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
        try {
          const pageText = collectPageText();
          const resp = await sendRequest<QuickAnalysis | { error: string } | null>({
            type: "EXTRACT_GENERIC",
            url,
            pageText,
          });
          if (cancelled) return;
          if (resp && typeof resp === "object" && "error" in resp) {
            setQuick(
              resp.error === "NO_API_KEY" || resp.error === "NO_HOST_PERMISSION"
                ? "needs-key"
                : "extract-failed",
            );
            return;
          }
          // null = pipeline en échec ou résultat périmé côté background →
          // pas de résultat présentable, badge neutre.
          setQuick((resp as QuickAnalysis | null) ?? "extract-failed");
        } catch {
          // Messaging indisponible (service worker mort…) : même issue côté
          // utilisateur, l'extraction générique a échoué.
          if (!cancelled) setQuick("extract-failed");
        }
      } catch {
        if (!cancelled) setQuick("error");
      }
    }

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
        // Reset au moment où le nonce est incrémenté (batché en un seul rendu),
        // plutôt que de synchroniser quick sur nonce dans l'effet de détection.
        setNonce((n) => n + 1);
        setQuick("loading");
      }
      // Localisation corrigée depuis le side panel : le background pousse le
      // quick recalculé (le badge ne reçoit pas les broadcasts TAB_STATE_CHANGED).
      if (m?.type === "QUICK_UPDATED") {
        setQuick(m.quick);
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
      <button
        type="button"
        className={CARD_CLASS}
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
      </button>
    );
  }

  /* Page lente à s'hydrater (SPA) : on attend toujours, on ne conclut rien. */
  if (quick === "page-slow") {
    return (
      <button
        type="button"
        className={CARD_CLASS}
        title="Ouvrir le panneau Pépite"
        onClick={() => void sendRequest({ type: "OPEN_SIDE_PANEL" }).catch(() => {})}
      >
        <PepiteMark className="size-[24px]" />
        <div>
          <div className="flex items-center gap-[7px]">
            <Loader2 className="size-[13px] shrink-0 animate-spin text-accent" />
            <span className="text-[12.5px] font-semibold text-ink">La page charge encore…</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-ink-3">
            analyse dès que l'annonce s'affiche
          </div>
        </div>
      </button>
    );
  }

  /* La page n'a jamais rendu de contenu : problème de chargement, réessayable. */
  if (quick === "page-blank") {
    return (
      <button
        type="button"
        className={CARD_CLASS}
        title="Relancer la détection Pépite"
        onClick={() => {
          setNonce((n) => n + 1);
          setQuick("loading");
        }}
      >
        <PepiteMark className="size-[24px]" />
        <div>
          <div className="flex items-center gap-[7px]">
            <RotateCw className="size-[13px] shrink-0 text-accent" />
            <span className="text-[12.5px] font-semibold text-ink">Page non chargée</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-ink-3">cliquer pour réessayer</div>
        </div>
      </button>
    );
  }

  /* Extraction menée à son terme, sans annonce exploitable trouvée. */
  if (quick === "extract-failed") {
    return (
      <button
        type="button"
        className={CARD_CLASS}
        title="Ouvrir le panneau Pépite"
        onClick={() => void sendRequest({ type: "OPEN_SIDE_PANEL" }).catch(() => {})}
      >
        <PepiteMark className="size-[24px]" />
        <span className="text-[12px] font-medium text-ink-3">
          Aucune annonce identifiable sur cette page
        </span>
      </button>
    );
  }

  /* Loading state */
  if (quick === "loading") {
    return (
      <button
        type="button"
        className={CARD_CLASS}
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
      </button>
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
    <button
      type="button"
      className={CARD_CLASS}
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
                  ? `${formatPctFr(gapPct)} % vs marché`
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
    </button>
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
