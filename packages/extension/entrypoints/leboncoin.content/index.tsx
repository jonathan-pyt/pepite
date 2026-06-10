import "./style.css";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { isLeboncoinListingPage, parseLeboncoin, type QuickAnalysis } from "@pepite/core";
import { sendRequest } from "@/lib/messages";

function scoreClass(score: number): string {
  if (score >= 65) return "pepite-badge__score--good";
  if (score >= 45) return "pepite-badge__score--warn";
  return "pepite-badge__score--bad";
}

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
  if (quick === "loading" || quick === null) {
    return (
      <div className="pepite-badge">
        <span>Pépite</span>
        <span className="pepite-badge__sub">analyse…</span>
      </div>
    );
  }
  return (
    <div className="pepite-badge">
      {quick.score !== null ? (
        <span className={`pepite-badge__score ${scoreClass(quick.score)}`}>{quick.score}</span>
      ) : (
        <span className="pepite-badge__score">—</span>
      )}
      <div>
        <div>{quick.scoreLabel}</div>
        <div className="pepite-badge__sub">
          {quick.marketGapPct !== null
            ? `${quick.marketGapPct > 0 ? "+" : ""}${quick.marketGapPct.toFixed(1)} % vs marché`
            : "marché inconnu"}
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
