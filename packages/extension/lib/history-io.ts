import { browser } from "wxt/browser"
import { buildExport, parseImport, type Report } from "@pepite/core"

import { idbRepository } from "@/lib/repository-idb"

// Glu DOM / IndexedDB de l'export-import ; la (dé)sérialisation vit dans core.

/** Répartition d'un import : rapports inédits vs déjà présents (par `id`). */
export interface ImportPreview {
  nouveaux: Report[]
  doublons: Report[]
}

/** Exporte tout l'historique (toutes versions) dans un fichier JSON téléchargé. */
export async function exportHistory(): Promise<void> {
  const reports = await idbRepository.listReports()
  // Un seul instant pour l'`exportedAt` (ISO UTC) et le nom de fichier (local).
  const now = new Date()
  const envelope = buildExport(reports, {
    appVersion: browser.runtime.getManifest().version,
    exportedAt: now.toISOString(),
  })
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const a = document.createElement("a")
  a.href = url
  a.download = `pepite-historique-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Lit et valide un fichier d'export, puis répartit les rapports en inédits /
 * doublons par rapport au stockage local. Lève `HistoryImportError` (via
 * `parseImport`) si le fichier est invalide — aucune écriture n'a lieu ici.
 */
export async function prepareImport(file: File): Promise<ImportPreview> {
  const { reports } = parseImport(await file.text())
  const existingIds = new Set((await idbRepository.listReports()).map((r) => r.id))
  const nouveaux: Report[] = []
  const doublons: Report[] = []
  for (const report of reports) {
    if (existingIds.has(report.id)) doublons.push(report)
    else nouveaux.push(report)
  }
  return { nouveaux, doublons }
}

/** Persiste les rapports choisis dans le stockage local (`put` par `id`). */
export async function commitImport(reports: Report[]): Promise<void> {
  await Promise.all(reports.map((report) => idbRepository.saveReport(report)))
}
