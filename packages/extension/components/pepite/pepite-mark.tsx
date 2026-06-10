import * as React from "react"

import { cn } from "@/lib/utils"

export interface PepiteMarkProps {
  /** Classe de taille (ex. size-5, size-[14px]). */
  className?: string
}

/**
 * PepiteMark — losange dans carré arrondi (asset de marque).
 * Carré teal accent, facette haute teal clair. Couleurs de marque conservées en SVG.
 */
export function PepiteMark({ className }: PepiteMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("block shrink-0", className)}
      aria-hidden="true"
    >
      {/* Carré arrondi teal */}
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#0d9488" />
      {/* Corps du losange — blanc */}
      <path d="M12 6.2 17 11l-5 6.8L7 11z" fill="#ffffff" />
      {/* Facette haute — teal clair */}
      <path d="M12 6.2 17 11h-10z" fill="#ccfbf1" />
    </svg>
  )
}
