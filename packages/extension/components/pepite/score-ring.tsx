import * as React from "react"

export interface ScoreRingProps {
  score: number
  size?: number
  stroke?: number
  sub?: string
}

/** Returns the Tailwind text-color class for a given score. */
export function scoreColorClass(score: number): string {
  if (score >= 65) return "text-green-600"
  if (score >= 45) return "text-amber-600"
  return "text-red-600"
}

/** Returns the hex color for a given score (matches scoreColor in shared.jsx). */
function scoreColor(score: number): string {
  if (score >= 65) return "#16a34a"
  if (score >= 45) return "#d97706"
  return "#dc2626"
}

/**
 * ScoreRing — SVG donut ring showing a score 0–100.
 * Track is #ececef; fill arc is colored by score threshold.
 * Score number is centered in bold; optional sub label below.
 */
export function ScoreRing({ score, size = 56, stroke = 5, sub }: ScoreRingProps) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const col = scoreColor(score)

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      {/* SVG rotated -90° so the arc starts at 12 o'clock */}
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#ececef"
          strokeWidth={stroke}
        />
        {/* Fill arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        />
      </svg>

      {/* Centered label overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontSize: size * 0.3,
            fontWeight: 700,
            color: "#18181b",
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score}
        </span>
        {sub && (
          <span
            style={{
              fontSize: size * 0.14,
              color: "#8e8e98",
              marginTop: 2,
            }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}
