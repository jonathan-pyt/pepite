import { useEffect, useState } from "react"
import type { Report } from "@pepite/core"

import { idbRepository } from "@/lib/repository-idb"

/** Colonne du comparateur : rapport chargé, ou null si l'id est introuvable. */
export interface CompareSlot {
  id: string
  report: Report | null
}

export interface UseCompare {
  /** null = chargement en cours ; [] = aucun id fourni dans l'URL. */
  slots: CompareSlot[] | null
}

/**
 * useCompare — état de la page Comparateur.
 *
 * Parse `?ids=id1,id2[,id3]`, charge chaque rapport depuis IndexedDB
 * (max 3 — les ids excédentaires sont ignorés) et conserve l'ordre de l'URL.
 * Un id introuvable produit un slot `report: null` (carte « introuvable »).
 */
export function useCompare(): UseCompare {
  const [slots, setSlots] = useState<CompareSlot[] | null>(null)

  useEffect(() => {
    const ids = (new URLSearchParams(location.search).get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 3)

    let cancelled = false
    void Promise.all(
      ids.map(async (id) => ({
        id,
        report: (await idbRepository.getReport(id)) ?? null,
      })),
    ).then((loaded) => {
      if (!cancelled) setSlots(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { slots }
}
