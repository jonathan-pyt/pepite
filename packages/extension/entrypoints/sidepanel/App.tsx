import { useState } from "react";
import { browser } from "wxt/browser";
import type { UsageProfile } from "@pepite/core";
import { Check, ClipboardCopy, History, Info, Loader2, MoreHorizontal, Pencil, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PepiteLogo, ScoreRing, Seg, Metric, WarnItem } from "@/components/pepite";
import { formatPctFr } from "@/lib/format";
import { useCopyPrompt } from "@/lib/hooks/use-copy-prompt";
import { useCorrectLocation } from "@/lib/hooks/use-correct-location";
import { useHostPermissions } from "@/lib/hooks/use-host-permissions";
import { useTabState } from "@/lib/hooks/use-tab-state";

// ─── Profile definitions ────────────────────────────────────────────────────

const PROFILES: { id: UsageProfile; label: string }[] = [
  { id: "residence", label: "Résidence" },
  { id: "locatif-nu", label: "Location nue" },
  { id: "airbnb", label: "Airbnb" },
  { id: "coloc", label: "Coloc" },
];

// ─── Section title ───────────────────────────────────────────────────────────

function SecTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-[9px] flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        {children}
      </span>
      {right}
    </div>
  );
}

// ─── Host permissions banner (Firefox MV3 : host_permissions optionnelles) ──

function HostPermissionsBanner() {
  const { granted, requestPermissions } = useHostPermissions();
  if (granted) return null;
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-warn-border bg-warn-soft px-3.5 py-2.5">
      <p className="flex-1 text-[12px] leading-snug text-warn">
        Pépite a besoin d&apos;accéder aux données publiques (DVF, géocodage, risques…) pour
        analyser les annonces.
      </p>
      <Button size="sm" onClick={() => void requestPermissions()}>
        Autoriser
      </Button>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const { tabId, state, analysis, enrichments, globalScore, reportId, analysisDate, error, runFullAnalysis } = useTabState();
  const [profile, setProfile] = useState<UsageProfile>("residence");
  const { copied, copyPrompt } = useCopyPrompt(state.listing ?? null, state.quick ?? null, enrichments);
  const correctLocation = useCorrectLocation(tabId, state.listing?.location.rawAddress ?? "");

  // ── State: extraction échouée (aucune annonce exploitable) ───────────────

  if (state.status === "error" && !state.listing) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <HostPermissionsBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <PepiteLogo size="lg" />
          <p className="text-[13px] font-semibold text-ink">
            Extraction impossible sur cette page
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            {state.error ??
              "Pépite n'a pas réussi à identifier une annonce exploitable sur cette page."}
          </p>
        </div>
      </div>
    );
  }

  // ── State: idle / no listing ─────────────────────────────────────────────

  if (state.status === "idle" || !state.listing) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <HostPermissionsBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <PepiteLogo size="lg" />
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            Ouvre une annonce immobilière (Leboncoin, SeLoger, Bien&apos;ici, Citya…) pour lancer l&apos;analyse.
          </p>
        </div>
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
      ? `${formatPctFr(quick.marketGapPct)} %`
      : "—";

  const isApiKeyError = error?.includes("Clé API") ?? false;

  const activeProfileLabel = PROFILES.find((p) => p.id === profile)?.label ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-white text-[13px]">
      <HostPermissionsBanner />
      {/* ── Top bar: logo + accès historique ──────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-line-soft px-3.5 py-2.5">
        <PepiteLogo size="sm" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Historique"
                onClick={() => window.open(browser.runtime.getURL("/historique.html"))}
              >
                <History className="size-[15px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Historique</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ── Header: listing title + score ring ───────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3.5">
        {globalScore !== null || (quick?.score !== null && quick?.score !== undefined) ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <ScoreRing
                    score={globalScore !== null ? globalScore.score : quick!.score!}
                    size={54}
                    stroke={5}
                    sub="/100"
                  />
                  <span className="text-center text-[10.5px] font-medium text-ink-3">
                    {globalScore !== null ? "Score global" : "Score prix"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px]">
                {globalScore !== null
                  ? "Note pondérée : prix, DPE, risques, transports, commerces, écoles, espaces verts, tension locative"
                  : "Position du prix vs ventes DVF du secteur"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <div className="flex size-[54px] shrink-0 items-center justify-center rounded-full border border-line-soft bg-surface-sub text-lg font-semibold text-ink-3">
            —
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold tracking-[-0.01em] leading-tight text-ink">
            {listing.title}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-ink-3">
            <span className="truncate">{listing.location.rawAddress}</span>
            {listing.location.locationCorrected && (
              <span className="inline-flex shrink-0 items-center gap-[3px] text-[10.5px] text-ink-3">
                <Pencil className="size-[10px]" />
                corrigée
              </span>
            )}
            <Popover open={correctLocation.open} onOpenChange={correctLocation.setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label="Corriger la localisation"
                >
                  <Pencil className="size-[12px]" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="flex flex-col gap-2.5">
                <div className="text-[13px] font-semibold text-ink">
                  Corriger la localisation
                </div>
                <Input
                  autoFocus
                  value={correctLocation.address}
                  disabled={correctLocation.submitting}
                  onChange={(e) => correctLocation.setAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void correctLocation.submit();
                  }}
                />
                <p className="text-[11px] leading-relaxed text-ink-3">
                  Adresse ou ville réelle du bien (ex. : 12 rue des Lilas, 97400 Saint-Denis)
                </p>
                {correctLocation.error && (
                  <p className="text-[11.5px] leading-relaxed text-bad">
                    {correctLocation.error}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={correctLocation.submitting}
                    onClick={() => correctLocation.setOpen(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    disabled={correctLocation.submitting || !correctLocation.address.trim()}
                    onClick={() => void correctLocation.submit()}
                  >
                    {correctLocation.submitting && <Loader2 className="animate-spin" />}
                    Corriger &amp; relancer
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
        {/* ── Quick-running state ─────────────────────────────────────────── */}
        {state.status === "quick-running" && (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <Loader2 className="size-[14px] animate-spin" />
            Analyse du marché en cours…
          </div>
        )}

        {/* ── Metrics grid ────────────────────────────────────────────────── */}
        {quick && (
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Prix" value={`${listing.price.toLocaleString("fr-FR")} €`} />
            <Metric
              label="Prix/m²"
              value={
                quick.listingPricePerM2
                  ? `${quick.listingPricePerM2.toLocaleString("fr-FR")} €`
                  : "—"
              }
            />
            <Metric
              label="Médiane biens comparables"
              value={
                quick.market
                  ? `${quick.market.medianPricePerM2.toLocaleString("fr-FR")} €/m²`
                  : "—"
              }
              sub={
                quick.market
                  ? `${quick.market.sampleSize} ventes · rayon ${quick.market.radiusM} m${quick.market.windowMonths === 18 ? " · 18 derniers mois" : ""}${quick.market.medianOnSimilar ? " · surface comparable" : ""}${quick.market.p25PricePerM2 !== undefined && quick.market.p75PricePerM2 !== undefined ? ` · P25-P75 : ${quick.market.p25PricePerM2.toLocaleString("fr-FR")}-${quick.market.p75PricePerM2.toLocaleString("fr-FR")} €` : ""}`
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

        {/* ── Quartier résumé ──────────────────────────────────────────────── */}
        {analysis && enrichments?.neighborhood && (() => {
          const nb = enrichments.neighborhood!;
          const parts: string[] = [];
          if (nb.ecoles.count > 0) parts.push(`${nb.ecoles.count} école${nb.ecoles.count > 1 ? "s" : ""}`);
          if (nb.transports.count > 0) parts.push(`${nb.transports.count} arrêt${nb.transports.count > 1 ? "s" : ""}`);
          if (nb.commerces.count > 0) parts.push(`${nb.commerces.count} commerce${nb.commerces.count > 1 ? "s" : ""}`);
          if (nb.sante.count > 0) parts.push(`${nb.sante.count} santé`);
          if (parts.length === 0) return null;
          return (
            <p className="text-[11.5px] text-ink-3">
              <span className="font-medium text-ink-2">Quartier</span>
              {" : "}
              {parts.join(" · ")}
            </p>
          );
        })()}

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
            className={
              isApiKeyError
                ? "rounded-lg border border-warn-border bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn"
                : "rounded-lg border border-bad-border bg-bad-soft px-3 py-2.5 text-xs leading-relaxed text-bad"
            }
          >
            {error}{" "}
            {isApiKeyError && (
              <button
                type="button"
                className="cursor-pointer p-0 text-inherit underline"
                onClick={() => browser.runtime.openOptionsPage()}
              >
                Ouvrir les réglages
              </button>
            )}
          </div>
        )}

        {/* ── Copier le prompt sans clé API ────────────────────────────────── */}
        {error && isApiKeyError && quick && (
          <div className="flex flex-col gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => void copyPrompt()}
            >
              {copied ? <Check /> : <ClipboardCopy />}
              {copied ? "Copié ✓" : "Copier le prompt pour votre IA"}
            </Button>
            <p className="text-[11px] leading-relaxed text-ink-3">
              Toutes les données (annonce, ventes DVF, quartier…) dans un prompt prêt à
              coller — aucune clé requise.
            </p>
          </div>
        )}

        {/* ── Seg profils (only when analysis exists) ──────────────────────── */}
        {analysis && (
          <Seg options={segLabels} value={activeLabel} onChange={handleSegChange} size="sm" grow />
        )}

        {/* ── Analyse IA block ─────────────────────────────────────────────── */}
        {analysis && (
          <div className="rounded-lg border border-line-soft bg-surface-sub px-[13px] py-[11px]">
            <SecTitle
              right={
                <div className="flex items-center gap-1.5">
                  {analysisDate && (
                    <span className="text-[10.5px] text-ink-3">
                      analyse du{" "}
                      {new Date(analysisDate).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  <Sparkles className="size-[13px] text-ink-3" />
                </div>
              }
            >
              Analyse IA
            </SecTitle>
            {(!enrichments?.neighborhood && !enrichments?.risks && !enrichments?.rent) && (
              <div className="mb-[8px] flex items-start gap-1.5 text-[11px] text-ink-3">
                <Info className="mt-px size-[12px] shrink-0" />
                <span>
                  Analyse générée sans données contextuelles (quartier, risques, loyers) — cliquer ⟳ pour ré-analyser avec.
                </span>
              </div>
            )}
            <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink-2">
              {analysis.synthese}
            </p>
            <div className="mt-[10px] border-t border-line-soft pt-[10px]">
              <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {activeProfileLabel}
              </div>
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink-2">
                {analysis.profils[profile]}
              </p>
            </div>
          </div>
        )}

        {/* ── Points de vigilance ─────────────────────────────────────────── */}
        {analysis && analysis.pointsVigilance.length > 0 && (
          <div>
            <SecTitle>Points de vigilance</SecTitle>
            <div className="flex flex-col gap-2.5">
              {analysis.pointsVigilance.map((p) => (
                <WarnItem
                  key={p.titre}
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

        {/* ── Action buttons : primaire + menu « plus d'actions » ─────────── */}
        <div className="mt-1 flex gap-2">
          {!analysis && state.status !== "full-running" && (
            <Button
              className="flex-1"
              size="lg"
              onClick={() => void runFullAnalysis()}
              disabled={!quick}
            >
              Analyse complète (IA)
            </Button>
          )}

          {state.status === "full-running" && (
            <Button className="flex-1" size="lg" disabled>
              <Loader2 className="animate-spin" />
              Analyse IA en cours…
            </Button>
          )}

          {analysis && reportId && state.status !== "full-running" && (
            <>
              <Button
                className="flex-1"
                size="lg"
                onClick={() => {
                  window.open(browser.runtime.getURL(`/rapport.html?id=${reportId}`));
                  window.close();
                }}
              >
                Voir le rapport complet
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="aspect-square shrink-0 px-0"
                title="Ré-analyser (nouvelles données)"
                aria-label="Ré-analyser (nouvelles données)"
                onClick={() => void runFullAnalysis()}
              >
                <RotateCw className="size-[16px]" />
              </Button>
            </>
          )}

          {(listing.photos.length > 0 || quick) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="aspect-square shrink-0 px-0"
                  aria-label="Plus d'actions"
                >
                  <MoreHorizontal className="size-[16px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {listing.photos.length > 0 && (
                  <DropdownMenuItem
                    onSelect={() =>
                      window.open(
                        browser.runtime.getURL(
                          `/restyle.html?url=${encodeURIComponent(listing.url)}`,
                        ),
                      )
                    }
                  >
                    <Sparkles />
                    <div>
                      <div className="font-medium">Restyle IA</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-ink-3">
                        Redécorer les photos de l&apos;annonce avec Gemini
                      </div>
                    </div>
                  </DropdownMenuItem>
                )}
                {quick && (
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void copyPrompt(); }}>
                    {copied ? <Check /> : <ClipboardCopy />}
                    <div>
                      <div className="font-medium">{copied ? "Copié ✓" : "Copier le prompt"}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-ink-3">
                        À coller dans votre propre IA (ChatGPT, Claude…) — aucune clé requise
                      </div>
                    </div>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
