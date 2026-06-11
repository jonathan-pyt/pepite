import * as React from "react"

import { cn } from "@/lib/utils"
import { PepiteMark } from "./pepite-mark"

export type PepiteLogoSize = "sm" | "md" | "lg"

export interface PepiteLogoProps {
  /** Taille logique : sm (barre latérale), md (barres options/rapport), lg (écran vide). */
  size?: PepiteLogoSize
  withText?: boolean
  /** Rend le logo cliquable (lien même onglet vers le hub Historique). */
  href?: string
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
 * PepiteLogo — losange PepiteMark + libellé « Pépite ».
 */
export function PepiteLogo({
  size = "md",
  withText = true,
  href,
  className,
}: PepiteLogoProps) {
  const content = (
    <>
      <PepiteMark className={iconSize[size]} />

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
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        aria-label="Pépite — ouvrir l'historique"
        className={cn("flex cursor-pointer items-center gap-2 no-underline", className)}
      >
        {content}
      </a>
    )
  }

  return <div className={cn("flex items-center gap-2", className)}>{content}</div>
}
