import { useState } from "react"
import type { Enrichments, Listing, QuickAnalysis } from "@pepite/core"
import { buildAnalysisPrompt } from "@pepite/core"

export interface UseCopyPrompt {
  /** Vrai pendant ~2 s après une copie réussie. */
  copied: boolean
  /** Copie le prompt d'analyse complet dans le presse-papiers. */
  copyPrompt: () => Promise<void>
}

/**
 * useCopyPrompt — logique du bouton « Copier le prompt » (side panel et rapport).
 *
 * Construit le prompt d'analyse complet (annonce, marché DVF, enrichissements
 * disponibles) via buildAnalysisPrompt et le copie, pour que l'utilisateur le
 * colle dans l'IA de son choix — aucune clé API requise.
 */
export function useCopyPrompt(
  listing: Listing | null,
  quick: QuickAnalysis | null,
  enrichments?: Enrichments | null,
): UseCopyPrompt {
  const [copied, setCopied] = useState(false)

  async function copyPrompt() {
    if (!listing || !quick) return
    await navigator.clipboard.writeText(buildAnalysisPrompt(listing, quick, enrichments ?? undefined))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return { copied, copyPrompt }
}
