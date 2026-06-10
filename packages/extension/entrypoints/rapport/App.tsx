import { useEffect, useState } from "react";
import type { Report } from "@pepite/core";
import { scoreLabel } from "@pepite/core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { idbRepository } from "@/lib/repository-idb";

const PROFILE_LABEL: Record<Report["profile"], string> = {
  residence: "Résidence principale",
  "locatif-nu": "Location nue",
  airbnb: "Airbnb",
  coloc: "Colocation",
};

export default function App() {
  const [report, setReport] = useState<Report | null | "loading">("loading");

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return setReport(null);
    void idbRepository.getReport(id).then((r) => setReport(r ?? null));
  }, []);

  if (report === "loading") return null;
  if (!report) return <p className="p-8 text-muted-foreground">Rapport introuvable.</p>;

  const { listing, quick, analysis } = report;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{listing.title}</h1>
          <p className="text-muted-foreground">
            {listing.location.rawAddress} · {listing.price.toLocaleString("fr-FR")} € ·{" "}
            {PROFILE_LABEL[report.profile]}
          </p>
          <p className="mt-1 text-sm font-medium">{analysis.recommandation}</p>
        </div>
        {quick.score !== null && (
          <div className="text-center">
            <div className={`text-4xl font-bold tabular-nums ${quick.score >= 65 ? "text-green-600" : quick.score >= 45 ? "text-amber-600" : "text-red-600"}`}>
              {quick.score}
            </div>
            <div className="text-xs text-muted-foreground">/100 · {scoreLabel(quick.score)}</div>
          </div>
        )}
      </header>

      <Card>
        <CardHeader><CardTitle>Synthèse</CardTitle></CardHeader>
        <CardContent className="whitespace-pre-line leading-relaxed">{analysis.synthese}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prix & marché</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-muted-foreground">Prix/m² annonce</div><div className="font-semibold tabular-nums">{quick.listingPricePerM2?.toLocaleString("fr-FR") ?? "—"} €</div></div>
            <div><div className="text-muted-foreground">Médiane secteur</div><div className="font-semibold tabular-nums">{quick.market?.medianPricePerM2.toLocaleString("fr-FR") ?? "—"} €</div></div>
            <div><div className="text-muted-foreground">Écart</div><div className="font-semibold tabular-nums">{quick.marketGapPct !== null ? `${quick.marketGapPct > 0 ? "+" : ""}${quick.marketGapPct.toFixed(1)} %` : "—"}</div></div>
          </div>
          {quick.market && (
            <>
              <p className="text-xs text-muted-foreground">
                {quick.market.sampleSize} ventes DVF · rayon {quick.market.radiusM} m · confiance {quick.market.confidence}
              </p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Date</th><th className="font-medium">Bien</th><th className="font-medium">Prix</th><th className="font-medium">€/m²</th><th className="font-medium">Distance</th></tr></thead>
                <tbody>
                  {quick.market.comparables.map((c) => (
                    <tr key={c.idMutation} className="border-t">
                      <td className="py-1 tabular-nums">{c.date}</td>
                      <td>{c.type} {c.surface} m²</td>
                      <td className="tabular-nums">{c.price.toLocaleString("fr-FR")} €</td>
                      <td className="tabular-nums">{Math.round(c.pricePerM2).toLocaleString("fr-FR")}</td>
                      <td className="tabular-nums">{c.distanceM} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Points de vigilance</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {analysis.pointsVigilance.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge variant={p.niveau === "critique" ? "destructive" : p.niveau === "attention" ? "secondary" : "outline"}>{p.niveau}</Badge>
                <div><span className="font-medium">{p.titre}</span><span className="text-muted-foreground"> — {p.detail}</span></div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Négociation</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="font-semibold tabular-nums">
            Cible : {analysis.negociation.cibleBasse.toLocaleString("fr-FR")} € — {analysis.negociation.cibleHaute.toLocaleString("fr-FR")} €
          </p>
          <ul className="list-disc pl-5 text-sm">
            {analysis.negociation.arguments.map((a, i) => (<li key={i}>{a}</li>))}
          </ul>
        </CardContent>
      </Card>

      <footer className="text-xs text-muted-foreground">
        Généré le {new Date(report.createdAt).toLocaleString("fr-FR")} · {report.provider}/{report.model} ·
        Sources : annonce, DVF (data.gouv.fr), BAN (IGN). Estimation indicative — ne remplace pas une expertise.
      </footer>
    </div>
  );
}
