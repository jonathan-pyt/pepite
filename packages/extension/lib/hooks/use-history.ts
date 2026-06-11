import { useCallback, useEffect, useState } from "react"
import type { Report } from "@pepite/core"

import { idbRepository } from "@/lib/repository-idb"

/** Nombre maximal de biens sélectionnables pour la comparaison. */
export const MAX_COMPARE = 3

/** Un bien de l'historique : rapport le plus récent + nombre de versions. */
export interface HistoryGroup {
  /** Rapport le plus récent pour cette annonce (celui affiché sur la carte). */
  latest: Report
  /** Nombre total d'analyses persistées pour cette annonce. */
  versions: number
}

export interface UseHistory {
  /** null = chargement en cours. */
  groups: HistoryGroup[] | null
  /** Ids des rapports sélectionnés pour comparaison (≤ MAX_COMPARE). */
  selectedIds: string[]
  toggleSelect: (reportId: string) => void
  /**
   * Supprime UNIQUEMENT le rapport affiché (le plus récent du groupe).
   * Choix UX : si d'autres versions du même bien existent, la carte
   * retombe sur la version précédente au lieu de disparaître — on ne
   * purge jamais tout l'historique d'un bien en un clic.
   */
  deleteReport: (reportId: string) => Promise<void>
}

/**
 * useHistory — état de la page Historique.
 *
 * Charge tous les rapports, les trie par date décroissante puis les groupe
 * par listingUrl (1 carte par bien, rapport le plus récent en tête).
 * Gère aussi la sélection multi (max MAX_COMPARE) pour le comparateur.
 */
export function useHistory(): UseHistory {
  const [groups, setGroups] = useState<HistoryGroup[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const reload = useCallback(async () => {
    const reports = await idbRepository.listReports()
    reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    // Groupement par annonce : la liste étant triée desc, le premier rapport
    // rencontré pour une URL est le plus récent.
    const byUrl = new Map<string, HistoryGroup>()
    for (const report of reports) {
      const group = byUrl.get(report.listingUrl)
      if (group) group.versions += 1
      else byUrl.set(report.listingUrl, { latest: report, versions: 1 })
    }
    setGroups([...byUrl.values()])
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const toggleSelect = useCallback((reportId: string) => {
    setSelectedIds((ids) =>
      ids.includes(reportId)
        ? ids.filter((id) => id !== reportId)
        : ids.length >= MAX_COMPARE
          ? ids
          : [...ids, reportId],
    )
  }, [])

  const deleteReport = useCallback(
    async (reportId: string) => {
      await idbRepository.deleteReport(reportId)
      setSelectedIds((ids) => ids.filter((id) => id !== reportId))
      await reload()
    },
    [reload],
  )

  return { groups, selectedIds, toggleSelect, deleteReport }
}
