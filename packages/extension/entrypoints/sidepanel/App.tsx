import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { AnalysisResult, UsageProfile } from "@pepite/core";
import { sendRequest, type TabState } from "@/lib/messages";
import {
  PepiteLogo,
  ScoreRing,
  Seg,
  Metric,
  WarnItem,
} from "@/components/pepite";

// ─── Profile definitions ────────────────────────────────────────────────────

const PROFILES: { id: UsageProfile; label: string }[] = [
  { id: "residence", label: "Résidence" },
  { id: "locatif-nu", label: "Location nue" },
  { id: "airbnb", label: "Airbnb" },
  { id: "coloc", label: "Coloc" },
];

// ─── Tiny spinner ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      style={{
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
        display: "block",
      }}
    >
      <circle
        cx={7}
        cy={7}
        r={5.5}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={2}
      />
      <path
        d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </svg>
  );
}

// ─── Section title ───────────────────────────────────────────────────────────

function SecTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 9,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 650,
          color: "#8e8e98",
          textTransform: "uppercase",
          letterSpacing: ".06em",
        }}
      >
        {children}
      </span>
      {right}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [state, setState] = useState<TabState>({ status: "idle" });
  const [profile, setProfile] = useState<UsageProfile>("residence");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listingUrl = state.listing?.url;
  useEffect(() => {
    setAnalysis(null);
    setReportId(null);
    setError(null);
  }, [listingUrl]);

  useEffect(() => {
    let currentTabId: number | null = null;

    void sendRequest<{ tabId?: number; state: TabState }>({ type: "GET_TAB_STATE" }).then((r) => {
      if (r.tabId !== undefined) {
        currentTabId = r.tabId;
        setTabId(r.tabId);
      }
      setState(r.state);
    });

    const listener = (msg: { type?: string; tabId?: number; state?: TabState }) => {
      if (
        msg.type === "TAB_STATE_CHANGED" &&
        msg.state &&
        (currentTabId === null || msg.tabId === currentTabId)
      ) {
        setState(msg.state);
      }
    };
    browser.runtime.onMessage.addListener(listener);

    // Re-query tab state on tab switch
    const onActivated = () => {
      void sendRequest<{ tabId?: number; state: TabState }>({ type: "GET_TAB_STATE" }).then((r) => {
        if (r.tabId !== undefined) {
          currentTabId = r.tabId;
          setTabId(r.tabId);
        }
        setState(r.state);
      });
    };
    browser.tabs.onActivated.addListener(onActivated);

    // Clear API-key error when settings are saved
    // WXT stores "local:settings" under the raw key "settings" in chrome.storage.local
    // (resolveKey strips the area prefix before calling the driver)
    const onStorageChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && "settings" in changes) setError(null);
    };
    browser.storage.onChanged.addListener(onStorageChanged);

    return () => {
      browser.runtime.onMessage.removeListener(listener);
      browser.tabs.onActivated.removeListener(onActivated);
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  async function runFullAnalysis() {
    if (tabId === null) return;
    setError(null);
    const res = await sendRequest<{
      reportId?: string;
      analysis?: AnalysisResult;
      error?: string;
    }>({
      type: "RUN_FULL_ANALYSIS",
      tabId,
      profile,
    });
    if (res.error === "NO_API_KEY") {
      setError("Clé API manquante — configure un provider dans les réglages.");
    } else if (res.error) {
      setError(res.error);
    } else {
      setAnalysis(res.analysis ?? null);
      setReportId(res.reportId ?? null);
    }
  }

  // ── State: idle / no listing ─────────────────────────────────────────────

  if (state.status === "idle" || !state.listing) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 32px",
          textAlign: "center",
          gap: 12,
          minHeight: "100vh",
          background: "#ffffff",
        }}
      >
        <PepiteLogo size={36} withText={true} textSize={18} />
        <p
          style={{
            fontSize: 12.5,
            color: "#8e8e98",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Ouvre une annonce immobilière Leboncoin pour lancer l&apos;analyse.
        </p>
      </div>
    );
  }

  // ── Active listing ────────────────────────────────────────────────────────

  const { listing, quick } = state;

  const segLabels = PROFILES.map((p) => p.label);
  const activeLabel = PROFILES.find((p) => p.id === profile)?.label ?? segLabels[0];

  function handleSegChange(label: string) {
    const found = PROFILES.find((p) => p.label === label);
    if (found) setProfile(found.id);
  }

  // Market gap tone
  const gapTone =
    quick?.marketGapPct !== null && quick?.marketGapPct !== undefined
      ? quick.marketGapPct < 0
        ? ("good" as const)
        : ("warn" as const)
      : undefined;

  const gapValue =
    quick?.marketGapPct !== null && quick?.marketGapPct !== undefined
      ? `${quick.marketGapPct > 0 ? "+" : ""}${quick.marketGapPct.toFixed(1).replace(".", ",")} %`
      : "—";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: 0,
        fontSize: 13,
        background: "#ffffff",
        minHeight: "100vh",
      }}
    >
      {/* ── Top bar: logo ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid #ededf0",
          flexShrink: 0,
        }}
      >
        <PepiteLogo size={20} withText={true} textSize={14} />
      </div>

      {/* ── Header: listing title + score ring ───────────────────────────── */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #ededf0",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        {quick?.score !== null && quick?.score !== undefined ? (
          <ScoreRing score={quick.score} size={54} stroke={5} sub="/100" />
        ) : (
          <div
            style={{
              width: 54,
              height: 54,
              flexShrink: 0,
              borderRadius: "50%",
              border: "1px solid #ededf0",
              background: "#fafafa",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 600,
              color: "#8e8e98",
            }}
          >
            —
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#18181b",
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {listing.title}
          </div>
          <div style={{ fontSize: 11.5, color: "#8e8e98", marginTop: 2 }}>
            {listing.location.rawAddress}
          </div>
        </div>
      </div>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px 16px" }}>

        {/* ── Quick-running state ─────────────────────────────────────────── */}
        {state.status === "quick-running" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: "#52525b",
            }}
          >
            <Spinner />
            Analyse du marché en cours…
          </div>
        )}

        {/* ── Seg profils ─────────────────────────────────────────────────── */}
        {quick && (
          <Seg
            options={segLabels}
            value={activeLabel}
            onChange={handleSegChange}
            size="sm"
            grow
          />
        )}

        {/* ── Metrics grid ────────────────────────────────────────────────── */}
        {quick && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <Metric
              label="Prix"
              value={`${listing.price.toLocaleString("fr-FR")} €`}
            />
            <Metric
              label="Prix/m²"
              value={
                quick.listingPricePerM2
                  ? `${quick.listingPricePerM2.toLocaleString("fr-FR")} €`
                  : "—"
              }
            />
            <Metric
              label="Médiane secteur"
              value={
                quick.market
                  ? `${quick.market.medianPricePerM2.toLocaleString("fr-FR")} €/m²`
                  : "—"
              }
              sub={
                quick.market
                  ? `${quick.market.sampleSize} ventes · ${quick.market.radiusM} m`
                  : undefined
              }
            />
            <Metric
              label="Écart marché"
              value={gapValue}
              tone={gapTone}
              sub={
                quick.market
                  ? `vs ${quick.market.medianPricePerM2.toLocaleString("fr-FR")} €/m²`
                  : undefined
              }
            />
          </div>
        )}

        {/* ── Comparaison marché indisponible ─────────────────────────────── */}
        {quick && !quick.market && (
          <WarnItem
            tone="info"
            title="Comparaison marché indisponible"
            sub={
              listing.propertyType === undefined
                ? "Type de bien non mappé (parking, terrain, local…) — pas de données DVF comparables."
                : "Pas assez de ventes dans ce secteur pour calculer une médiane fiable."
            }
          />
        )}

        {/* ── Error block ─────────────────────────────────────────────────── */}
        {error && (
          <div
            style={{
              background: error.includes("Clé API") ? "#fffbeb" : "#fef2f2",
              border: `1px solid ${error.includes("Clé API") ? "#fde68a" : "#fecaca"}`,
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              color: error.includes("Clé API") ? "#b45309" : "#b91c1c",
              lineHeight: 1.55,
            }}
          >
            {error}{" "}
            {error.includes("Clé API") && (
              <button
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                  color: "inherit",
                  fontSize: "inherit",
                  fontFamily: "inherit",
                }}
                onClick={() => browser.runtime.openOptionsPage()}
              >
                Ouvrir les réglages
              </button>
            )}
          </div>
        )}

        {/* ── Analyse IA block ─────────────────────────────────────────────── */}
        {analysis && (
          <div
            style={{
              background: "#fafafa",
              border: "1px solid #ededf0",
              borderRadius: 8,
              padding: "11px 13px",
            }}
          >
            <SecTitle
              right={
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 560,
                    color: "#8e8e98",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  IA
                </span>
              }
            >
              Analyse IA
            </SecTitle>
            <p
              style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "#52525b",
                margin: 0,
                whiteSpace: "pre-line",
              }}
            >
              {analysis.synthese}
            </p>
          </div>
        )}

        {/* ── Points de vigilance ─────────────────────────────────────────── */}
        {analysis && analysis.pointsVigilance.length > 0 && (
          <div>
            <SecTitle>Points de vigilance</SecTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {analysis.pointsVigilance.map((p, i) => (
                <WarnItem
                  key={i}
                  tone={
                    p.niveau === "critique"
                      ? "bad"
                      : p.niveau === "attention"
                        ? "warn"
                        : "info"
                  }
                  title={p.titre}
                  sub={p.detail}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Action buttons ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {state.status !== "full-running" ? (
            <button
              onClick={runFullAnalysis}
              disabled={!quick}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 560,
                borderRadius: 7,
                cursor: quick ? "pointer" : "not-allowed",
                background: quick ? "#0d9488" : "#f4f4f5",
                color: quick ? "#ffffff" : "#8e8e98",
                border: quick ? "1px solid #0f766e" : "1px solid #e4e4e7",
                opacity: quick ? 1 : 0.7,
                width: "100%",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              Analyse complète (IA)
            </button>
          ) : (
            <button
              disabled
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 560,
                borderRadius: 7,
                cursor: "not-allowed",
                background: "#f4f4f5",
                color: "#8e8e98",
                border: "1px solid #e4e4e7",
                width: "100%",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              <Spinner />
              Analyse IA en cours…
            </button>
          )}

          {reportId && (
            <button
              onClick={() =>
                window.open(browser.runtime.getURL(`/rapport.html?id=${reportId}`))
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 560,
                borderRadius: 7,
                cursor: "pointer",
                background: "#ffffff",
                color: "#18181b",
                border: "1px solid #e4e4e7",
                boxShadow: "0 1px 2px rgba(24,24,27,.04)",
                width: "100%",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              Voir le rapport complet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
