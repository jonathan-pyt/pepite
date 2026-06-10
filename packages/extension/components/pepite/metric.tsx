import * as React from "react"

type Tone = "good" | "warn" | "bad" | "accent"

export interface MetricProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: Tone
  big?: boolean
}

const toneColors: Record<Tone, string> = {
  good: "#16a34a",
  warn: "#d97706",
  bad: "#dc2626",
  accent: "#0f766e",
}

/**
 * Metric — small stat card.
 * bg zinc-50 (#fafafa), border #ededf0, radius 8, 11px gray label,
 * 16/19px bold tabular-nums value, tone-colored value.
 */
export function Metric({ label, value, sub, tone, big = false }: MetricProps) {
  const valueColor = tone ? toneColors[tone] : "#18181b"

  return (
    <div
      style={{
        padding: big ? "12px 14px" : "10px 12px",
        background: "#fafafa",
        border: "1px solid #ededf0",
        borderRadius: 8,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#8e8e98",
          fontWeight: 560,
          marginBottom: 4,
          letterSpacing: ".01em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: big ? 19 : 16,
          fontWeight: 680,
          color: valueColor,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub != null && (
        <div
          style={{
            fontSize: 10.5,
            color: "#8e8e98",
            marginTop: 3,
            lineHeight: 1.4,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
