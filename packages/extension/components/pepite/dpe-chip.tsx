import * as React from "react"

type DPELetter = "A" | "B" | "C" | "D" | "E" | "F" | "G"

export interface DPEChipProps {
  letter: DPELetter
  type?: string
  size?: "md" | "sm"
}

const dpeColors: Record<DPELetter, string> = {
  A: "#15803d",
  B: "#4d9f3c",
  C: "#a3b820",
  D: "#e8b71c",
  E: "#e88f1c",
  F: "#e25822",
  G: "#c81e1e",
}

/**
 * DPEChip — colored square chip with DPE/GES letter + small type label.
 * Size "md" = 26px square, "sm" = 20px. Letter is white bold.
 */
export function DPEChip({ letter, type = "DPE", size = "md" }: DPEChipProps) {
  const s = size === "sm" ? 20 : 26
  const bg = dpeColors[letter] ?? "#8e8e98"

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: s,
          height: s,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          background: bg,
          color: "#ffffff",
          fontWeight: 700,
          fontSize: s * 0.55,
          flexShrink: 0,
        }}
      >
        {letter}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "#8e8e98",
          fontWeight: 560,
        }}
      >
        {type}
      </span>
    </div>
  )
}
