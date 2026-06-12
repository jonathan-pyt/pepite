import { useState } from "react";
import { DEFAULT_MODELS, type LlmProviderId } from "@pepite/core";
import { ClipboardCopy, DatabaseZap, KeyRound, Sparkles, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, PageShell, Seg } from "@/components/pepite";
import { useLocalData } from "@/lib/hooks/use-local-data";
import { SEARCH_PROFILE_PLACEHOLDER } from "@/lib/hooks/use-search-profile";
import { useSettings } from "@/lib/hooks/use-settings";

const PROVIDERS: { id: LlmProviderId; label: string }[] = [
  { id: "google", label: "Google Gemini" },
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "openai", label: "OpenAI" },
];

const TABS = ["Général", "Données locales"] as const;

/* ── Onglet Général : projet + analyse IA ─────────────────────────────────── */

function GeneralTab() {
  const { settings, setSettings, save, saved } = useSettings();
  if (!settings) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Bloc 1 : votre projet (profil de recherche persistant) ── */}
      <Card>
        <CardHeader className="border-b border-line-soft">
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-[16px] text-ink-3" />
            Votre projet
          </CardTitle>
          <CardDescription>
            Décrivez votre foyer, vos impératifs et votre intention : chaque analyse IA
            s&apos;y adaptera. Facultatif, modifiable à tout moment (aussi depuis le panneau
            Pépite).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Textarea
            value={settings.searchProfile}
            onChange={(e) => setSettings({ ...settings, searchProfile: e.target.value })}
            placeholder={SEARCH_PROFILE_PLACEHOLDER}
            className="min-h-[96px]"
          />
        </CardContent>
      </Card>

      {/* ── Bloc 2 : analyse IA — deux modes (clé optionnelle) ── */}
      <Card>
        <CardHeader className="border-b border-line-soft">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-[16px] text-ink-3" />
            Analyse IA
          </CardTitle>
          <CardDescription>
            Le score prix vs marché fonctionne sans aucune configuration. Pour
            l&apos;analyse IA détaillée, deux modes au choix :
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="flex items-start gap-2.5 rounded-lg border border-line-soft bg-surface-sub px-3.5 py-3">
              <KeyRound className="mt-0.5 size-[14px] shrink-0 text-ink-3" />
              <div className="text-[12.5px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">Avec votre clé API</span> — analyses
                intégrées en un clic, directement dans Pépite.
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-line-soft bg-surface-sub px-3.5 py-3">
              <ClipboardCopy className="mt-0.5 size-[14px] shrink-0 text-ink-3" />
              <div className="text-[12.5px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">Sans clé</span> — bouton « Copier le
                prompt » à coller dans votre IA habituelle (ChatGPT, Claude…).
              </div>
            </div>
          </div>
          <Field label="Fournisseur" htmlFor="provider">
            <Select
              value={settings.provider}
              onValueChange={(v) => {
                const provider = v as LlmProviderId;
                setSettings({ ...settings, provider, model: DEFAULT_MODELS[provider] });
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Clé API (optionnelle)"
            htmlFor="api-key"
            hint={
              <>
                Stockée en local sur cette machine, jamais synchronisée — aucun serveur
                Pépite. Clé Gemini gratuite sur{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-2 underline"
                >
                  Google AI Studio
                </a>
                .
              </>
            }
          >
            <Input
              id="api-key"
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="sk-…"
            />
          </Field>

          <Field label="Modèle" htmlFor="model">
            <Input
              id="model"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <div>
        <Button onClick={save}>{saved ? "Enregistré ✓" : "Enregistrer"}</Button>
      </div>
    </div>
  );
}

/* ── Onglet Données locales : compteurs + purges ──────────────────────────── */

function DataRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line-soft py-2 last:border-b-0">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <span className="text-[14px] font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}

function LocalDataTab() {
  const { counts, clearCaches, cachesCleared, clearAll, allCleared } = useLocalData();
  if (!counts) return null;

  const isEmpty = counts.reports === 0 && counts.restyles === 0 && counts.cache === 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="border-b border-line-soft">
          <CardTitle className="flex items-center gap-2">
            <DatabaseZap className="size-[16px] text-ink-3" />
            Données locales
          </CardTitle>
          <CardDescription>
            Tout est stocké dans votre navigateur — aucun serveur Pépite. Désinstaller
            l&apos;extension efface tout.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col pt-2">
          <DataRow label="Analyses enregistrées" value={counts.reports} />
          <DataRow label="Restyles IA" value={counts.restyles} />
          <DataRow label="Caches (marché, quartier, risques…)" value={counts.cache} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="secondary"
          disabled={counts.cache === 0 && !cachesCleared}
          onClick={() => void clearCaches()}
        >
          <DatabaseZap />
          {cachesCleared ? "Caches vidés ✓" : "Vider les caches"}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              disabled={isEmpty && !allCleared}
              className="text-bad hover:text-bad"
            >
              <Trash2 />
              {allCleared ? "Données effacées ✓" : "Tout effacer"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Effacer toutes les données locales ?</AlertDialogTitle>
              <AlertDialogDescription>
                Analyses, restyles, annonces mémorisées et caches seront définitivement
                supprimés. Vos réglages (clé API, projet) sont conservés. Cette action est
                irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => void clearAll()}>
                Tout effacer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-3">
        Vider les caches force le re-téléchargement des données marché, quartier et risques à
        la prochaine analyse — utile si une donnée semble périmée.
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Général");

  return (
    <PageShell breadcrumb="Réglages">
      <div className="flex flex-col gap-5">
        <div className="max-w-[340px]">
          <Seg options={[...TABS]} value={tab} onChange={(v) => setTab(v as (typeof TABS)[number])} grow />
        </div>
        {tab === "Général" ? <GeneralTab /> : <LocalDataTab />}
      </div>
    </PageShell>
  );
}
