# Pépite 💎

Extension Chrome open source d'analyse de biens immobiliers en France. Ouvrez une annonce, Pépite vous dit si le prix est juste — données publiques (DVF, Géorisques, OSM…) + analyse IA avec **vos propres clés API**.

> Projet personnel, sans backend : tout tourne dans votre navigateur, vos clés et vos données restent en local.

## Fonctionnalités

- **Badge in-page** sur l'annonce : score prix instantané vs ventes réelles du secteur (DVF)
- **Side panel** : prix/m², médiane des biens comparables, écart marché
- **Analyse IA complète** (un seul appel LLM) : synthèse, points de vigilance, fourchette et arguments de négociation, checklist de visite, avis pour 4 profils (résidence principale, location nue, Airbnb, colocation)
- **Rapport complet** : comparables datés et adressés, coût total d'acquisition (frais de notaire), score global pondéré (prix, DPE, risques, quartier, tension locative), quartier (écoles, commerces, santé, transports, espaces verts via OpenStreetMap), risques (Géorisques), marché locatif (carte des loyers + zonage ABC), contexte communal (population, zonage PLU, taux de taxe foncière)
- **Mails de négociation** : 3 tons (assertif, modéré, aimable) générés à partir des données du rapport, à copier-coller
- **Restyle IA** 🛋️ : sélectionnez une photo de l'annonce et faites-la redécorer par Gemini selon un style (scandinave, industriel, japandi…) ou votre description — avec estimation du coût des travaux, slider avant/après, variantes sauvegardées
- **Historique & comparateur** : toutes vos analyses, comparaison côte à côte de 2-3 biens

### Sites supportés

Leboncoin, SeLoger et Citya (parseurs dédiés, instantanés) ; autres sites immobiliers (Bien'ici…) via extraction IA générique (nécessite une clé API).

## Installation

Pas encore sur le Chrome Web Store — installation en mode développeur :

```bash
git clone <ce repo> && cd immo-analyse
pnpm install
pnpm build        # depuis packages/extension
```

Puis `chrome://extensions` → activer le « Mode développeur » → « Charger l'extension non empaquetée » → sélectionner `packages/extension/.output/chrome-mv3`.

**Configuration** : icône Pépite → clic droit → Options → choisir un provider (Gemini / Claude / OpenAI) et coller votre clé API. Le score prix fonctionne sans clé ; l'analyse IA, l'extraction générique et le Restyle en demandent une (Restyle = Gemini uniquement, ~0,04 $/image).

## Architecture

```
packages/core        Logique métier en TypeScript pur (zéro dépendance Chrome)
  extraction/        Parseurs par site + extracteur générique LLM
  enrichment/        Géocodage BAN, DVF, OSM/Overpass, Géorisques, loyers, commune/PLU/TF
  scoring/           Score prix, score global pondéré, coût d'acquisition
  analysis/          Prompts + appels LLM (AI SDK v6, multi-provider)
  restyle/           Édition d'image Gemini + estimation travaux
packages/extension   Extension Chrome MV3 (WXT + React 19 + Tailwind v4 + shadcn/ui)
design/              Maquettes de référence (bundle Claude Design)
docs/                Spec et plans d'implémentation
```

Le découpage core/extension permet de réutiliser toute la logique hors navigateur (tests, CLI, autre front).

## Dev

```bash
pnpm install
pnpm test                              # tests core (Vitest, ~270 tests)
pnpm typecheck                         # dans chaque package
cd packages/extension && pnpm dev      # Chrome avec HMR
```

## Données utilisées

| Source | Usage | Licence/Accès |
|---|---|---|
| [DVF géolocalisées](https://files.data.gouv.fr/geo-dvf/) | Ventes réelles, médiane du secteur | Licence ouverte |
| [BAN / Géoplateforme](https://data.geopf.fr) | Géocodage des adresses | Licence ouverte |
| [Overpass / OpenStreetMap](https://overpass-api.de) | Commodités du quartier | ODbL |
| [Géorisques](https://www.georisques.gouv.fr) | Risques naturels et technologiques | Licence ouverte |
| Carte des loyers + zonage ABC | Marché locatif | Licence ouverte |
| [geo.api.gouv.fr](https://geo.api.gouv.fr) | Population communale | Licence ouverte |
| [Géoportail de l'Urbanisme](https://apicarto.ign.fr) | Zonage PLU | Licence ouverte |
| [data.economie.gouv.fr](https://data.economie.gouv.fr) | Taux de taxe foncière | Licence ouverte |

L'annonce est lue depuis la page que **vous** visitez ; rien n'est envoyé ailleurs que chez votre provider LLM. Clés API stockées en local (`chrome.storage.local`), jamais synchronisées.

## Avertissements

Pépite est un outil d'aide à la décision, pas un conseil en investissement. Les scores, estimations de loyers, de travaux et de taxes sont **indicatifs** ; les rendus Restyle sont des projections IA (l'agencement réel doit être validé par un professionnel). Vérifiez toujours les données avant d'engager quoi que ce soit.

## Licence

[MIT](LICENSE)
