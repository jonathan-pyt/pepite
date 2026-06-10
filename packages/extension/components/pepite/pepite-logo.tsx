import * as React from "react"

import { cn } from "@/lib/utils"

export type PepiteLogoSize = "sm" | "md" | "lg"

export interface PepiteLogoProps {
  /** Taille logique : sm (barre latérale), md (barres options/rapport), lg (écran vide). */
  size?: PepiteLogoSize
  withText?: boolean
  className?: string
}

const iconSize: Record<PepiteLogoSize, string> = {
  sm: "size-5", // 20px
  md: "size-[21px]",
  lg: "size-9", // 36px
}

const textSize: Record<PepiteLogoSize, string> = {
  sm: "text-[14px]",
  md: "text-[14.5px]",
  lg: "text-lg",
}

/**
 * PepiteLogo — losange dans carré arrondi (asset de marque) + libellé « Pépite ».
 * Carré teal accent, facette haute teal clair. Couleurs de marque conservées en SVG.
 */
export function PepiteLogo({
  size = "md",
  withText = true,
  className,
}: PepiteLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        className={cn("block shrink-0", iconSize[size])}
        aria-hidden="true"
      >
        {/* Carré arrondi teal */}
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#0d9488" />
        {/* Corps du losange — blanc */}
        <path d="M12 6.2 17 11l-5 6.8L7 11z" fill="#ffffff" />
        {/* Facette haute — teal clair */}
        <path d="M12 6.2 17 11h-10z" fill="#ccfbf1" />
      </svg>

      {withText && (
        <span
          className={cn(
            "font-semibold tracking-[-0.02em] text-ink",
            textSize[size]
          )}
        >
          Pépite
        </span>
      )}
    </div>
  )
}
