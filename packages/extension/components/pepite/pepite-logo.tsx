import * as React from "react"

export interface PepiteLogoProps {
  size?: number
  withText?: boolean
  textSize?: number
  color?: string
}

/**
 * PepiteLogo — diamond-in-rounded-square SVG + "Pépite" wordmark.
 * Square: teal #0d9488, rx=6.
 * Diamond body: white. Top facet: light-teal #ccfbf1.
 */
export function PepiteLogo({
  size = 22,
  withText = true,
  textSize = 15,
  color = "#18181b",
}: PepiteLogoProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.36,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{ display: "block" }}
      >
        {/* Teal rounded-square background */}
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#0d9488" />
        {/* Diamond body — white */}
        <path d="M12 6.2 17 11l-5 6.8L7 11z" fill="#ffffff" />
        {/* Top facet — light teal */}
        <path d="M12 6.2 17 11h-10z" fill="#ccfbf1" />
      </svg>

      {withText && (
        <span
          style={{
            fontSize: textSize,
            fontWeight: 650,
            letterSpacing: "-0.02em",
            color,
          }}
        >
          Pépite
        </span>
      )}
    </div>
  )
}
