import * as React from "react"

import { cn } from "@/lib/utils"

type Tone = "good" | "warn" | "bad" | "accent"

export interface MetricProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: Tone
  big?: boolean
}

const toneClass: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  accent: "text-accent-dark",
}

/**
 * Metric — small stat card.
 * Fond surface-sub, bordure line-soft, radius 8, label 11px ink-3,
 * valeur 16/19px bold tabular-nums (couleur selon `tone`).
 */
export function Metric({ label, value, sub, tone, big = false }: MetricProps) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-line-soft bg-surface-sub",
        big ? "px-3.5 py-3" : "px-3 py-2.5"
      )}
    >
      <div className="mb-1 text-[11px] font-medium tracking-[0.01em] text-ink-3">
        {label}
      </div>
      <div
        className={cn(
          "font-bold leading-[1.1] tracking-[-0.02em] tabular-nums",
          big ? "text-[19px]" : "text-base",
          tone ? toneClass[tone] : "text-ink"
        )}
      >
        {value}
      </div>
      {sub != null && (
        <div className="mt-[3px] text-[10.5px] leading-[1.4] text-ink-3 tabular-nums">
          {sub}
        </div>
      )}
    </div>
  )
}
