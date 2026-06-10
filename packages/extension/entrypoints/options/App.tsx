import { useEffect, useState } from "react";
import { DEFAULT_MODELS, type LlmProviderId } from "@pepite/core";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSettings, saveSettings, type Settings } from "@/lib/settings";
import { PepiteLogo } from "@/components/pepite/pepite-logo";

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
    <div style={{ minHeight: "100vh", background: "#f7f7f8", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, sans-serif' }}>
      {/* Top bar */}
      <div style={{ height: 52, background: "#fff", borderBottom: "1px solid #e4e4e7", display: "flex", alignItems: "center", gap: 14, padding: "0 24px", flexShrink: 0 }}>
        <PepiteLogo size={21} textSize={14.5} />
        <span style={{ color: "#e4e4e7" }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#8e8e98" }}>Réglages</span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 24px" }}>
        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 10, boxShadow: "0 1px 2px rgba(24,24,27,.05), 0 4px 12px rgba(24,24,27,.05)", padding: "18px 22px" }}>
          {/* Card header */}
          <div style={{ marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "#18181b", letterSpacing: "-0.01em" }}>
              Modèle d'IA
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8e8e98", lineHeight: 1.5 }}>
              Ta clé reste sur cette machine — aucun serveur Pépite.
            </p>
          </div>

          <div style={{ borderTop: "1px solid #ededf0", marginTop: 14, paddingTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Provider */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11.5, fontWeight: 560, color: "#52525b" }}>
                Fournisseur
              </label>
              <Select
                value={settings.provider}
                onValueChange={(v) => {
                  const provider = v as LlmProviderId;
                  setSettings({ ...settings, provider, model: DEFAULT_MODELS[provider] });
                }}
              >
                <SelectTrigger
                  style={{ fontSize: 13, border: "1px solid #e4e4e7", borderRadius: 7, height: 36, paddingLeft: 12, paddingRight: 12 }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* API Key */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11.5, fontWeight: 560, color: "#52525b" }}>
                Clé API
              </label>
              <Input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder="sk-…"
                style={{ fontSize: 13, border: "1px solid #e4e4e7", borderRadius: 7, height: 36 }}
              />
              <p style={{ margin: 0, fontSize: 11, color: "#8e8e98", lineHeight: 1.5 }}>
                Stockée en local sur cette machine, jamais synchronisée.
              </p>
            </div>

            {/* Model */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11.5, fontWeight: 560, color: "#52525b" }}>
                Modèle
              </label>
              <Input
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                style={{ fontSize: 13, border: "1px solid #e4e4e7", borderRadius: 7, height: 36 }}
              />
            </div>

            {/* Save button */}
            <div>
              <button
                onClick={save}
                style={{
                  fontSize: 13,
                  fontWeight: 560,
                  fontFamily: 'inherit',
                  background: "#0d9488",
                  color: "#fff",
                  border: "none",
                  borderRadius: 7,
                  padding: "8px 13px",
                  cursor: "pointer",
                  lineHeight: 1.4,
                }}
              >
                {saved ? "Enregistré ✓" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
