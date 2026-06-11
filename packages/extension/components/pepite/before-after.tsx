import * as React from "react"
import { Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

export interface BeforeAfterProps {
  /** Photo d'origine de l'annonce. */
  beforeSrc: string
  /** Rendu généré par Gemini — sans lui, seule la photo d'origine est affichée. */
  afterSrc?: string | null
  /** Texte de l'étiquette du rendu (défaut : « Après · Gemini »). */
  afterLabel?: string
  className?: string
  /** Contenu superposé (ex. overlay de génération en cours). */
  children?: React.ReactNode
}

/**
 * BeforeAfter — slider avant/après interactif au pointeur (maquette screen7).
 * Avant = photo de l'annonce, après = rendu Gemini clippé à droite du curseur,
 * poignée draggable, étiquettes « Avant » / « Après · Gemini ».
 */
export function BeforeAfter({
  beforeSrc,
  afterSrc,
  afterLabel = "Après · Gemini",
  className,
  children,
}: BeforeAfterProps) {
  const [pct, setPct] = React.useState(58)
  const ref = React.useRef<HTMLDivElement>(null)

  function onPointerDown(e: React.PointerEvent) {
    if (!afterSrc) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const move = (ev: { clientX: number }) => {
      const x = ev.clientX - rect.left
      setPct(Math.max(4, Math.min(96, (x / rect.width) * 100)))
    }
    move(e)
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[10px] bg-surface-2 select-none",
        afterSrc && "cursor-ew-resize touch-none",
        className
      )}
    >
      {/* AVANT (fond) */}
      <img
        src={beforeSrc}
        alt="Avant"
        draggable={false}
        className="absolute inset-0 size-full object-cover"
      />
      {afterSrc && (
        <>
          {/* APRÈS (clip dynamique à droite du curseur) */}
          <img
            src={afterSrc}
            alt={afterLabel}
            draggable={false}
            className="absolute inset-0 size-full object-cover"
            style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
          />
          {/* Curseur */}
          <div
            className="absolute inset-y-0 w-[2.5px] -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(0,0,0,0.35)]"
            style={{ left: `${pct}%` }}
          />
          <div
            className="absolute top-1/2 grid size-[34px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
            style={{ left: `${pct}%` }}
          >
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
              <path
                d="M5 1 1 6l4 5 M11 1l4 5-4 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-ink-2"
              />
            </svg>
          </div>
          {/* Étiquettes */}
          <span className="absolute top-3 left-3 rounded-full bg-white/90 px-[9px] py-[3px] text-[11px] font-semibold text-ink-2 shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
            Avant
          </span>
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-accent px-[9px] py-[3px] text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]">
            <Sparkles className="size-[10px]" />
            {afterLabel}
          </span>
        </>
      )}
      {children}
    </div>
  )
}
