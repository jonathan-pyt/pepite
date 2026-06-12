import * as React from "react"

import { cn } from "@/lib/utils"

import { toneClass, type Tone } from "./metric"

export interface StatStripItem {
  label: string
  value: React.ReactNode
  tone?: Tone
}

export interface StatStripProps {
  items: StatStripItem[]
  /** Ligne de contexte en bas du conteneur, séparée par un trait fin. */
  context?: React.ReactNode
  /** Zone optionnelle sous la rangée de stats (ex. jauge de position). */
  children?: React.ReactNode
}

/**
 * StatStrip — barre de stats unique : une rangée d'items séparés par des
 * traits verticaux, une zone optionnelle (jauge) puis une ligne de contexte.
 * Label 11.5px ink-3, valeur 22px semibold tabular-nums (couleur selon tone).
 */
export function StatStrip({ items, context, children }: StatStripProps) {
  return (
    <div className="rounded-xl border border-line-soft bg-surface-sub px-5 py-4">
      <div className="flex flex-wrap items-stretch gap-x-5 gap-y-3">
        {items.map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <div aria-hidden className="w-px self-stretch bg-line-soft" />}
            <div className="min-w-[130px] flex-1">
              <div className="text-[11.5px] font-medium tracking-[0.01em] text-ink-3">
                {item.label}
              </div>
              <div
                className={cn(
                  "mt-1 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums",
                  item.tone ? toneClass[item.tone] : "text-ink"
                )}
              >
                {item.value}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      {children != null && children !== false && <div className="mt-4">{children}</div>}
      {context != null && (
        <div className="mt-4 border-t border-line-soft pt-3 text-[11.5px] leading-relaxed text-ink-3 tabular-nums">
          {context}
        </div>
      )}
    </div>
  )
}
