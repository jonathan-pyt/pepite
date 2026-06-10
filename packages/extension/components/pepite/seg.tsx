import * as React from "react"

export interface SegProps {
  options: string[]
  value: string
  onChange?: (value: string) => void
  size?: "md" | "sm"
  grow?: boolean
}

/**
 * Seg — segmented control.
 * Container: bg #f1f1f3, radius 8, padding 3px, border #ededf0.
 * Active segment: white bg, subtle shadow, font-weight 600.
 * Inactive: transparent bg, gray text.
 */
export function Seg({ options, value, onChange, size = "md", grow }: SegProps) {
  const fontSize = size === "sm" ? 11.5 : 12.5

  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 3,
        background: "#f1f1f3",
        borderRadius: 8,
        border: "1px solid #ededf0",
      }}
    >
      {options.map((option) => {
        const isActive = option === value
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange?.(option)}
            style={{
              flex: grow ? 1 : "none",
              padding: size === "sm" ? "4px 8px" : "5px 10px",
              fontSize,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "#18181b" : "#52525b",
              background: isActive ? "#ffffff" : "transparent",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              boxShadow: isActive
                ? "0 1px 2px rgba(24,24,27,.08)"
                : "none",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
