import { useRef, useState } from "react";
import { browser } from "wxt/browser";
import { Download, GitCompareArrows, ImageOff, Trash2, Upload } from "lucide-react";
import { HistoryImportError, type Report } from "@pepite/core";
import { PageShell, PepiteLogo, ScoreRing, scoreColorClass } from "@/components/pepite";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { commitImport, exportHistory, prepareImport, type ImportPreview } from "@/lib/history-io";
import { MAX_COMPARE, useHistory, type HistoryGroup } from "@/lib/hooks/use-history";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ---------- Carte d'un bien analysé ---------- */
interface HistoryCardProps {
  group: HistoryGroup;
  selected: boolean;
  /** Checkbox désactivée quand MAX_COMPARE biens sont déjà cochés. */
  selectionFull: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
}

function HistoryCard({ group, selected, selectionFull, onToggleSelect, onDelete }: HistoryCardProps) {
  const { latest, versions } = group;
  const { listing, quick, globalScore } = latest;

  const photo = listing.photos[0];
  const city = listing.location.city ?? listing.location.rawAddress;
  const analyzedAt = formatDate(latest.createdAt);

  // Pattern side panel : score global si disponible, sinon score prix.
  const displayScore = globalScore?.score ?? quick.score;
  const displayLabel = globalScore !== undefined ? "Score global" : "Score prix";

  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-white px-4 py-3.5 shadow-pepite-card">
      <Checkbox
        checked={selected}
        disabled={!selected && selectionFull}
        onCheckedChange={onToggleSelect}
        aria-label={`Sélectionner « ${listing.title} » pour la comparaison`}
      />

      {/* Photo (1ʳᵉ de l'annonce, fallback bloc neutre) */}
      {photo ? (
        <img
          src={photo}
          alt=""
          className="h-[72px] w-[104px] shrink-0 rounded-lg border border-line-soft object-cover"
        />
      ) : (
        <div className="grid h-[72px] w-[104px] shrink-0 place-items-center rounded-lg border border-line-soft bg-surface-2">
          <ImageOff className="size-[18px] text-ink-3" />
        </div>
      )}

      {/* Infos */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
            {listing.title}
          </span>
          {versions > 1 && (
            <span className="shrink-0 rounded-md border border-line-soft bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-3">
              {versions} analyses
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          <span className="truncate">{city}</span>
          <span className="text-line">·</span>
          <span className="font-semibold text-ink tabular-nums">
            {listing.price.toLocaleString("fr-FR")} €
          </span>
        </div>
        <div className="mt-1 text-[10.5px] text-ink-3">
          Analysé le {analyzedAt} · {latest.provider}/{latest.model}
        </div>
      </div>

      {/* Score */}
      {displayScore !== null ? (
        <div className="flex shrink-0 flex-col items-center gap-1">
          <ScoreRing score={displayScore} size={54} stroke={5} sub="/100" />
          <span className={`text-center text-[10.5px] font-semibold ${scoreColorClass(displayScore)}`}>
            {displayLabel}
          </span>
        </div>
      ) : (
        <div className="flex size-[54px] shrink-0 items-center justify-center rounded-full border border-line-soft bg-surface-sub text-lg font-semibold text-ink-3">
          —
        </div>
      )}

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5 border-l border-line-soft pl-4">
        <Button variant="secondary" size="sm" asChild>
          <a href={browser.runtime.getURL(`/rapport.html?id=${latest.id}`)}>
            Voir le rapport
          </a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Supprimer cette analyse"
              className="text-ink-3 hover:bg-bad-soft hover:text-bad"
            >
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette analyse ?</AlertDialogTitle>
              <AlertDialogDescription>
                {versions > 1
                  ? `L'analyse du ${analyzedAt} sera supprimée — la carte affichera l'analyse précédente de ce bien (${versions - 1} restante${versions > 2 ? "s" : ""}).`
                  : "Le rapport de ce bien sera définitivement supprimé de l'historique."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="border-bad bg-bad hover:bg-bad/90"
                onClick={onDelete}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

/* ---------- État du dialogue d'import (union discriminée) ---------- */
type ImportDialog =
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

function ImportDialogView({ dialog, onClose, onApply }: ImportDialogViewProps) {
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

/* ---------- Page ---------- */
export default function App() {
  const { groups, selectedIds, toggleSelect, deleteReport, reload } = useHistory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<ImportDialog>(null);

  if (groups === null) return null;

  /** Applique un sous-ensemble de rapports puis affiche le récapitulatif. */
  async function applyImport(reports: Report[], ignored: number) {
    await commitImport(reports);
    await reload();
    setDialog({ mode: "recap", imported: reports.length, ignored });
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Réinitialise pour permettre de réimporter le même fichier ensuite.
    e.target.value = "";
    if (!file) return;
    let preview: ImportPreview;
    try {
      preview = await prepareImport(file);
    } catch (err) {
      setDialog({
        mode: "error",
        message: err instanceof HistoryImportError ? err.message : "Fichier illisible.",
      });
      return;
    }
    if (preview.doublons.length === 0) {
      await applyImport(preview.nouveaux, 0);
    } else {
      setDialog({ mode: "conflict", preview });
    }
  }

  return (
    <PageShell
      breadcrumb="Historique"
      maxWidth="rapport"
      logoHref={browser.runtime.getURL("/historique.html")}
      topRight={
        <div className="flex items-center gap-3">
          {groups.length > 0 && (
            <span>
              {groups.length} bien{groups.length > 1 ? "s" : ""} analysé{groups.length > 1 ? "s" : ""}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void exportHistory()}
              disabled={groups.length === 0}
            >
              <Download />
              Exporter
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload />
              Importer
            </Button>
          </div>
        </div>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => void onFileChange(e)}
      />

      <ImportDialogView
        dialog={dialog}
        onClose={() => setDialog(null)}
        onApply={(reports, ignored) => void applyImport(reports, ignored)}
      />

      {groups.length === 0 ? (
        /* État vide */
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white px-8 py-16 text-center shadow-pepite-card">
          <PepiteLogo size="lg" />
          <p className="max-w-[360px] text-[12.5px] leading-relaxed text-ink-3">
            Aucune analyse pour l&apos;instant. Lance une analyse complète depuis le
            side panel sur une annonce immobilière — elle apparaîtra ici.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 px-0.5 text-[11.5px] text-ink-3">
            Coche jusqu&apos;à {MAX_COMPARE} biens pour les comparer côte à côte.
          </p>
          <div className="flex flex-col gap-3 pb-20">
            {groups.map((group) => (
              <HistoryCard
                key={group.latest.listingUrl}
                group={group}
                selected={selectedIds.includes(group.latest.id)}
                selectionFull={selectedIds.length >= MAX_COMPARE}
                onToggleSelect={() => toggleSelect(group.latest.id)}
                onDelete={() => void deleteReport(group.latest.id)}
              />
            ))}
          </div>

          {/* Barre de comparaison sticky */}
          {selectedIds.length > 0 && (
            <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-pepite-lg">
              <span className="text-[12.5px] font-medium text-ink-2">
                {selectedIds.length} bien{selectedIds.length > 1 ? "s" : ""} sélectionné
                {selectedIds.length > 1 ? "s" : ""}
                {selectedIds.length < 2 && " — sélectionne-en au moins 2"}
              </span>
              {selectedIds.length < 2 ? (
                <Button disabled>
                  <GitCompareArrows />
                  Comparer ({selectedIds.length})
                </Button>
              ) : (
                <Button asChild>
                  <a
                    href={browser.runtime.getURL(
                      `/comparateur.html?ids=${selectedIds.join(",")}`,
                    )}
                  >
                    <GitCompareArrows />
                    Comparer ({selectedIds.length})
                  </a>
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
