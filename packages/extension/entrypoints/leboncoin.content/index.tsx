import "./style.css";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { isLeboncoinListingPage, parseLeboncoin, parseLeboncoinHtml, type QuickAnalysis } from "@pepite/core";
import { sendRequest } from "@/lib/messages";

/* ---------- helpers ---------- */

function scoreColor(score: number): string {
  if (score >= 65) return "#16a34a";
  if (score >= 45) return "#d97706";
  return "#dc2626";
}

function scoreLabelText(score: number): string {
  if (score >= 80) return "Très bon";
  if (score >= 65) return "Bon";
  if (score >= 45) return "Moyen";
  return "Faible";
}

/* ---------- ScoreRing — self-contained inline SVG ---------- */

function ScoreRing({ score, size = 38, stroke = 4 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const col = scoreColor(score);
  const fontSize = Math.round(size * 0.34);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#ececef"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{
          fontSize: fontSize,
          fontWeight: 700,
          color: "#18181b",
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}>
          {score}
        </span>
      </div>
    </div>
  );
}

/* ---------- Mini Pépite wordmark ---------- */

function MiniWordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {/* Pépite logo icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#0d9488" />
        <path d="M12 6.2 17 11l-5 6.8L7 11z" fill="#ffffff" />
        <path d="M12 6.2 17 11h-10z" fill="#ccfbf1" />
      </svg>
      <span style={{
        fontSize: 11,
        fontWeight: 560,
        color: "#8e8e98",
        letterSpacing: "-0.01em",
      }}>
        Pépite
      </span>
    </div>
  );
}

/* ---------- Badge component ---------- */

type BadgeState = QuickAnalysis | null | "loading" | "error";

function Badge({ url, viaFetch }: { url: string; viaFetch: boolean }) {
  const [quick, setQuick] = useState<BadgeState>("loading");
  const [parsedListing, setParsedListing] = useState<import("@pepite/core").Listing | null>(null);

  if (!isLeboncoinListingPage(url)) return null;

  useEffect(() => {
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

  if (quick === "error") return null;

  /* Loading state */
  if (quick === "loading") {
    return (
      <div
        className="pep-card"
        role="button"
        title="Ouvrir l'analyse Pépite"
        style={{ cursor: "pointer" }}
        onClick={() => void sendRequest({ type: "OPEN_SIDE_PANEL" }).catch(() => {})}
      >
        <div className="pep-loading-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: "block" }}>
            <rect x="2" y="2" width="20" height="20" rx="6" fill="#0d9488" />
            <path d="M12 6.2 17 11l-5 6.8L7 11z" fill="#ffffff" />
            <path d="M12 6.2 17 11h-10z" fill="#ccfbf1" />
          </svg>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className="pep-spin" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#18181b" }}>Analyse en cours…</span>
          </div>
          <div style={{ fontSize: 10.5, color: "#8e8e98", marginTop: 2 }}>calcul en cours…</div>
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

  const hasNoPropertyType = parsedListing ? parsedListing.propertyType === undefined : false;
  const hasMarket = quick !== null && quick.market !== null;

  let marketSubLine: string | null = null;
  if (quick === null && hasNoPropertyType) {
    marketSubLine = "Type de bien non comparé (parking, terrain…)";
  } else if (quick === null || (!hasMarket && quick !== null)) {
    marketSubLine = "Marché inconnu (pas assez de ventes)";
  }

  const showPriceDetails = hasScore && listingPpm2 !== null && medianPpm2 !== null;
  const showUnusualGap = gapPct !== null && Math.abs(gapPct) > 60;

  return (
    <div
      className="pep-card"
      role="button"
      title="Ouvrir l'analyse Pépite"
      style={{ cursor: "pointer" }}
      onClick={() => void sendRequest({ type: "OPEN_SIDE_PANEL" }).catch(() => {})}
    >
      {/* Left: score ring or dash */}
      {hasScore && quick !== null && quick.score !== null ? (
        <ScoreRing score={quick.score} size={38} stroke={4} />
      ) : (
        <div className="pep-noscore">—</div>
      )}

      {/* Right: wordmark + label + gap */}
      <div style={{ lineHeight: 1.25 }}>
        <MiniWordmark />
        <div style={{ marginTop: 4 }}>
          {hasScore && quick !== null ? (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#18181b" }}>
                {scoreLabelText(quick.score!)}
              </div>
              <div style={{
                fontSize: 11,
                color: "#8e8e98",
                fontVariantNumeric: "tabular-nums",
                marginTop: 1,
              }}>
                {gapPct !== null
                  ? `${gapPct > 0 ? "+" : ""}${gapPct.toFixed(1)} % vs marché`
                  : "marché inconnu"}
              </div>
              {showPriceDetails && (
                <div style={{
                  fontSize: 10.5,
                  color: "#8e8e98",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 1,
                }}>
                  {listingPpm2} €/m² · secteur {medianPpm2} €/m²
                </div>
              )}
              {showUnusualGap && (
                <div style={{ fontSize: 10.5, color: "#d97706", marginTop: 1 }}>
                  Écart inhabituel — vérifier surface/type
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#8e8e98", marginTop: 1 }}>
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
