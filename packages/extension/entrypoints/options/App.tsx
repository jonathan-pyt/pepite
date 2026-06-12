import { DEFAULT_MODELS, type LlmProviderId } from "@pepite/core";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Field, PageShell } from "@/components/pepite";
import { SEARCH_PROFILE_PLACEHOLDER } from "@/lib/hooks/use-search-profile";
import { useSettings } from "@/lib/hooks/use-settings";

const PROVIDERS: { id: LlmProviderId; label: string }[] = [
  { id: "google", label: "Google Gemini" },
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "openai", label: "OpenAI" },
];

export default function App() {
  const { settings, setSettings, save, saved, clearCaches, cachesCleared } = useSettings();

  if (!settings) return null;

  return (
    <PageShell breadcrumb="Réglages">
      <div className="flex flex-col gap-6">
        {/* ── Bloc 1 : votre projet (profil de recherche persistant) ── */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Votre projet</CardTitle>
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
          <CardHeader className="border-b">
            <CardTitle>Analyse IA — deux modes</CardTitle>
            <CardDescription>
              Le score prix vs marché fonctionne sans aucune configuration. Pour
              l&apos;analyse IA détaillée, deux modes : votre clé API personnelle (analyses
              intégrées en un clic), ou — sans clé — le bouton « Copier le prompt » à coller
              dans votre IA habituelle (ChatGPT, Claude…).
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 pt-4">
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

        {/* Zone discrète : gestion des données techniques locales. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Données locales
          </span>
          <div>
            <Button variant="secondary" onClick={() => void clearCaches()}>
              <DatabaseZap />
              {cachesCleared ? "Caches vidés ✓" : "Vider les caches"}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-3">
            Données marché, quartier et risques re-téléchargées à la prochaine analyse.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
