import * as React from "react"

type WarnTone = "warn" | "bad" | "info"

export interface WarnItemProps {
  tone?: WarnTone
  title: string
  sub?: string
}

/** Triangle-warning SVG path (16px viewBox) matching shared.jsx PATHS.warn */
function WarnIcon({ color }: { color: string }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M8 2.2 14.4 13H1.6L8 2.2Z M8 6.5v3 M8 11.6v.2"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Eye SVG path (16px viewBox) matching shared.jsx PATHS.eye */
function EyeIcon({ color }: { color: string }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8Z M8 9.8a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const toneColors: Record<WarnTone, string> = {
  bad: "#dc2626",
  info: "#0f766e",
  warn: "#d97706",
}

/**
 * WarnItem — vigilance line with icon (warning triangle or eye), title, optional sub.
 * Tone "bad" → red, "info" → teal (eye icon), "warn" → amber (default).
 */
export function WarnItem({ tone = "warn", title, sub }: WarnItemProps) {
  const col = toneColors[tone]

  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      <div style={{ marginTop: 1.5 }}>
        {tone === "info" ? (
          <EyeIcon color={col} />
        ) : (
          <WarnIcon color={col} />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 560,
            color: "#18181b",
            lineHeight: 1.45,
          }}
        >
          {title}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 11.5,
              color: "#8e8e98",
              lineHeight: 1.5,
              marginTop: 1,
            }}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}
