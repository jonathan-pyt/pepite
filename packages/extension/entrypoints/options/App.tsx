import { useEffect, useState } from "react";
import { DEFAULT_MODELS, type LlmProviderId } from "@pepite/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSettings, saveSettings, type Settings } from "@/lib/settings";

const PROVIDERS: { id: LlmProviderId; label: string }[] = [
  { id: "google", label: "Google Gemini" },
  { id: "anthropic", label: "Anthropic Claude" },
  { id: "openai", label: "OpenAI" },
];

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  async function save() {
    await saveSettings(settings!);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="mb-4 text-xl font-semibold">Réglages Pépite</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Modèle d'IA</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <Select
              value={settings.provider}
              onValueChange={(v) => {
                const provider = v as LlmProviderId;
                setSettings({ ...settings, provider, model: DEFAULT_MODELS[provider] });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Clé API</Label>
            <Input
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="sk-…"
            />
            <p className="text-xs text-muted-foreground">Stockée en local sur cette machine, jamais synchronisée.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Modèle</Label>
            <Input
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            />
          </div>
          <Button onClick={save}>{saved ? "Enregistré ✓" : "Enregistrer"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
