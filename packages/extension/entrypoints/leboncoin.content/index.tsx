import "@/assets/tailwind.css";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { isLeboncoinListingPage, parseLeboncoin, parseLeboncoinHtml, type QuickAnalysis } from "@pepite/core";
import { Loader2 } from "lucide-react";
import { PepiteMark, ScoreRing } from "@/components/pepite";
import { sendRequest } from "@/lib/messages";

/* ---------- helpers ---------- */

function scoreLabelText(score: number): string {
  if (score >= 80) return "Très bon";
  if (score >= 65) return "Bon";
  if (score >= 45) return "Moyen";
  return "Faible";
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

type BadgeState = QuickAnalysis | null | "loading" | "error";

const CARD_CLASS =
  "fixed right-4 top-24 z-[2147483000] inline-flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 py-2.5 text-ink shadow-pepite-lg select-none";

function Badge({ url, viaFetch }: { url: string; viaFetch: boolean }) {
  const [quick, setQuick] = useState<BadgeState>("loading");
  const [parsedListing, setParsedListing] = useState<import("@pepite/core").Listing | null>(null);

  useEffect(() => {
    if (!isLeboncoinListingPage(url)) return;
    let cancelled = false;

    async function run() {
      try {
        let listing: import("@pepite/core").Listing;
        if (!viaFetch) {
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
      } catch {
        if (!cancelled) setQuick("error");
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [url, viaFetch]);

  if (!isLeboncoinListingPage(url)) return null;

  if (quick === "error") return null;

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

  // Determine sub lines
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
                  {listingPpm2?.toLocaleString("fr-FR")} €/m² · secteur {medianPpm2?.toLocaleString("fr-FR")} €/m²
                </div>
              )}
              {showUnusualGap && (
                <div className="mt-px text-[10.5px] text-warn">
                  Écart inhabituel — vérifier surface/type
                </div>
              )}
            </>
          ) : (
            <div className="mt-px text-[11px] text-ink-3">
              {marketSubLine ?? "marché inconnu"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default defineContentScript({
  matches: ["*://*.leboncoin.fr/*"],
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
