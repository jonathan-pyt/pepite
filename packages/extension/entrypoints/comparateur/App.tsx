import React from "react";
import { browser } from "wxt/browser";
import type { Report } from "@pepite/core";
import { ArrowLeft, ImageOff, SearchX } from "lucide-react";
import { DPEChip, PageShell, ScoreRing, scoreColorClass } from "@/components/pepite";
import { useCompare, type CompareSlot } from "@/lib/hooks/use-compare";

const NIVEAU_DOT: Record<string, string> = {
  critique: "bg-bad",
  attention: "bg-warn",
  info: "bg-accent",
};

/** Colonnes de la grille selon le nombre de biens (classes statiques pour Tailwind). */
const GRID_COLS: Record<number, string> = {
  1: "grid-cols-[150px_repeat(1,minmax(0,1fr))]",
  2: "grid-cols-[150px_repeat(2,minmax(0,1fr))]",
  3: "grid-cols-[150px_repeat(3,minmax(0,1fr))]",
};

/** Ligne du tableau : visible si la donnée existe sur AU MOINS un bien. */
interface RowDef {
  key: string;
  label: string;
  has: (r: Report) => boolean;
  render: (r: Report) => React.ReactNode;
}

/* ---------- En-tête de colonne : photo + titre (lien annonce) ---------- */
function SlotHeader({ slot }: { slot: CompareSlot }) {
  if (!slot.report) {
    return (
      <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-line-soft bg-surface-2 px-4 text-center">
        <SearchX className="size-[18px] text-ink-3" />
        <span className="text-[12px] font-medium text-ink-3">Rapport introuvable</span>
        <span className="text-[10.5px] text-ink-3">id : {slot.id}</span>
      </div>
    );
  }
  const { listing } = slot.report;
  const photo = listing.photos[0];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {photo ? (
        <img
          src={photo}
          alt=""
          className="h-[120px] w-full rounded-lg border border-line-soft object-cover"
        />
      ) : (
        <div className="grid h-[120px] w-full place-items-center rounded-lg border border-line-soft bg-surface-2">
          <ImageOff className="size-[18px] text-ink-3" />
        </div>
      )}
      <a
        href={slot.report.listingUrl}
        target="_blank"
        rel="noreferrer"
        className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-[-0.01em] text-ink underline-offset-2 hover:text-accent-dark hover:underline"
      >
        {listing.title}
      </a>
      <span className="text-[11px] text-ink-3">
        {listing.location.city ?? listing.location.rawAddress}
      </span>
    </div>
  );
}

/* ---------- Page ---------- */
export default function App() {
  const { slots } = useCompare();

  if (slots === null) return null;

  const reports = slots.map((s) => s.report);
  const cols = GRID_COLS[slots.length] ?? GRID_COLS[3];

  // Sous-scores : union des critères présents sur les biens (ordre de 1ʳᵉ apparition).
  const criteres = new Map<string, string>();
  for (const r of reports) {
    for (const c of r?.globalScore?.criteres ?? []) {
      if (!criteres.has(c.id)) criteres.set(c.id, c.label);
    }
  }

  const rows: RowDef[] = [
    {
      key: "prix",
      label: "Prix",
      has: () => true,
      render: (r) => (
        <span className="text-[14px] font-bold tracking-[-0.02em] text-ink tabular-nums">
          {r.listing.price.toLocaleString("fr-FR")} €
        </span>
      ),
    },
    {
      key: "surface",
      label: "Surface",
      has: (r) => r.listing.surface !== undefined,
      render: (r) => (
        <span className="font-semibold text-ink tabular-nums">{r.listing.surface} m²</span>
      ),
    },
    {
      key: "prix-m2",
      label: "Prix/m² annonce",
      has: (r) => r.quick.listingPricePerM2 !== null,
      render: (r) => (
        <span className="font-semibold text-ink tabular-nums">
          {Math.round(r.quick.listingPricePerM2!).toLocaleString("fr-FR")} €/m²
        </span>
      ),
    },
    {
      key: "mediane",
      label: "Médiane secteur",
      has: (r) => r.quick.market !== null,
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-ink tabular-nums">
            {Math.round(r.quick.market!.medianPricePerM2).toLocaleString("fr-FR")} €/m²
          </span>
          <span className="text-[10.5px] text-ink-3">
            {r.quick.market!.sampleSize} ventes · rayon {r.quick.market!.radiusM} m
          </span>
        </div>
      ),
    },
    {
      key: "ecart",
      label: "Écart marché",
      has: (r) => r.quick.marketGapPct !== null,
      render: (r) => {
        const gap = r.quick.marketGapPct!;
        return (
          <span className={`font-bold tabular-nums ${gap < 0 ? "text-good" : "text-warn"}`}>
            {gap > 0 ? "+" : ""}
            {gap.toFixed(1)} %
          </span>
        );
      },
    },
    {
      key: "dpe",
      label: "DPE",
      has: (r) => r.listing.dpe !== undefined,
      render: (r) => (
        <DPEChip letter={r.listing.dpe as "A" | "B" | "C" | "D" | "E" | "F" | "G"} size="sm" />
      ),
    },
    {
      key: "score",
      label: "Score",
      has: (r) => r.globalScore !== undefined || r.quick.score !== null,
      render: (r) => {
        // Pattern side panel : score global si disponible, sinon score prix.
        const score = r.globalScore?.score ?? r.quick.score!;
        const label = r.globalScore !== undefined ? "Score global" : "Score prix";
        return (
          <div className="flex items-center gap-2.5">
            <ScoreRing score={score} size={44} stroke={4} />
            <span className={`text-[11px] font-semibold ${scoreColorClass(score)}`}>{label}</span>
          </div>
        );
      },
    },
    // Sous-scores du score global (un critère = une ligne)
    ...[...criteres].map(
      ([id, label]): RowDef => ({
        key: `critere-${id}`,
        label,
        has: (r) => r.globalScore?.criteres.some((c) => c.id === id) ?? false,
        render: (r) => {
          const score = r.globalScore!.criteres.find((c) => c.id === id)!.score;
          return (
            <span className={`font-semibold tabular-nums ${scoreColorClass(score)}`}>
              {score}
              <span className="font-normal text-ink-3">/100</span>
            </span>
          );
        },
      }),
    ),
    {
      key: "loyer",
      label: "Loyer estimé",
      has: (r) => r.enrichments?.rent !== undefined,
      render: (r) => {
        const rent = r.enrichments!.rent!;
        const surface = r.listing.surface;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-ink tabular-nums">
              {rent.loyerM2.toFixed(2)} €/m² CC
            </span>
            {surface !== undefined && (
              <span className="text-[10.5px] text-ink-3 tabular-nums">
                ≈ {Math.round(rent.loyerM2 * surface).toLocaleString("fr-FR")} €/mois
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "nego",
      label: "Fourchette de négociation",
      has: () => true,
      render: (r) => (
        <span className="font-semibold text-accent-dark tabular-nums">
          {r.analysis.negociation.cibleBasse.toLocaleString("fr-FR")} €{" — "}
          {r.analysis.negociation.cibleHaute.toLocaleString("fr-FR")} €
        </span>
      ),
    },
    {
      key: "vigilance",
      label: "Points de vigilance",
      has: (r) => r.analysis.pointsVigilance.length > 0,
      render: (r) => (
        <div className="flex flex-col gap-1.5">
          {r.analysis.pointsVigilance.slice(0, 3).map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className={`size-1.5 shrink-0 rounded-full ${NIVEAU_DOT[p.niveau] ?? "bg-warn"}`}
              />
              <span className="line-clamp-1 text-[11.5px] leading-snug text-ink-2">{p.titre}</span>
            </div>
          ))}
        </div>
      ),
    },
  ];

  // Ligne omise si la donnée manque sur TOUS les biens ; « — » si elle manque
  // sur un seul (y compris les colonnes « rapport introuvable »).
  const visibleRows = rows.filter((row) => reports.some((r) => r !== null && row.has(r)));

  return (
    <PageShell
      breadcrumb="Comparateur"
      maxWidth="rapport"
      topRight={
        <a
          href={browser.runtime.getURL("/historique.html")}
          className="inline-flex items-center gap-1.5 font-medium text-ink-2 no-underline hover:text-ink"
        >
          <ArrowLeft className="size-[14px]" />
          Historique
        </a>
      }
    >
      {slots.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-8 py-16 text-center shadow-pepite-card">
          <p className="text-[12.5px] text-ink-3">
            Aucun bien à comparer — sélectionne 2 ou 3 biens depuis l&apos;historique.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-pepite-card">
          {/* En-têtes de colonnes : photo + titre */}
          <div className={`grid ${cols} gap-4 px-5 py-4`}>
            <div />
            {slots.map((slot) => (
              <SlotHeader key={slot.id} slot={slot} />
            ))}
          </div>

          {/* Lignes de critères */}
          {visibleRows.map((row, i) => (
            <div
              key={row.key}
              className={`grid ${cols} items-center gap-4 border-t border-line-soft px-5 py-3 text-[12.5px] ${
                i % 2 ? "bg-surface-sub" : "bg-white"
              }`}
            >
              <span className="text-[11px] font-medium leading-snug text-ink-3">{row.label}</span>
              {reports.map((r, j) => (
                <div key={slots[j].id} className="min-w-0">
                  {r !== null && row.has(r) ? row.render(r) : <span className="text-ink-3">—</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
