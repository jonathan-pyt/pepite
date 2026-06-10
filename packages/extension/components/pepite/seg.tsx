import * as React from "react"

import { cn } from "@/lib/utils"

export interface SegProps {
  options: string[]
  value: string
  onChange?: (value: string) => void
  size?: "md" | "sm"
  grow?: boolean
}

/**
 * Seg — contrôle segmenté.
 * Piste : fond seg-track, radius 8, bordure line-soft.
 * Segment actif : fond blanc, ombre légère, semibold.
 */
export function Seg({ options, value, onChange, size = "md", grow }: SegProps) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-line-soft bg-seg-track p-[3px]">
      {options.map((option) => {
        const isActive = option === value
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange?.(option)}
            className={cn(
              "cursor-pointer rounded-[5px] leading-tight whitespace-nowrap transition-colors",
              grow ? "flex-1" : "flex-none",
              size === "sm" ? "px-2 py-1 text-[11.5px]" : "px-2.5 py-[5px] text-[12.5px]",
              isActive
                ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(24,24,27,.08)]"
                : "font-medium text-ink-2"
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
