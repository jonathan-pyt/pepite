import { useState } from "react";
import { browser } from "wxt/browser";
import { RESTYLE_STYLES, type RestyleStyle } from "@pepite/core";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  FileText,
  Loader2,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";

import { BeforeAfter, PepiteLogo } from "@/components/pepite";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRestyle } from "@/lib/hooks/use-restyle";
import { cn } from "@/lib/utils";

/* ---------- Chip de style (doubles pastilles couleur) ---------- */
function StyleChip({
  style,
  active,
  onClick,
}: {
  style: RestyleStyle;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[9px] border-[1.5px] bg-white py-[7px] pr-[11px] pl-2",
        active ? "border-accent bg-accent-soft" : "border-line"
      )}
    >
      <span className="flex">
        {style.colors.map((c, i) => (
          <span
            key={c}
            className={cn(
              "size-3.5 rounded-full border-[1.5px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]",
              i > 0 && "-ml-[5px]"
            )}
            style={{ background: c }}
          />
        ))}
      </span>
      <span
        className={cn(
          "text-xs whitespace-nowrap",
          active ? "font-semibold text-accent-dark" : "font-medium text-ink-2"
        )}
      >
        {style.nom}
      </span>
    </button>
  );
}

/* ---------- Titre de bloc colonne droite ---------- */
function ColTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[9px] text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
      {children}
    </div>
  );
}

/* ---------- Carte « Travaux estimés » ---------- */
function CostCard({
  styleLabel,
  cost,
  pending,
}: {
  styleLabel: string;
  cost: ReturnType<typeof useRestyle>["cost"];
  pending: boolean;
}) {
  return (
    <div className="rounded-[11px] border border-line bg-white px-[15px] py-[13px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2">
          Travaux estimés — {styleLabel}
        </span>
        {cost && (
          <span className="text-[17px] font-bold tracking-[-0.02em] whitespace-nowrap text-ink tabular-nums">
            ≈ {cost.totalMin.toLocaleString("fr-FR")} – {cost.totalMax.toLocaleString("fr-FR")} €
          </span>
        )}
      </div>

      {pending && (
        <div className="mt-[9px] flex flex-col gap-[7px]" aria-label="Estimation en cours">
          {[80, 64, 72, 56].map((w, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-surface-2"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      )}

      {!pending && cost && (
        <>
          <div className="mt-[9px] flex flex-col gap-[5px]">
            {cost.postes.map((p) => (
              <div key={p.label} className="flex justify-between gap-2 text-[11.5px] text-ink-2">
                <span>{p.label}</span>
                <span className="font-semibold whitespace-nowrap text-ink tabular-nums">
                  {p.montant.toLocaleString("fr-FR")} €
                </span>
              </div>
            ))}
          </div>
          <div className="mt-[9px] border-t border-dashed border-line-soft pt-2 text-[11px] leading-[1.5] text-ink-3">
            {cost.commentaire}
          </div>
        </>
      )}

      {!pending && !cost && (
        <p className="mt-[9px] text-[11.5px] leading-[1.5] text-ink-3">
          L&apos;estimation des travaux (postes + fourchette) s&apos;affichera après la
          génération du restyle.
        </p>
      )}
    </div>
  );
}

export default function App() {
  const r = useRestyle();
  const [addedFeedback, setAddedFeedback] = useState(false);

  function handleAddToReport() {
    // La persistance IDB est faite à la génération — on confirme visuellement.
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  }

  if (r.status === "loading") return null;

  if (r.status === "not-found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page px-8 text-center">
        <PepiteLogo size="lg" href={browser.runtime.getURL("/historique.html")} />
        <p className="max-w-[420px] text-[13px] leading-relaxed text-ink-3">
          Annonce introuvable — ouvre d&apos;abord une annonce immobilière analysée par
          Pépite, puis relance le Restyle IA depuis le panneau ou le rapport.
        </p>
      </div>
    );
  }

  if (r.status === "no-key") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page px-8 text-center">
        <PepiteLogo size="lg" href={browser.runtime.getURL("/historique.html")} />
        <div className="max-w-[440px] rounded-xl border border-line bg-white px-6 py-5 shadow-pepite-card">
          <div className="mb-1.5 text-[14px] font-semibold text-ink">
            Clé Gemini requise
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            Le Restyle IA génère les images avec Gemini, quel que soit le provider
            d&apos;analyse choisi. Configure le provider Google et sa clé API dans les
            réglages pour continuer.
          </p>
          <Button className="mt-4" onClick={() => browser.runtime.openOptionsPage()}>
            <Settings />
            Ouvrir les réglages
          </Button>
        </div>
      </div>
    );
  }

  const listing = r.listing!;
  const photos = listing.photos;

  return (
    <div className="flex h-screen flex-col bg-page">
      {/* ── Top bar ── */}
      <div className="flex h-[52px] shrink-0 items-center gap-3.5 border-b border-line bg-white px-[22px]">
        <PepiteLogo size="md" href={browser.runtime.getURL("/historique.html")} />
        <span className="text-line">/</span>
        <span className="truncate text-[13.5px] font-semibold text-ink">
          Restyle IA · {listing.title}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-border bg-accent-soft px-2 py-[2.5px] text-[11.5px] font-medium whitespace-nowrap text-accent-dark">
          <Sparkles className="size-[11px]" />
          Gemini · génération d&apos;image
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {r.reportId && (
            <a
              href={browser.runtime.getURL(`/rapport.html?id=${r.reportId}`)}
              className="mr-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 no-underline hover:text-ink"
            >
              <ArrowLeft className="size-[14px]" />
              Rapport
            </a>
          )}
          <Button variant="secondary" size="sm" disabled={!r.saved} onClick={handleAddToReport}>
            {addedFeedback ? <Check /> : <FileText />}
            {addedFeedback ? "Ajouté au rapport ✓" : "Ajouter au rapport"}
          </Button>
          <Button variant="secondary" size="sm" disabled={!r.afterUrl} onClick={r.exportImage}>
            <Copy />
            Exporter l&apos;image
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 p-[18px]">
        {/* ── Colonne gauche : photos + résultat ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Sélecteur de photo */}
          <div className="flex shrink-0 gap-2 overflow-x-auto pt-0.5 pb-1 pl-0.5">
            {photos.map((p, i) => (
              <button
                type="button"
                key={`${p}-${i}`}
                onClick={() => r.selectPhoto(i)}
                className={cn(
                  "relative h-[74px] w-[118px] shrink-0 cursor-pointer overflow-hidden rounded-lg bg-surface-2",
                  i === r.photoIndex && "outline-[2.5px] outline-offset-[1.5px] outline-accent"
                )}
                aria-label={`Photo ${i + 1}`}
              >
                <img src={p} alt="" draggable={false} className="size-full object-cover" />
                {i === r.photoIndex && (
                  <span className="absolute top-[5px] right-[5px] grid size-[17px] place-items-center rounded-full bg-accent">
                    <Check className="size-[9px] text-white" strokeWidth={2.8} />
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Slider avant/après (photo seule avant génération) */}
          <BeforeAfter
            beforeSrc={photos[r.photoIndex]!}
            afterSrc={r.afterUrl}
            afterLabel="Après · Gemini"
            className="min-h-[320px] flex-1"
          >
            {r.generating && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-[2px]">
                <Loader2 className="size-[30px] animate-spin text-accent" />
                <div className="text-[13.5px] font-semibold text-ink">
                  Gemini redessine la pièce…
                </div>
                <div className="text-[11.5px] text-ink-2">
                  style {r.styleLabel.toLowerCase()} · l&apos;architecture de la pièce est conservée
                </div>
              </div>
            )}
          </BeforeAfter>

          {/* Galerie des variantes générées (persistées en IDB) */}
          {r.variants.length > 0 && (
            <div className="shrink-0">
              <ColTitle>Variantes</ColTitle>
              <div className="flex gap-2 overflow-x-auto pt-0.5 pb-1 pl-0.5">
                {[...r.variants].reverse().map((v) => (
                  <div key={v.id} className="group relative shrink-0">
                    <button
                      type="button"
                      onClick={() => r.selectVariant(v.id)}
                      className={cn(
                        "relative block h-[74px] w-[118px] cursor-pointer overflow-hidden rounded-lg bg-surface-2",
                        v.id === r.activeVariantId &&
                          "outline-[2.5px] outline-offset-[1.5px] outline-accent"
                      )}
                      aria-label={`Variante ${v.styleLabel}`}
                    >
                      <img
                        src={r.variantUrls[v.id]}
                        alt=""
                        draggable={false}
                        className="size-full object-cover"
                      />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/65 to-transparent px-1.5 pt-3 pb-[3px] text-left text-[10px] font-medium text-white">
                        {v.styleLabel}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => r.deleteVariant(v.id)}
                      aria-label={`Supprimer la variante ${v.styleLabel}`}
                      className="absolute top-[5px] right-[5px] grid size-5 cursor-pointer place-items-center rounded-md bg-white/90 text-ink-3 opacity-0 shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-opacity group-hover:opacity-100 hover:text-bad focus-visible:opacity-100"
                    >
                      <Trash2 className="size-[11px]" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="flex shrink-0 items-center gap-[7px] text-[11.5px] leading-[1.5] text-ink-3">
            <Eye className="size-[13px] shrink-0" />
            Projection générée par IA — l&apos;agencement réel (murs porteurs, réseaux) doit
            être validé par un professionnel.
          </div>

          {r.error && (
            <div className="shrink-0 rounded-lg border border-bad-border bg-bad-soft px-3 py-2 text-[12px] text-bad">
              {r.error}
            </div>
          )}
        </div>

        {/* ── Colonne droite : styles + prompt + coût ── */}
        <div className="flex w-[330px] shrink-0 flex-col gap-3.5 overflow-y-auto">
          <div>
            <ColTitle>Style</ColTitle>
            <div className="flex flex-wrap gap-[7px]">
              {RESTYLE_STYLES.map((s) => (
                <StyleChip
                  key={s.nom}
                  style={s}
                  active={s.nom === r.preset}
                  onClick={() => r.togglePreset(s.nom)}
                />
              ))}
            </div>
          </div>

          <div>
            <ColTitle>Précisions ou style personnalisé</ColTitle>
            <Textarea
              value={r.custom}
              onChange={(e) => r.setCustom(e.target.value)}
              placeholder="« Beaucoup de plantes… » pour compléter le style choisi, ou décrivez votre déco idéale sans preset."
              rows={3}
            />
          </div>

          <CostCard
            styleLabel={r.generatedStyleLabel ?? r.styleLabel}
            cost={r.cost}
            pending={r.costPending}
          />

          <Button
            size="lg"
            className="mt-auto w-full shrink-0"
            disabled={r.generating || !r.canGenerate}
            onClick={() => void r.generate()}
          >
            {r.generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {r.generating ? "Génération en cours…" : "Générer le restyle"}
          </Button>
        </div>
      </div>
    </div>
  );
}
