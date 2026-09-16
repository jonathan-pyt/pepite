import { useRef, useState } from "react"
import { HistoryImportError, type Report } from "@pepite/core"

import { commitImport, exportHistory, prepareImport, type ImportPreview } from "@/lib/history-io"
import type { ImportDialog } from "@/entrypoints/historique/import-dialog-view"

export interface UseHistoryImportExport {
  /** Ref à poser sur l'`<input type="file">` caché. */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  /** Handler `onChange` de l'input : lit le fichier et ouvre le bon dialogue. */
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  /** Déclenche la boîte de dialogue système de choix de fichier. */
  openImportPicker: () => void
  /** Télécharge tout l'historique en JSON. */
  onExport: () => void
  /** État du dialogue import (erreur / récap / conflit), null si fermé. */
  dialog: ImportDialog
  closeDialog: () => void
  /** Persiste un sous-ensemble de rapports puis affiche le récapitulatif. */
  applyImport: (reports: Report[], ignored: number) => Promise<void>
}

/**
 * useHistoryImportExport — logique export/import de la page Historique.
 *
 * Sort d'`App` la machine à états du dialogue et le pilotage de l'input fichier ;
 * la page ne garde que le placement des boutons et le rendu du dialogue.
 * S'appuie sur `lib/history-io` (glu DOM/IDB) et recharge la liste via `reload`
 * après une écriture.
 */
export function useHistoryImportExport(reload: () => Promise<void>): UseHistoryImportExport {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dialog, setDialog] = useState<ImportDialog>(null)

  async function applyImport(reports: Report[], ignored: number) {
    await commitImport(reports)
    await reload()
    setDialog({ mode: "recap", imported: reports.length, ignored })
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Réinitialise pour permettre de réimporter le même fichier ensuite.
    e.target.value = ""
    if (!file) return
    let preview: ImportPreview
    try {
      preview = await prepareImport(file)
    } catch (err) {
      setDialog({
        mode: "error",
        message: err instanceof HistoryImportError ? err.message : "Fichier illisible.",
      })
      return
    }
    if (preview.doublons.length === 0) {
      await applyImport(preview.nouveaux, 0)
    } else {
      setDialog({ mode: "conflict", preview })
    }
  }

  return {
    fileInputRef,
    onFileChange,
    openImportPicker: () => fileInputRef.current?.click(),
    onExport: () => void exportHistory(),
    dialog,
    closeDialog: () => setDialog(null),
    applyImport,
  }
}
