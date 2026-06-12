import React, { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { GlobalScore, Report } from "@pepite/core";
import { estimateAcquisitionCost } from "@pepite/core";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Copy,
  History,
  Info,
  LandPlot,
  Loader2,
  Mail,
  NotebookPen,
  Pencil,
  RefreshCw,
  School,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Bus,
  Trees,
  Square,
} from "lucide-react";
import { formatPctFr } from "@/lib/format";
import { idbRepository, listRestylesByUrl, type RestyleRecord } from "@/lib/repository-idb";
import {
  BeforeAfter,
  ScoreRing,
  scoreColorClass,
  PageShell,
  MapTooltipContent,
  Metric,
  RangeGauge,
  StatStrip,
  Seg,
  WarnItem,
  DPEChip,
} from "@/components/pepite";
import { useCopyPrompt } from "@/lib/hooks/use-copy-prompt";
import { NEGOTIATION_TONES, useNegotiation } from "@/lib/hooks/use-negotiation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PROFILE_LABEL: Record<string, string> = {
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

/** Libellés FR de la confiance du marché (MarketStats.confidence). */
const CONFIDENCE_LABEL: Record<string, string> = {
  high: "fiabilité élevée",
  medium: "fiabilité moyenne",
  low: "fiabilité faible",
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
      className="rounded-xl border border-line bg-white px-[26px] py-[22px] shadow-pepite-card"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-[22px] shrink-0 place-items-center rounded-md border border-line-soft bg-surface-2 text-[11px] font-semibold text-ink-3">
          {num}
        </span>
        <h2 className="text-[16.5px] font-bold tracking-[-0.015em] text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/* ---------- Main TOC items ---------- */
const TOC_BASE = [
  ["synthese", "Synthèse IA"],
  ["prix", "Prix & marché"],
  ["cout", "Coût total d'acquisition"],
  ["vigilance", "Points de vigilance"],
  ["checklist", "Checklist visite"],
  ["nego", "Négociation"],
  ["mails", "Mails de négociation"],
  ["profils", "Selon votre projet"],
] as const;

const COMPARABLE_COLS = "grid-cols-[72px_1fr_90px_72px_1.6fr]";

/**
 * Capitalize each word of an address string (Unicode-aware).
 * `\b\w` casse sur les accents : « letchis » donnait « LetchiS ».
 * On capitalise la première lettre après début de chaîne, espace ou tiret.
 */
function capitalizeAddress(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, letter: string) => sep + letter.toUpperCase());
}

/** True when the listing location is not an exact address */
function isApproximateLocation(precision: string | undefined): boolean {
  return precision !== undefined && precision !== "address" && precision !== "housenumber";
}

/**
 * POI le plus proche d'une catégorie quartier. lat/lon optionnels côté
 * extension : les vieux caches IDB datent d'avant leur ajout au core —
 * sans coordonnées, tooltip sans carte.
 */
type NearestPoi = { name: string; distanceM: number; lat?: number; lon?: number };

/** Libellé court du type de zone PLU (U = urbaine, AU = à urbaniser, A = agricole, N = naturelle) */
function pluTypeLabel(typezone: string): string | undefined {
  if (typezone.startsWith("AU")) return "zone à urbaniser";
  return { U: "zone urbaine", A: "zone agricole", N: "zone naturelle" }[typezone.charAt(0)];
}

export default function App() {
  const [report, setReport] = useState<Report | null | "loading">("loading");
  const [othersOpen, setOthersOpen] = useState(false);
  const [restyles, setRestyles] = useState<RestyleRecord[]>([]);
  const [restyleUrls, setRestyleUrls] = useState<Record<string, string>>({});
  const nego = useNegotiation(report === "loading" ? null : report);
  const loadedReport = report === "loading" ? null : report;
  const { copied: promptCopied, copyPrompt } = useCopyPrompt(
    loadedReport?.listing ?? null,
    loadedReport?.quick ?? null,
    loadedReport?.enrichments,
  );

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return setReport(null);
    void idbRepository.getReport(id).then((r) => setReport(r ?? null));
  }, []);

  // Restyles IA persistés pour cette annonce (object URLs des blobs, révoqués au démontage).
  const listingUrl = report !== "loading" && report ? report.listingUrl : null;
  useEffect(() => {
    if (!listingUrl) return;
    let urls: Record<string, string> = {};
    let cancelled = false;
    void listRestylesByUrl(listingUrl).then((records) => {
      if (cancelled) return;
      records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      urls = Object.fromEntries(records.map((r) => [r.id, URL.createObjectURL(r.image)]));
      setRestyles(records);
      setRestyleUrls(urls);
    });
    return () => {
      cancelled = true;
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, [listingUrl]);

  if (report === "loading") return null;
  if (!report)
    return <p className="bg-page p-8 text-ink-3">Rapport introuvable.</p>;

  const { listing, quick, analysis } = report;
  const enrichments = report.enrichments;
  const globalScore: GlobalScore | undefined = report.globalScore;
  // La section Quartier s'affiche dès qu'une donnée de contexte existe (POI, commune ou PLU).
  const hasQuartierSection = !!(enrichments?.neighborhood || enrichments?.commune || enrichments?.plu);

  const generatedAt = new Date(report.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Dispersion P25-P75 du secteur (affichée seulement si les deux bornes existent)
  const hasDispersion =
    quick.market?.p25PricePerM2 !== undefined && quick.market?.p75PricePerM2 !== undefined;

  // Split comparables: similar first (date-desc), then others (date-desc)
  const allComparables = quick.market ? [...quick.market.comparables] : [];
  const similarComps = allComparables
    .filter((c) => c.similar !== false)
    .sort((a, b) => b.date.localeCompare(a.date));
  const otherComps = allComparables
    .filter((c) => c.similar === false)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <PageShell
      maxWidth="rapport"
      logoHref={browser.runtime.getURL("/historique.html")}
      topRight={
        <div className="flex items-center gap-3">
          <span>Rapport généré le {generatedAt}</span>
          <Button variant="secondary" size="sm" asChild>
            <a href={browser.runtime.getURL("/historique.html")}>
              <History />
              Historique
            </a>
          </Button>
          {listing.photos.length > 0 && (
            <Button variant="secondary" size="sm" asChild>
              <a
                href={browser.runtime.getURL(
                  `/restyle.html?url=${encodeURIComponent(report.listingUrl)}`,
                )}
              >
                <Sparkles />
                Restyle IA
              </a>
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => void copyPrompt()}>
            {promptCopied ? <Check /> : <ClipboardCopy />}
            {promptCopied ? "Copié ✓" : "Copier le prompt"}
          </Button>
        </div>
      }
    >
      {/* Grid: sticky sommaire (lg) + main content */}
      <div className="grid items-start gap-6 lg:grid-cols-[180px_1fr]">
        {/* ── Sommaire (sticky, left rail) ── */}
        <nav
          aria-label="Sommaire"
          className="sticky top-[76px] hidden flex-col gap-px lg:flex"
        >
          <div className="px-2.5 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            Sommaire
          </div>
          {[
            ...TOC_BASE,
            ...(hasQuartierSection ? [["quartier", "Quartier"] as const] : []),
            ...(enrichments?.risks ? [["risques", "Risques recensés"] as const] : []),
            ...(enrichments?.rent ? [["locatif", "Marché locatif"] as const] : []),
            ...(globalScore !== undefined ? [["recap", "Récapitulatif du score"] as const] : []),
            ...(restyles.length > 0 ? [["restyles", "Restyles IA"] as const] : []),
          ].map(([id, label], i) => (
            <a
              key={id}
              href={`#${id}`}
              className="flex items-center gap-2 rounded-[7px] px-2.5 py-[6.5px] text-[12.5px] font-medium text-ink-2 tabular-nums no-underline hover:bg-white"
            >
              <span className="w-3.5 text-[11px] text-ink-3">{i + 1}</span>
              {label}
            </a>
          ))}
        </nav>

        {/* ── Main sections ── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── 0. Header card ── */}
          <div className="flex items-start gap-6 rounded-xl border border-line bg-white px-[26px] py-[22px] shadow-pepite-card">
            {/* Left: title, address, recommandation */}
            <div className="min-w-0 flex-1">
              {/* Title */}
              <h1 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
                {listing.title}
              </h1>

              {/* Address + price */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                <span>{listing.location.rawAddress}</span>
                <span className="text-line">·</span>
                <span className="font-semibold text-ink tabular-nums">
                  {listing.price.toLocaleString("fr-FR")} €
                </span>
              </div>

              {/* Localisation corrigée manuellement (annonce volontairement trompeuse) */}
              {listing.location.locationCorrected && (
                <div className="mt-1 flex items-center gap-1 text-[11.5px] leading-snug text-ink-3">
                  <Pencil className="size-[10px] shrink-0" />
                  Localisation corrigée par l&apos;utilisateur
                </div>
              )}

              {/* Approximate position notice */}
              {isApproximateLocation(listing.location.precision) && (
                <div className="mt-1 text-[11.5px] leading-snug text-ink-3">
                  Position approximative (quartier {listing.location.district ?? "non précisé"}) — adresse exacte non communiquée par l&apos;annonce.
                </div>
              )}

              {/* DPE chip */}
              {listing.dpe && (
                <div className="mt-[9px]">
                  <DPEChip
                    letter={listing.dpe as "A" | "B" | "C" | "D" | "E" | "F" | "G"}
                    type="DPE"
                    size="sm"
                  />
                </div>
              )}

              {/* Recommandation strip */}
              <div className="mt-3 rounded-lg border border-accent-border bg-accent-soft px-[13px] py-2.5 text-[13.5px] font-medium leading-relaxed text-accent-dark">
                {analysis.recommandation}
              </div>

              {/* Infos ajoutées par l'utilisateur (transparence : elles ont nourri l'analyse) */}
              {listing.userNotes && (
                <div className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-3">
                  <NotebookPen className="mt-[2px] size-[11px] shrink-0" />
                  <span className="whitespace-pre-line">
                    <span className="font-medium text-ink-2">Infos ajoutées par vous : </span>
                    {listing.userNotes}
                  </span>
                </div>
              )}
            </div>

            {/* Right: ScoreRing + label — score global si disponible, sinon score prix */}
            {(globalScore !== undefined || quick.score !== null) && (() => {
              const displayScore = globalScore !== undefined ? globalScore.score : quick.score!;
              const displayLabel = globalScore !== undefined ? "score global" : "score prix";
              return (
                <div className="flex shrink-0 flex-col items-center gap-1.5 border-l border-line-soft pl-5">
                  <ScoreRing score={displayScore} size={84} stroke={7} sub="/100" />
                  <div className={`text-xs font-semibold text-center ${scoreColorClass(displayScore)}`}>
                    {displayLabel}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── 1. Synthèse ── */}
          <RSection id="synthese" num={1} title="Synthèse IA">
            <div className="whitespace-pre-line text-[13.5px] leading-[1.72] text-ink-2">
              {analysis.synthese}
            </div>
          </RSection>

          {/* ── 2. Prix & marché ── */}
          <RSection id="prix" num={2} title="Prix & marché">
            {/* Barre de stats + jauge de position dans le secteur */}
            <div className="mb-5">
              <StatStrip
                items={[
                  {
                    label: "Prix/m² annonce",
                    value:
                      quick.listingPricePerM2 !== null
                        ? `${Math.round(quick.listingPricePerM2).toLocaleString("fr-FR")} €/m²`
                        : "—",
                    tone: "accent",
                  },
                  {
                    label: "Médiane comparable",
                    value: quick.market
                      ? `${Math.round(quick.market.medianPricePerM2).toLocaleString("fr-FR")} €/m²`
                      : "—",
                  },
                  {
                    label: "Écart",
                    value:
                      quick.marketGapPct !== null
                        ? `${formatPctFr(quick.marketGapPct)} %`
                        : "—",
                    tone:
                      quick.marketGapPct !== null
                        ? quick.marketGapPct < 0
                          ? "good"
                          : "warn"
                        : undefined,
                  },
                ]}
                context={
                  quick.market
                    ? `${quick.market.sampleSize} ventes · rayon ${quick.market.radiusM} m · ${CONFIDENCE_LABEL[quick.market.confidence]}${quick.market.windowMonths === 18 ? " · 18 derniers mois" : ""}${quick.market.medianOnSimilar ? " · surface comparable" : ""}`
                    : undefined
                }
              >
                {hasDispersion && quick.listingPricePerM2 !== null && (
                  <RangeGauge
                    min={quick.market!.p25PricePerM2!}
                    max={quick.market!.p75PricePerM2!}
                    median={quick.market!.medianPricePerM2}
                    value={quick.listingPricePerM2}
                    formatValue={(v) => `${Math.round(v).toLocaleString("fr-FR")} €/m²`}
                  />
                )}
              </StatStrip>
            </div>

            {/* Comparables table */}
            {quick.market && allComparables.length > 0 && (
              <TooltipProvider>
                {/* Main table — similar rows */}
                <div className="overflow-hidden rounded-[9px] border border-line-soft">
                  {/* Header row */}
                  <div
                    className={`grid ${COMPARABLE_COLS} gap-2 border-b border-line-soft bg-surface-sub px-3 py-[7px]`}
                  >
                    {["Date", "Bien", "Prix", "€/m²", "Adresse"].map((h) => (
                      <span key={h} className="text-[11px] font-medium text-ink-3">
                        {h}
                      </span>
                    ))}
                  </div>
                  {/* Similar rows */}
                  {similarComps.map((c, i) => (
                    <div
                      key={c.idMutation}
                      className={`grid ${COMPARABLE_COLS} items-baseline gap-2 border-t border-line-soft px-3 py-[7.5px] text-[12.5px] tabular-nums ${
                        i % 2 ? "bg-surface-sub" : "bg-white"
                      }`}
                    >
                      <span className="text-ink-3">{fmtDate(c.date)}</span>
                      <span className="truncate font-medium text-ink">
                        {c.type} {c.surface} m²
                      </span>
                      <span className="font-semibold text-ink">
                        {c.price.toLocaleString("fr-FR")} €
                      </span>
                      <span className="font-semibold text-ink-2">
                        {Math.round(c.pricePerM2).toLocaleString("fr-FR")}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="min-w-0 cursor-help truncate text-ink-3">
                            {capitalizeAddress(c.address)}
                          </span>
                        </TooltipTrigger>
                        <MapTooltipContent
                          lat={c.lat}
                          lon={c.lon}
                          title={capitalizeAddress(c.address)}
                        />
                      </Tooltip>
                    </div>
                  ))}
                </div>

                {/* Toggle button + others table */}
                {otherComps.length > 0 && (
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-1.5 text-[12px] text-ink-3"
                      onClick={() => setOthersOpen((v) => !v)}
                    >
                      {othersOpen ? (
                        <ChevronUp className="size-[14px]" />
                      ) : (
                        <ChevronDown className="size-[14px]" />
                      )}
                      {othersOpen
                        ? "Masquer les autres ventes du secteur"
                        : `Voir les ${otherComps.length} autres ventes du secteur`}
                    </Button>
                    {othersOpen && (
                      <div className="mt-1.5 overflow-hidden rounded-[9px] border border-line-soft opacity-70">
                        <div
                          className={`grid ${COMPARABLE_COLS} gap-2 border-b border-line-soft bg-surface-sub px-3 py-[7px]`}
                        >
                          {["Date", "Bien", "Prix", "€/m²", "Adresse"].map((h) => (
                            <span key={h} className="text-[11px] font-medium text-ink-3">
                              {h}
                            </span>
                          ))}
                        </div>
                        {otherComps.map((c, i) => (
                          <div
                            key={c.idMutation}
                            className={`grid ${COMPARABLE_COLS} items-baseline gap-2 border-t border-line-soft px-3 py-[7.5px] text-[12.5px] tabular-nums ${
                              i % 2 ? "bg-surface-sub" : "bg-white"
                            }`}
                          >
                            <span className="text-ink-3">{fmtDate(c.date)}</span>
                            <span className="truncate font-medium text-ink-2">
                              {c.type} {c.surface} m²
                            </span>
                            <span className="font-semibold text-ink-2">
                              {c.price.toLocaleString("fr-FR")} €
                            </span>
                            <span className="font-semibold text-ink-3">
                              {Math.round(c.pricePerM2).toLocaleString("fr-FR")}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="min-w-0 cursor-help truncate text-ink-3">
                                  {capitalizeAddress(c.address)}
                                </span>
                              </TooltipTrigger>
                              <MapTooltipContent
                                lat={c.lat}
                                lon={c.lon}
                                title={capitalizeAddress(c.address)}
                              />
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </TooltipProvider>
            )}
          </RSection>

          {/* ── 3. Coût total d'acquisition ── */}
          {(() => {
            const acq = estimateAcquisitionCost(listing);
            return (
              <RSection id="cout" num={3} title="Coût total d'acquisition">
                <StatStrip
                  items={[
                    {
                      label: "Prix affiché",
                      value: `${acq.prix.toLocaleString("fr-FR")} €`,
                    },
                    {
                      label: `Frais de notaire (≈ ${String(acq.fraisNotairePct).replace(".", ",")} %)`,
                      value: `${acq.fraisNotaire.toLocaleString("fr-FR")} €`,
                    },
                    {
                      label: "Total estimé",
                      value: `${acq.total.toLocaleString("fr-FR")} €`,
                      tone: "accent",
                    },
                    ...(acq.taxeFonciereAnnuelle !== undefined
                      ? [
                          {
                            label: "Taxe foncière / an",
                            value: `${acq.taxeFonciereAnnuelle.toLocaleString("fr-FR")} €`,
                          },
                        ]
                      : []),
                    ...(enrichments?.taxeFonciere
                      ? [
                          {
                            label: `Taux TF communal ${enrichments.taxeFonciere.exercice}`,
                            value: `${enrichments.taxeFonciere.tauxGlobalTfb.toLocaleString("fr-FR")} %`,
                          },
                        ]
                      : []),
                  ]}
                  context={
                    <>
                      {enrichments?.taxeFonciere && (
                        <div>
                          Taux TF communal : taux global TFB
                          {enrichments.taxeFonciere.tauxTeom !== null
                            ? ` + TEOM ${enrichments.taxeFonciere.tauxTeom.toLocaleString("fr-FR")} %`
                            : ""}{" "}
                          — montant exact selon la valeur cadastrale.
                        </div>
                      )}
                      <div>
                        Estimation hors frais de dossier/garantie bancaire. Annonces de particulier ou prix hors honoraires : vérifier si les frais d&apos;agence sont inclus.
                      </div>
                    </>
                  }
                />
              </RSection>
            );
          })()}

          {/* ── 4. Points de vigilance ── */}
          <RSection id="vigilance" num={4} title="Points de vigilance">
            <div className="flex flex-col gap-2.5">
              {analysis.pointsVigilance.map((p) => (
                <WarnItem
                  key={p.titre}
                  tone={NIVEAU_TONE[p.niveau] ?? "warn"}
                  title={p.titre}
                  sub={p.detail}
                />
              ))}
            </div>
          </RSection>

          {/* ── 5. Checklist visite ── */}
          {analysis.checklistVisite && analysis.checklistVisite.length > 0 && (
            <RSection id="checklist" num={5} title="Checklist visite">
              <div className="flex flex-col gap-2">
                {analysis.checklistVisite.map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Square className="mt-[2px] size-[13px] shrink-0 text-ink-3" />
                    <span className="text-[13px] leading-relaxed text-ink-2">{item}</span>
                  </div>
                ))}
              </div>
            </RSection>
          )}

          {/* ── 6. Négociation ── */}
          <RSection id="nego" num={6} title="Négociation">
            <div className="grid grid-cols-[auto_1fr] items-start gap-6">
              {/* Fourchette card */}
              <div className="min-w-[200px] rounded-[11px] border border-accent-border bg-accent-soft px-[18px] py-4">
                <div className="mb-1.5 text-[11.5px] font-semibold text-accent-dark">
                  Fourchette recommandée
                </div>
                <div className="text-[19px] font-bold tracking-[-0.02em] text-ink tabular-nums">
                  {analysis.negociation.cibleBasse.toLocaleString("fr-FR")} €
                  {" — "}
                  {analysis.negociation.cibleHaute.toLocaleString("fr-FR")} €
                </div>
                <div className="mt-1 text-[11px] text-ink-3 tabular-nums">
                  cible de négociation
                </div>
              </div>

              {/* Arguments list */}
              <div>
                <div className="mb-2.5 text-xs font-medium text-ink-3">
                  Arguments à utiliser en visite
                </div>
                <div className="flex flex-col gap-2">
                  {analysis.negociation.arguments.map((arg) => (
                    <div key={arg} className="flex gap-2.5">
                      <Check className="mt-[3px] size-[14px] shrink-0 text-accent-dark" />
                      <span className="text-[12.5px] leading-relaxed text-ink-2">
                        {arg}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </RSection>

          {/* ── 7. Mails de négociation ── */}
          <RSection id="mails" num={7} title="Mails de négociation">
            {!nego.emails ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-[13px] leading-relaxed text-ink-2">
                  Générez trois variantes de mail (assertif, modéré, aimable) à adresser au
                  vendeur ou à l&apos;agent, ancrées dans les chiffres de ce rapport.
                </p>
                <Button onClick={() => void nego.generate()} disabled={nego.generating}>
                  {nego.generating ? <Loader2 className="animate-spin" /> : <Mail />}
                  {nego.generating ? "Génération en cours…" : "Générer les mails (IA)"}
                </Button>
                {nego.error && <p className="text-xs text-bad">{nego.error}</p>}
              </div>
            ) : (
              (() => {
                const mail = nego.emails[nego.tone];
                const activeLabel =
                  NEGOTIATION_TONES.find((t) => t.key === nego.tone)?.label ?? "Assertif";
                return (
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <Seg
                        options={NEGOTIATION_TONES.map((t) => t.label)}
                        value={activeLabel}
                        onChange={(label) => {
                          const next = NEGOTIATION_TONES.find((t) => t.label === label);
                          if (next) nego.setTone(next.key);
                        }}
                      />
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void nego.generate()}
                          disabled={nego.generating}
                        >
                          {nego.generating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          Régénérer
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => void nego.copy()}>
                          {nego.copied ? <Check /> : <Copy />}
                          {nego.copied ? "Copié ✓" : "Copier"}
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-[10px] border border-line">
                      <div className="border-b border-line-soft bg-surface-sub px-3.5 py-[9px] text-xs text-ink-2">
                        <span className="text-ink-3">Objet : </span>
                        <span className="font-semibold text-ink">{mail.objet}</span>
                      </div>
                      <div className="whitespace-pre-line bg-white px-3.5 py-[13px] font-mono text-[12.5px] leading-[1.65] text-ink-2">
                        {mail.corps}
                      </div>
                    </div>
                    {nego.error && <p className="mt-2 text-xs text-bad">{nego.error}</p>}
                    <p className="mt-2 text-[11px] text-ink-3">
                      Généré par IA à partir des données du rapport — relisez et personnalisez
                      avant envoi.
                    </p>
                  </div>
                );
              })()
            )}
          </RSection>

          {/* ── 8. Selon votre projet ── */}
          {analysis.profils && (
            <RSection id="profils" num={8} title="Selon votre projet">
              <div className="flex flex-col gap-5">
                {(["residence", "locatif-nu", "airbnb", "coloc"] as const).map((key) => (
                  <div key={key}>
                    <div className="mb-1.5 text-[12px] font-semibold text-ink">
                      {PROFILE_LABEL[key]}
                    </div>
                    <p className="whitespace-pre-line text-[13.5px] leading-[1.72] text-ink-2">
                      {analysis.profils[key]}
                    </p>
                  </div>
                ))}
              </div>
            </RSection>
          )}

          {/* ── 9. Quartier ── */}
          {hasQuartierSection && (() => {
            const nb = enrichments?.neighborhood;
            const commune = enrichments?.commune;
            const plu = enrichments?.plu;
            type CatKey = "ecoles" | "commerces" | "sante" | "transports" | "espacesVerts";
            const categories: { key: CatKey; label: string; Icon: React.ElementType }[] = [
              { key: "ecoles", label: "Écoles", Icon: School },
              { key: "commerces", label: "Commerces", Icon: ShoppingBag },
              { key: "sante", label: "Santé", Icon: Stethoscope },
              { key: "transports", label: "Transports", Icon: Bus },
              { key: "espacesVerts", label: "Espaces verts", Icon: Trees },
            ];
            const sectionNum = 9;
            return (
              <RSection
                id="quartier"
                num={sectionNum}
                title={nb ? `Quartier (rayon ${nb.radiusM} m)` : "Quartier"}
              >
                {(commune || plu) && (
                  <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-line-soft bg-surface-sub px-3.5 py-2.5">
                    {commune && (
                      <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                        <Building2 className="size-[13px] shrink-0 text-ink-3" />
                        <span className="font-semibold text-ink">{commune.nom}</span>
                        <span className="text-ink-3 tabular-nums">
                          {commune.population.toLocaleString("fr-FR")} hab ·{" "}
                          {commune.densityPerKm2.toLocaleString("fr-FR")} hab/km²
                        </span>
                      </span>
                    )}
                    {plu && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex cursor-help items-center gap-1.5 text-[12px] text-ink-2">
                              <LandPlot className="size-[13px] shrink-0 text-ink-3" />
                              <span className="text-ink-3">Zone PLU</span>
                              <span className="font-semibold text-ink">{plu.libelle}</span>
                              {pluTypeLabel(plu.typezone) && (
                                <span className="text-ink-3">({pluTypeLabel(plu.typezone)})</span>
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Types de zone PLU : U = urbaine, AU = à urbaniser, A = agricole, N = naturelle.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}
                {nb && isApproximateLocation(listing.location.precision) && (
                  <div className="mb-3 text-[11.5px] leading-snug text-ink-3">
                    Position approximative (quartier {listing.location.district ?? "non précisé"}) — adresse exacte non communiquée par l&apos;annonce.
                  </div>
                )}
                {nb && categories.every(({ key }) => nb[key].count === 0) && (
                  <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface-sub px-3.5 py-3">
                    <Info className="mt-px size-[14px] shrink-0 text-ink-3" />
                    <p className="text-[12.5px] leading-relaxed text-ink-3">
                      Aucune donnée OpenStreetMap dans le rayon de {nb.radiusM} m — la
                      couverture OSM varie selon les zones, cela ne signifie pas une
                      absence réelle de commodités.
                    </p>
                  </div>
                )}
                {nb && categories.some(({ key }) => nb[key].count > 0) && (
                <TooltipProvider>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {categories.map(({ key, label, Icon }) => {
                    const cat = nb[key];
                    const nearest: NearestPoi[] = cat.nearest;
                    return (
                      <div
                        key={key}
                        className="flex min-w-0 flex-col rounded-lg border border-line-soft bg-surface-sub px-3.5 py-3"
                      >
                        {/* Header: icon + label left, count right */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Icon className="size-[13px] shrink-0 text-ink-3" />
                            <span className="whitespace-nowrap text-[11px] font-medium tracking-[0.01em] text-ink-3">
                              {label}
                            </span>
                          </div>
                          <span className="text-[20px] font-bold leading-none tabular-nums text-ink">
                            {cat.count}
                          </span>
                        </div>
                        {/* Nearest POI list */}
                        {nearest.length > 0 && (
                          <div className="mt-2.5 flex flex-col gap-1.5 border-t border-line-soft pt-2.5">
                            {/* nearest est dédoublonné par nom dans le core → clé stable */}
                            {nearest.map((poi) => (
                              <Tooltip key={poi.name}>
                                <TooltipTrigger asChild>
                                  <span className="line-clamp-2 cursor-help text-[12px] leading-[1.35] text-ink-2">
                                    {poi.name}
                                  </span>
                                </TooltipTrigger>
                                {poi.lat !== undefined && poi.lon !== undefined ? (
                                  <MapTooltipContent
                                    lat={poi.lat}
                                    lon={poi.lon}
                                    title={poi.name}
                                    subtitle={`≈ ${poi.distanceM} m à vol d'oiseau`}
                                  />
                                ) : (
                                  // Vieux caches IDB sans coordonnées : pas de carte
                                  <TooltipContent>
                                    {poi.name} · ≈ {poi.distanceM} m à vol d&apos;oiseau
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            ))}
                            {cat.count > nearest.length && (
                              <span className="text-[11px] text-ink-3">
                                +{cat.count - nearest.length} autre{cat.count - nearest.length > 1 ? "s" : ""} dans le rayon
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </TooltipProvider>
                )}
              </RSection>
            );
          })()}

          {/* ── 10. Risques recensés ── */}
          {enrichments?.risks && (() => {
            const risks = enrichments.risks!;
            const hasAny = risks.naturels.length > 0 || risks.technologiques.length > 0;
            const sectionNum = hasQuartierSection ? 10 : 9;
            return (
              <RSection id="risques" num={sectionNum} title="Risques recensés">
                {!hasAny ? (
                  <p className="text-[13px] text-ink-3">Aucun risque recensé sur la commune.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {/* libellés uniques par section (clés d'objet Géorisques) */}
                    {risks.naturels.map((r) => (
                      <WarnItem key={`n-${r.libelle}`} tone="warn" title={r.libelle} sub={r.statut} />
                    ))}
                    {risks.technologiques.map((r) => (
                      <WarnItem key={`t-${r.libelle}`} tone="info" title={r.libelle} sub={r.statut} />
                    ))}
                  </div>
                )}
              </RSection>
            );
          })()}

          {/* ── 11. Marché locatif ── */}
          {enrichments?.rent && (() => {
            const rent = enrichments.rent!;
            const prevCount = (hasQuartierSection ? 1 : 0) + (enrichments?.risks ? 1 : 0);
            const sectionNum = 9 + prevCount;
            const rendementBrut =
              listing.price && listing.surface && rent.fiable
                ? ((rent.loyerM2 * listing.surface * 12) / listing.price * 100).toFixed(1)
                : null;
            return (
              <RSection id="locatif" num={sectionNum} title="Marché locatif">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <Metric
                    label="Loyer médian"
                    value={`${rent.loyerM2.toFixed(2)} €/m² CC`}
                    sub={`IC 80 % : ${rent.loyerM2Bas.toFixed(2)} – ${rent.loyerM2Haut.toFixed(2)} €/m²`}
                  />
                  {rent.zoneAbc && (
                    <div className="min-w-0 rounded-lg border border-line-soft bg-surface-sub px-3 py-2.5">
                      <div className="mb-1 text-[11px] font-medium tracking-[0.01em] text-ink-3">
                        Zone ABC
                      </div>
                      <span className="inline-block rounded-md border border-line bg-white px-2 py-0.5 text-[13px] font-semibold text-ink tabular-nums">
                        {/* le CSV zonage écrit "Abis" sans espace — affichage lisible */}
                        {rent.zoneAbc === "Abis" ? "A bis" : rent.zoneAbc}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 rounded-lg border border-line-soft bg-surface-sub px-3 py-2.5">
                    <div className="mb-1 text-[11px] font-medium tracking-[0.01em] text-ink-3">
                      Fiabilité
                    </div>
                    {rent.fiable ? (
                      <span className="inline-block rounded-md border border-good/30 bg-good/10 px-2 py-0.5 text-[12px] font-semibold text-good">
                        observé · {rent.nbAnnonces} annonces
                      </span>
                    ) : (
                      <span className="inline-block rounded-md border border-warn-border bg-warn-soft px-2 py-0.5 text-[12px] font-semibold text-warn">
                        extrapolé (maille)
                      </span>
                    )}
                  </div>
                  {rendementBrut && (
                    <div className="col-span-full min-w-0 rounded-lg border border-line-soft bg-surface-sub px-3 py-2.5">
                      <div className="mb-1 text-[11px] font-medium tracking-[0.01em] text-ink-3">
                        Rendement brut indicatif
                      </div>
                      <div className="text-base font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-ink">
                        {rendementBrut} %
                      </div>
                      <div className="mt-[3px] text-[10.5px] leading-[1.4] text-ink-3">
                        Estimation indicative (loyer médian CC × surface × 12 / prix) — hors charges, vacance et fiscalité.
                      </div>
                    </div>
                  )}
                </div>
              </RSection>
            );
          })()}

          {/* ── Récapitulatif du score ── */}
          {globalScore !== undefined && (() => {
            const prevCount =
              (hasQuartierSection ? 1 : 0) +
              (enrichments?.risks ? 1 : 0) +
              (enrichments?.rent ? 1 : 0);
            const sectionNum = 9 + prevCount;
            return (
              <RSection id="recap" num={sectionNum} title="Récapitulatif du score">
                <div className="overflow-hidden rounded-[9px] border border-line-soft">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_80px_60px_70px] gap-2 border-b border-line-soft bg-surface-sub px-3 py-[7px]">
                    {["Critère", "Score /100", "Poids %", "Points"].map((h) => (
                      <span key={h} className="text-[11px] font-medium text-ink-3">
                        {h}
                      </span>
                    ))}
                  </div>
                  {/* Rows */}
                  {globalScore.criteres.map((c, i) => {
                    const points = (c.score * c.poids) / 100;
                    return (
                      <div
                        key={c.id}
                        className={`grid grid-cols-[1fr_80px_60px_70px] items-baseline gap-2 border-t border-line-soft px-3 py-[7.5px] text-[12.5px] tabular-nums ${
                          i % 2 ? "bg-surface-sub" : "bg-white"
                        }`}
                      >
                        <span className="font-medium text-ink">{c.label}</span>
                        <span className="text-ink-2">{c.score}</span>
                        <span className="text-ink-3">{c.poids} %</span>
                        <span className="font-semibold text-ink">{points.toFixed(1)}</span>
                      </div>
                    );
                  })}
                  {/* Footer row: global */}
                  <div className="grid grid-cols-[1fr_80px_60px_70px] items-baseline gap-2 border-t-2 border-line bg-surface-sub px-3 py-[8px] text-[12.5px] tabular-nums">
                    <span className="font-bold text-ink">Score global</span>
                    <span className="font-bold text-ink">{globalScore.score}</span>
                    <span className="font-bold text-ink">100 %</span>
                    <span className="font-bold text-ink">{globalScore.score.toFixed(1)}</span>
                  </div>
                </div>
              </RSection>
            );
          })()}

          {/* ── Restyles IA ── */}
          {restyles.length > 0 && (() => {
            const prevCount =
              (hasQuartierSection ? 1 : 0) +
              (enrichments?.risks ? 1 : 0) +
              (enrichments?.rent ? 1 : 0) +
              (globalScore !== undefined ? 1 : 0);
            const sectionNum = 9 + prevCount;
            return (
              <RSection id="restyles" num={sectionNum} title="Restyles IA">
                <div className="flex flex-col gap-6">
                  {restyles.map((r) => (
                    <div key={r.id} className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink">
                          {r.styleLabel}
                        </span>
                        {r.cost && (
                          <span className="text-[13px] font-semibold tabular-nums text-ink">
                            Travaux ≈ {r.cost.totalMin.toLocaleString("fr-FR")} –{" "}
                            {r.cost.totalMax.toLocaleString("fr-FR")} €
                          </span>
                        )}
                      </div>
                      <BeforeAfter
                        beforeSrc={r.photoUrl}
                        afterSrc={restyleUrls[r.id]}
                        className="h-[320px]"
                      />
                      {r.cost?.commentaire && (
                        <p className="text-[11.5px] leading-relaxed text-ink-3">
                          {r.cost.commentaire}
                        </p>
                      )}
                    </div>
                  ))}
                  <p className="text-[11.5px] leading-relaxed text-ink-3">
                    Projection générée par IA — l&apos;agencement réel (murs porteurs,
                    réseaux) doit être validé par un professionnel.
                  </p>
                </div>
              </RSection>
            );
          })()}

          {/* ── Footer ── */}
          <footer className="px-1.5 pb-1.5 pt-[18px] text-[11px] leading-relaxed text-ink-3">
            Généré le {new Date(report.createdAt).toLocaleString("fr-FR")} ·{" "}
            {report.provider}/{report.model} · Sources : annonce, DVF
            (data.gouv.fr), BAN (IGN). Estimation indicative — ne remplace pas une
            expertise.
          </footer>
        </div>
      </div>
    </PageShell>
  );
}
