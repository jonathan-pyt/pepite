# Pépite

Extension Chrome d'analyse de biens immobiliers (France) : score prix vs marché (DVF),
analyse IA, aide à la négociation. Spec : `docs/superpowers/specs/2026-06-10-pepite-extension-design.md`.

## Structure

- `packages/core` — logique d'analyse en TypeScript pur (parseurs, données publiques, scoring, LLM) — testé avec Vitest
- `packages/extension` — extension Chrome (WXT + React + Tailwind + shadcn/ui)
- `design/` — maquettes de référence (bundle Claude Design)
- `docs/` — spec, plan d'implémentation, smoke test

## Dev

- `pnpm install`
- `pnpm test` — tests core (Vitest)
- `cd packages/extension && pnpm dev` — lance Chrome avec l'extension (HMR)
- `pnpm build` — build production dans `packages/extension/.output/chrome-mv3`

Réglages : icône Pépite → clic droit → Options (ou chrome://extensions → Pépite → Options) → provider + clé API (Gemini / Claude / OpenAI).

Smoke test manuel : `docs/smoke-test.md` (à dérouler avant chaque release).

## Données

DVF (data.gouv.fr, licence ouverte), géocodage BAN (data.geopf.fr/IGN), annonce lue depuis la page visitée. Clés API stockées en local uniquement (`chrome.storage.local`), jamais synchronisées.
