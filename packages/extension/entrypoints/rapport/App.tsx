import { useEffect, useState } from "react";
import type { Report } from "@pepite/core";
import { scoreLabel } from "@pepite/core";
import { idbRepository } from "@/lib/repository-idb";
import {
  ScoreRing,
  scoreColorClass,
  PepiteLogo,
  Metric,
  WarnItem,
  DPEChip,
} from "@/components/pepite";

const PROFILE_LABEL: Record<Report["profile"], string> = {
  residence: "Résidence principale",
  "locatif-nu": "Location nue",
  airbnb: "Airbnb",
  coloc: "Colocation",
};

const NIVEAU_TONE: Record<string, "bad" | "warn" | "info"> = {
  critique: "bad",
  attention: "warn",
  info: "info",
};

/** Format a raw ISO date string "YYYY-MM-DD" → "DD/MM/YYYY" for display */
function fmtDate(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : raw;
}

/* ---------- Section wrapper ---------- */
interface RSectionProps {
  id: string;
  num: number;
  title: string;
  children: React.ReactNode;
}

function RSection({ id, num, title, children }: RSectionProps) {
  return (
    <section
      id={id}
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: "22px 26px",
        boxShadow:
          "0 1px 2px rgba(24,24,27,.04), 0 4px 12px rgba(24,24,27,.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "#f4f4f5",
            border: "1px solid #ededf0",
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            fontWeight: 650,
            color: "#8e8e98",
            flexShrink: 0,
          }}
        >
          {num}
        </span>
        <h2
          style={{
            margin: 0,
            fontSize: 16.5,
            fontWeight: 680,
            color: "#18181b",
            letterSpacing: "-0.015em",
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/* ---------- Check icon ---------- */
function CheckIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      style={{ flexShrink: 0, display: "block", marginTop: 3 }}
    >
      <path
        d="M2.8 8.6 6.2 12 13.2 4.4"
        fill="none"
        stroke="#0d9488"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- Main TOC items for v0.1 ---------- */
const TOC_V01 = [
  ["synthese", "Synthèse IA"],
  ["prix", "Prix & marché"],
  ["vigilance", "Points de vigilance"],
  ["nego", "Négociation"],
] as const;

export default function App() {
  const [report, setReport] = useState<Report | null | "loading">("loading");

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return setReport(null);
    void idbRepository.getReport(id).then((r) => setReport(r ?? null));
  }, []);

  if (report === "loading") return null;
  if (!report)
    return (
      <p
        style={{
          padding: 32,
          color: "#8e8e98",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, sans-serif',
        }}
      >
        Rapport introuvable.
      </p>
    );

  const { listing, quick, analysis } = report;

  const generatedAt = new Date(report.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, sans-serif',
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          height: 52,
          background: "#fff",
          borderBottom: "1px solid #e4e4e7",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 28px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <PepiteLogo size={21} withText textSize={14.5} />
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#8e8e98" }}>
          Rapport généré le {generatedAt}
        </div>
      </div>

      {/* ── Content column ── */}
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "24px 20px 48px",
        }}
      >
        {/* Grid: sticky sommaire (lg) + main content */}
        <div className="grid items-start gap-6 lg:grid-cols-[180px_1fr]">
          {/* ── Sommaire (sticky, left rail) ── */}
          <nav
            aria-label="Sommaire"
            className="hidden lg:flex"
            style={{
              position: "sticky",
              top: 76,
              flexDirection: "column",
              gap: 1,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 650,
                color: "#8e8e98",
                textTransform: "uppercase",
                letterSpacing: ".07em",
                padding: "0 10px 8px",
              }}
            >
              Sommaire
            </div>
            {TOC_V01.map(([id, label], i) => (
              <a
                key={id}
                href={`#${id}`}
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "#52525b",
                  textDecoration: "none",
                  padding: "6.5px 10px",
                  borderRadius: 7,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span
                  style={{ color: "#8e8e98", fontSize: 11, width: 14 }}
                >
                  {i + 1}
                </span>
                {label}
              </a>
            ))}
          </nav>

          {/* ── Main sections ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {/* ── 0. Header card ── */}
            <div
              style={{
                background: "#fff",
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: "22px 26px",
                boxShadow:
                  "0 1px 2px rgba(24,24,27,.04), 0 4px 12px rgba(24,24,27,.05)",
                display: "flex",
                gap: 24,
                alignItems: "flex-start",
              }}
            >
              {/* Left: title, address, profile, recommandation */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 650,
                      color: "#18181b",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.25,
                    }}
                  >
                    {listing.title}
                  </h1>
                </div>

                {/* Address + price */}
                <div
                  style={{
                    fontSize: 13,
                    color: "#8e8e98",
                    marginTop: 5,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{listing.location.rawAddress}</span>
                  <span style={{ color: "#e4e4e7" }}>·</span>
                  <span
                    style={{
                      fontWeight: 650,
                      color: "#18181b",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {listing.price.toLocaleString("fr-FR")} €
                  </span>
                </div>

                {/* Profile pill + DPE chip */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 9,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2.5px 9px",
                      fontSize: 11.5,
                      fontWeight: 560,
                      borderRadius: 99,
                      background: "#f0fdfa",
                      border: "1px solid #99f6e4",
                      color: "#0f766e",
                      lineHeight: 1.4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {PROFILE_LABEL[report.profile]}
                  </span>
                  {listing.dpe && (
                    <DPEChip
                      letter={listing.dpe as "A" | "B" | "C" | "D" | "E" | "F" | "G"}
                      type="DPE"
                      size="sm"
                    />
                  )}
                </div>

                {/* Recommandation strip */}
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 13px",
                    background: "#f0fdfa",
                    border: "1px solid #99f6e4",
                    borderRadius: 8,
                    fontSize: 13.5,
                    fontWeight: 560,
                    color: "#0f766e",
                    lineHeight: 1.55,
                  }}
                >
                  {analysis.recommandation}
                </div>
              </div>

              {/* Right: ScoreRing + label */}
              {quick.score !== null && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    paddingLeft: 20,
                    borderLeft: "1px solid #ededf0",
                    flexShrink: 0,
                  }}
                >
                  <ScoreRing score={quick.score} size={84} stroke={7} sub="/100" />
                  <div
                    className={scoreColorClass(quick.score)}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      textAlign: "center",
                    }}
                  >
                    {scoreLabel(quick.score)}
                  </div>
                </div>
              )}
            </div>

            {/* ── 1. Synthèse ── */}
            <RSection id="synthese" num={1} title="Synthèse IA">
              <div
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.72,
                  color: "#3f3f46",
                  whiteSpace: "pre-line",
                }}
              >
                {analysis.synthese}
              </div>
            </RSection>

            {/* ── 2. Prix & marché ── */}
            <RSection id="prix" num={2} title="Prix & marché">
              {/* Metrics row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <Metric
                  label="Prix/m² annonce"
                  value={
                    quick.listingPricePerM2 !== null
                      ? `${Math.round(quick.listingPricePerM2).toLocaleString("fr-FR")} €/m²`
                      : "—"
                  }
                  tone="accent"
                />
                <Metric
                  label="Médiane quartier"
                  value={
                    quick.market
                      ? `${Math.round(quick.market.medianPricePerM2).toLocaleString("fr-FR")} €/m²`
                      : "—"
                  }
                  sub={
                    quick.market
                      ? `${quick.market.sampleSize} ventes · r${quick.market.radiusM} m · ${quick.market.confidence}`
                      : undefined
                  }
                />
                <Metric
                  label="Écart"
                  value={
                    quick.marketGapPct !== null
                      ? `${quick.marketGapPct > 0 ? "+" : ""}${quick.marketGapPct.toFixed(1)} %`
                      : "—"
                  }
                  tone={
                    quick.marketGapPct !== null
                      ? quick.marketGapPct < 0
                        ? "good"
                        : "warn"
                      : undefined
                  }
                />
              </div>

              {/* Comparables table */}
              {quick.market && quick.market.comparables.length > 0 && (
                <div
                  style={{
                    border: "1px solid #ededf0",
                    borderRadius: 9,
                    overflow: "hidden",
                  }}
                >
                  {/* Header row */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr 90px 80px 72px",
                      gap: 8,
                      padding: "7px 12px",
                      background: "#fafafa",
                      borderBottom: "1px solid #ededf0",
                    }}
                  >
                    {["Date", "Bien", "Prix", "€/m²", "Distance"].map((h) => (
                      <span
                        key={h}
                        style={{
                          fontSize: 11,
                          color: "#8e8e98",
                          fontWeight: 560,
                        }}
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                  {/* Rows */}
                  {quick.market.comparables.map((c, i) => (
                    <div
                      key={c.idMutation}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "72px 1fr 90px 80px 72px",
                        gap: 8,
                        padding: "7.5px 12px",
                        fontSize: 12.5,
                        alignItems: "baseline",
                        background: i % 2 ? "#fafafa" : "#fff",
                        borderTop: "1px solid #ededf0",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <span style={{ color: "#8e8e98" }}>{fmtDate(c.date)}</span>
                      <span
                        style={{
                          color: "#18181b",
                          fontWeight: 550,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.type} {c.surface} m²
                      </span>
                      <span
                        style={{ color: "#18181b", fontWeight: 600 }}
                      >
                        {c.price.toLocaleString("fr-FR")} €
                      </span>
                      <span style={{ color: "#52525b", fontWeight: 600 }}>
                        {Math.round(c.pricePerM2).toLocaleString("fr-FR")}
                      </span>
                      <span style={{ color: "#8e8e98" }}>{c.distanceM} m</span>
                    </div>
                  ))}
                </div>
              )}
            </RSection>

            {/* ── 3. Points de vigilance ── */}
            <RSection id="vigilance" num={3} title="Points de vigilance">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {analysis.pointsVigilance.map((p, i) => (
                  <WarnItem
                    key={i}
                    tone={NIVEAU_TONE[p.niveau] ?? "warn"}
                    title={p.titre}
                    sub={p.detail}
                  />
                ))}
              </div>
            </RSection>

            {/* ── 4. Négociation ── */}
            <RSection id="nego" num={4} title="Négociation">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 24,
                  alignItems: "start",
                }}
              >
                {/* Fourchette card */}
                <div
                  style={{
                    background: "#f0fdfa",
                    border: "1px solid #99f6e4",
                    borderRadius: 11,
                    padding: "16px 18px",
                    minWidth: 200,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 620,
                      color: "#0f766e",
                      marginBottom: 6,
                    }}
                  >
                    Fourchette recommandée
                  </div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 680,
                      color: "#18181b",
                      letterSpacing: "-0.02em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {analysis.negociation.cibleBasse.toLocaleString("fr-FR")} €
                    {" — "}
                    {analysis.negociation.cibleHaute.toLocaleString("fr-FR")} €
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#8e8e98",
                      marginTop: 4,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    cible de négociation
                  </div>
                </div>

                {/* Arguments list */}
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#8e8e98",
                      fontWeight: 560,
                      marginBottom: 10,
                    }}
                  >
                    Arguments à utiliser en visite
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {analysis.negociation.arguments.map((arg, i) => (
                      <div
                        key={i}
                        style={{ display: "flex", gap: 10 }}
                      >
                        <CheckIcon />
                        <span
                          style={{
                            fontSize: 12.5,
                            lineHeight: 1.6,
                            color: "#52525b",
                          }}
                        >
                          {arg}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </RSection>

            {/* ── Footer ── */}
            <footer
              style={{
                padding: "18px 6px 6px",
                fontSize: 11,
                color: "#8e8e98",
                lineHeight: 1.65,
              }}
            >
              Généré le{" "}
              {new Date(report.createdAt).toLocaleString("fr-FR")} ·{" "}
              {report.provider}/{report.model} · Sources : annonce, DVF
              (data.gouv.fr), BAN (IGN). Estimation indicative — ne remplace
              pas une expertise.
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
