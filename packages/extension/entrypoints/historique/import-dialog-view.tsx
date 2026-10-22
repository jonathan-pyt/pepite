import type { Report } from "@pepite/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/lib/format";
import type { ImportPreview } from "@/lib/history-io";

/* ---------- État du dialogue d'import (union discriminée) ---------- */
export type ImportDialog =
  | { mode: "error"; message: string }
  | { mode: "recap"; imported: number; ignored: number }
  | { mode: "conflict"; preview: ImportPreview }
  | null;

/* ---------- Dialogue d'import (erreur / récap / choix de doublons) ---------- */
interface ImportDialogViewProps {
  dialog: ImportDialog;
  onClose: () => void;
  onApply: (reports: Report[], ignored: number) => void;
}

export function ImportDialogView({ dialog, onClose, onApply }: ImportDialogViewProps) {
  return (
    <AlertDialog
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {dialog && (
        <AlertDialogContent>
          {dialog.mode === "error" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Import impossible</AlertDialogTitle>
                <AlertDialogDescription>{dialog.message}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>Fermer</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {dialog.mode === "recap" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Import terminé</AlertDialogTitle>
                <AlertDialogDescription>
                  {dialog.imported} rapport{dialog.imported > 1 ? "s" : ""} importé
                  {dialog.imported > 1 ? "s" : ""}
                  {dialog.ignored > 0
                    ? ` — ${dialog.ignored} ignoré${dialog.ignored > 1 ? "s" : ""} (déjà présent${dialog.ignored > 1 ? "s" : ""}).`
                    : "."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>Fermer</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {dialog.mode === "conflict" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Des analyses sont déjà présentes</AlertDialogTitle>
                <AlertDialogDescription>
                  {dialog.preview.doublons.length} rapport
                  {dialog.preview.doublons.length > 1 ? "s" : ""} du fichier existe
                  {dialog.preview.doublons.length > 1 ? "nt" : ""} déjà dans ton historique
                  {dialog.preview.nouveaux.length > 0
                    ? `, ${dialog.preview.nouveaux.length} nouveau${dialog.preview.nouveaux.length > 1 ? "x" : ""}.`
                    : "."}{" "}
                  Que faire des doublons ?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
                {dialog.preview.doublons.map((report) => (
                  <li key={report.id} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="truncate">{report.listing.title}</span>
                    <span className="shrink-0 text-ink-3 tabular-nums">{formatDate(report.createdAt)}</span>
                  </li>
                ))}
              </ul>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onApply(dialog.preview.nouveaux, dialog.preview.doublons.length)}
                >
                  Importer seulement les nouveaux ({dialog.preview.nouveaux.length})
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() =>
                    onApply([...dialog.preview.nouveaux, ...dialog.preview.doublons], 0)
                  }
                >
                  Tout remplacer ({dialog.preview.nouveaux.length + dialog.preview.doublons.length})
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
