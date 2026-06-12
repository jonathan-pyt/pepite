import { useEffect, useState } from "react"

import { clearAllData, clearCache, countLocalData } from "@/lib/repository-idb"

export interface UseLocalData {
  /** Compteurs des stores locaux ; `null` tant que non chargés. */
  counts: { reports: number; restyles: number; cache: number } | null
  /** Vide uniquement les caches (marché, quartier, risques…). */
  clearCaches: () => Promise<void>
  /** Vrai pendant ~2 s après un vidage des caches. */
  cachesCleared: boolean
  /** Efface TOUTES les données locales (irréversible). */
  clearAll: () => Promise<void>
  /** Vrai pendant ~2 s après un effacement complet. */
  allCleared: boolean
}

/** useLocalData — compteurs et actions de l'onglet « Données locales » des réglages. */
export function useLocalData(): UseLocalData {
  const [counts, setCounts] = useState<UseLocalData["counts"]>(null)
  const [cachesCleared, setCachesCleared] = useState(false)
  const [allCleared, setAllCleared] = useState(false)

  async function refresh() {
    setCounts(await countLocalData())
  }

  useEffect(() => {
    void refresh().catch(() => {})
  }, [])

  async function clearCaches() {
    await clearCache()
    await refresh()
    setCachesCleared(true)
    setTimeout(() => setCachesCleared(false), 2000)
  }

  async function clearAll() {
    await clearAllData()
    await refresh()
    setAllCleared(true)
    setTimeout(() => setAllCleared(false), 2000)
  }

  return { counts, clearCaches, cachesCleared, clearAll, allCleared }
}
