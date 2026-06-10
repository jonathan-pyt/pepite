import * as React from "react"

import { cn } from "@/lib/utils"

type DPELetter = "A" | "B" | "C" | "D" | "E" | "F" | "G"

export interface DPEChipProps {
  letter: DPELetter
  type?: string
  size?: "md" | "sm"
}

const dpeBg: Record<DPELetter, string> = {
  A: "bg-dpe-a",
  B: "bg-dpe-b",
  C: "bg-dpe-c",
  D: "bg-dpe-d",
  E: "bg-dpe-e",
  F: "bg-dpe-f",
  G: "bg-dpe-g",
}

/**
 * DPEChip — carré coloré (lettre DPE/GES) + libellé type.
 * Size "md" = 26px, "sm" = 20px. Lettre blanche bold.
 */
export function DPEChip({ letter, type = "DPE", size = "md" }: DPEChipProps) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-md font-bold text-white",
          dpeBg[letter] ?? "bg-ink-3",
          size === "sm" ? "size-5 text-[11px]" : "size-[26px] text-[14px]"
        )}
      >
        {letter}
      </span>
      <span className="text-[11px] font-medium text-ink-3">{type}</span>
    </div>
  )
}
