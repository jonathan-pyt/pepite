import * as React from "react"

import { cn } from "@/lib/utils"
import { PepiteLogo } from "./pepite-logo"

export interface PageShellProps {
  /** Libellé fil d'Ariane affiché après le logo (ex. « Réglages »). */
  breadcrumb?: string
  /** Contenu aligné à droite de la barre supérieure (ex. date de génération). */
  topRight?: React.ReactNode
  /** Largeur maximale de la colonne de contenu. */
  maxWidth?: "options" | "rapport"
  /** Rend le logo cliquable (lien même onglet vers le hub Historique). */
  logoHref?: string
  children: React.ReactNode
}

const maxWidthClass: Record<NonNullable<PageShellProps["maxWidth"]>, string> = {
  options: "max-w-[560px] px-6 py-10",
  rapport: "max-w-[880px] px-5 pt-6 pb-12",
}

/**
 * PageShell — fond de page + barre supérieure (logo + fil d'Ariane) partagés
 * par les écrans Réglages et Rapport.
 */
export function PageShell({
  breadcrumb,
  topRight,
  maxWidth = "options",
  logoHref,
  children,
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-page">
      <div className="sticky top-0 z-10 flex h-[52px] items-center gap-3.5 border-b border-line bg-white px-7">
        <PepiteLogo size="md" href={logoHref} />
        {breadcrumb && (
          <>
            <span className="text-line">/</span>
            <span className="text-[13px] font-medium text-ink-3">{breadcrumb}</span>
          </>
        )}
        {topRight && (
          <div className="ml-auto text-xs text-ink-3">{topRight}</div>
        )}
      </div>

      <div className={cn("mx-auto", maxWidthClass[maxWidth])}>{children}</div>
    </div>
  )
}
