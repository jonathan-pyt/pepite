import * as React from "react"

import { cn } from "@/lib/utils"

export interface RangeGaugeProps {
  /** Borne basse de la bande (ex. P25). */
  min: number
  /** Borne haute de la bande (ex. P75). */
  max: number
  median: number
  /** Valeur du bien, matérialisée par le point « ce bien ». */
  value: number
  formatValue: (v: number) => string
}

/** Position % dans le domaine [d0, d1], clampée aux bords. */
function pct(v: number, d0: number, d1: number): number {
  return Math.min(100, Math.max(0, ((v - d0) / (d1 - d0)) * 100))
}

/** Translation horizontale d'une étiquette centrée sur sa position, clampée aux bords. */
function labelShift(p: number): string {
  if (p < 8) return ""
  if (p > 92) return "-translate-x-full"
  return "-translate-x-1/2"
}

/**
 * RangeGauge — jauge de position : piste grise, bande min→max en accent
 * clair, tick médiane, point « ce bien » (halo blanc) avec étiquette.
 * Seules les positions (left/width %) sont en style inline — réellement
 * calculées à partir des données.
 */
export function RangeGauge({ min, max, median, value, formatValue }: RangeGaugeProps) {
  // Domaine d'affichage : [min, max] étendu de 12 % de chaque côté pour respirer.
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1
  const d0 = min - pad
  const d1 = max + pad
  const bandLeft = pct(min, d0, d1)
  const bandRight = pct(max, d0, d1)
  const medianPct = pct(median, d0, d1)
  const valuePct = pct(value, d0, d1)
  const markers = [
    { label: "P25", v: min, p: bandLeft },
    { label: "médiane", v: median, p: medianPct },
    { label: "P75", v: max, p: bandRight },
  ]
  return (
    <div className="relative h-[60px]">
      {/* Étiquette « ce bien » au-dessus du point */}
      <div
        className={cn(
          "absolute top-0 whitespace-nowrap text-[11.5px] font-medium tabular-nums text-accent-dark",
          labelShift(valuePct)
        )}
        style={{ left: `${valuePct}%` }}
      >
        ce bien · {formatValue(value)}
      </div>
      {/* Piste + bande P25→P75 */}
      <div className="absolute inset-x-0 top-[26px] h-1.5 rounded-full bg-line-soft">
        <div
          className="absolute inset-y-0 rounded-full bg-accent-border"
          style={{ left: `${bandLeft}%`, width: `${bandRight - bandLeft}%` }}
        />
        {/* Tick médiane */}
        <div
          className="absolute top-1/2 h-[14px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-dark"
          style={{ left: `${medianPct}%` }}
        />
        {/* Point « ce bien » avec halo blanc */}
        <div
          className="absolute top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-dark ring-2 ring-white"
          style={{ left: `${valuePct}%` }}
        />
      </div>
      {/* Repères P25 / médiane / P75 sous la piste */}
      {markers.map((m) => (
        <div
          key={m.label}
          className={cn(
            "absolute bottom-0 whitespace-nowrap text-[11px] tabular-nums text-ink-3",
            labelShift(m.p)
          )}
          style={{ left: `${m.p}%` }}
        >
          {m.label} {formatValue(m.v)}
        </div>
      ))}
    </div>
  )
}
