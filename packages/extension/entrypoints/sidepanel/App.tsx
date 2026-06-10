import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { AnalysisResult, UsageProfile } from "@pepite/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendRequest, type TabState } from "@/lib/messages";

const PROFILES: { id: UsageProfile; label: string }[] = [
  { id: "residence", label: "Résidence" },
  { id: "locatif-nu", label: "Location nue" },
  { id: "airbnb", label: "Airbnb" },
  { id: "coloc", label: "Coloc" },
];

export default function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [state, setState] = useState<TabState>({ status: "idle" });
  const [profile, setProfile] = useState<UsageProfile>("residence");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void sendRequest<{ tabId?: number; state: TabState }>({ type: "GET_TAB_STATE" }).then((r) => {
      if (r.tabId !== undefined) setTabId(r.tabId);
      setState(r.state);
    });
    const listener = (msg: { type?: string; tabId?: number; state?: TabState }) => {
      if (msg.type === "TAB_STATE_CHANGED" && msg.state) setState(msg.state);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  async function runFullAnalysis() {
    if (tabId === null) return;
    setError(null);
    const res = await sendRequest<{ reportId?: string; analysis?: AnalysisResult; error?: string }>({
      type: "RUN_FULL_ANALYSIS",
      tabId,
      profile,
    });
    if (res.error === "NO_API_KEY") {
      setError("Clé API manquante — configure un provider dans les réglages.");
    } else if (res.error) {
      setError(res.error);
    } else {
      setAnalysis(res.analysis ?? null);
      setReportId(res.reportId ?? null);
    }
  }

  if (state.status === "idle" || !state.listing) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Ouvre une annonce immobilière Leboncoin pour lancer l'analyse.
      </div>
    );
  }

  const { listing, quick } = state;
  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-semibold leading-tight">{listing.title}</h1>
          <p className="text-muted-foreground">{listing.location.rawAddress}</p>
        </div>
        {quick?.score !== null && quick?.score !== undefined && (
          <Badge variant={quick.score >= 65 ? "default" : "destructive"}>{quick.score}/100</Badge>
        )}
      </div>

      {state.status === "quick-running" && <p>Analyse du marché en cours…</p>}

      {quick && (
        <div className="grid grid-cols-2 gap-2">
          <Card><CardHeader className="p-3 pb-0"><CardTitle className="text-xs font-medium text-muted-foreground">Prix</CardTitle></CardHeader>
            <CardContent className="p-3 pt-1 font-semibold tabular-nums">{listing.price.toLocaleString("fr-FR")} €</CardContent></Card>
          <Card><CardHeader className="p-3 pb-0"><CardTitle className="text-xs font-medium text-muted-foreground">Prix/m²</CardTitle></CardHeader>
            <CardContent className="p-3 pt-1 font-semibold tabular-nums">{quick.listingPricePerM2 ? `${quick.listingPricePerM2.toLocaleString("fr-FR")} €` : "—"}</CardContent></Card>
          <Card><CardHeader className="p-3 pb-0"><CardTitle className="text-xs font-medium text-muted-foreground">Médiane secteur</CardTitle></CardHeader>
            <CardContent className="p-3 pt-1 font-semibold tabular-nums">{quick.market ? `${quick.market.medianPricePerM2.toLocaleString("fr-FR")} €/m²` : "—"}</CardContent></Card>
          <Card><CardHeader className="p-3 pb-0"><CardTitle className="text-xs font-medium text-muted-foreground">Écart marché</CardTitle></CardHeader>
            <CardContent className={`p-3 pt-1 font-semibold tabular-nums ${quick.marketGapPct !== null && quick.marketGapPct < 0 ? "text-green-600" : "text-amber-600"}`}>
              {quick.marketGapPct !== null ? `${quick.marketGapPct > 0 ? "+" : ""}${quick.marketGapPct.toFixed(1)} %` : "—"}</CardContent></Card>
        </div>
      )}

      <div className="flex gap-1">
        {PROFILES.map((p) => (
          <Button key={p.id} size="sm" variant={profile === p.id ? "default" : "outline"} onClick={() => setProfile(p.id)}>
            {p.label}
          </Button>
        ))}
      </div>

      {state.status !== "full-running" ? (
        <Button onClick={runFullAnalysis} disabled={!quick}>Analyse complète (IA)</Button>
      ) : (
        <Button disabled>Analyse IA en cours…</Button>
      )}

      {error && (
        <p className="text-destructive">
          {error}{" "}
          {error.includes("Clé API") && (
            <button className="underline" onClick={() => browser.runtime.openOptionsPage()}>Ouvrir les réglages</button>
          )}
        </p>
      )}

      {analysis && (
        <div className="flex flex-col gap-2">
          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Synthèse</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0 whitespace-pre-line">{analysis.synthese}</CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Points de vigilance</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0">
              <ul className="flex flex-col gap-1">
                {analysis.pointsVigilance.map((p, i) => (
                  <li key={i}>
                    <span className={p.niveau === "critique" ? "text-destructive font-medium" : p.niveau === "attention" ? "text-amber-600 font-medium" : "font-medium"}>{p.titre}</span>
                    <span className="text-muted-foreground"> — {p.detail}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {reportId && (
            <Button variant="outline" onClick={() => window.open(browser.runtime.getURL(`/rapport.html?id=${reportId}` as never))}>
              Voir le rapport complet
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
