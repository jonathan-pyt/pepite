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
import { Field, PageShell } from "@/components/pepite";
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
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Modèle d'IA</CardTitle>
          <CardDescription>
            Ta clé reste sur cette machine — aucun serveur Pépite.
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
            label="Clé API"
            htmlFor="api-key"
            hint="Stockée en local sur cette machine, jamais synchronisée."
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

          <div>
            <Button onClick={save}>{saved ? "Enregistré ✓" : "Enregistrer"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Zone discrète : gestion des données techniques locales. */}
      <div className="mt-6 flex flex-col gap-1.5">
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
    </PageShell>
  );
}
