import "./style.css";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { isLeboncoinListingPage, parseLeboncoin, type QuickAnalysis } from "@pepite/core";
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

function Badge() {
  const [quick, setQuick] = useState<QuickAnalysis | null | "loading" | "error">("loading");

  useEffect(() => {
    try {
      const listing = parseLeboncoin(document, location.href);
      sendRequest<QuickAnalysis | null>({ type: "LISTING_DETECTED", listing })
        .then((q) => setQuick(q ?? "error"))
        .catch(() => setQuick("error"));
    } catch {
      setQuick("error");
    }
  }, []);

  if (quick === "error") return null;

  /* Loading state */
  if (quick === "loading") {
    return (
      <div className="pep-card">
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

  return (
    <div className="pep-card">
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
                {quick.marketGapPct !== null
                  ? `${quick.marketGapPct > 0 ? "+" : ""}${quick.marketGapPct.toFixed(1)} % vs marché`
                  : "marché inconnu"}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#8e8e98", marginTop: 1 }}>marché inconnu</div>
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
    if (!isLeboncoinListingPage(location.href)) return;
    const ui = await createShadowRootUi(ctx, {
      name: "pepite-badge",
      position: "inline",
      anchor: "body",
      onMount: (container) => {
        const root = ReactDOM.createRoot(container);
        root.render(<Badge />);
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });
    ui.mount();
  },
});
