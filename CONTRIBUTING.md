# Contribuer à Pépite

Merci de vouloir contribuer 💎. Le projet est un monorepo pnpm : `packages/core` (logique métier TypeScript pur) et `packages/extension` (extension Chrome MV3, WXT + React). Tout le code et les commentaires sont en français — gardez ce style.

## Setup

- Node 22+ et pnpm.
- `pnpm install` à la racine : le `postinstall` lance `wxt prepare` (génère les types de l'extension).

## Développer

Depuis `packages/extension` :

```bash
pnpm dev            # Chrome avec HMR
pnpm dev:firefox    # Firefox avec HMR
```

Chargez l'extension non empaquetée (voir le README), puis renseignez votre clé API dans la page de réglages (icône Pépite → clic droit → Options). Le score prix tourne sans clé ; l'analyse IA en demande une.

## Tester

```bash
pnpm test        # tout le workspace (Vitest : core + extension avec fakeBrowser)
pnpm typecheck   # dans chaque package
```

Les tests e2e Playwright tournent en local uniquement, sur un build de production. Depuis `packages/extension` :

```bash
npx playwright install chromium   # une fois
pnpm build
pnpm e2e
```

Philosophie de test :

- Vitest uniquement, tests colocalisés à côté du code (`*.test.ts`).
- On teste la logique, pas l'écho d'un mock : un test qui injecte une valeur dans un mock et vérifie qu'elle ressort ne prouve rien. Privilégiez les cas limites et les cas d'échec.
- Fixtures réelles pour les parseurs (extraits de vraies pages), pas de HTML inventé.

## Proposer une PR

- `pnpm typecheck` et `pnpm test` doivent être verts — la CI le vérifie.
- Toute logique nouvelle arrive avec ses tests.
- Commits en français, style conventionnel : `feat:`, `fix:`, `docs:`, `chore:`…
- Une PR = un sujet. Ne mélangez pas refactor et fonctionnalité.

## Avant une release (mainteneur)

- `pnpm e2e` au vert.
- Test manuel du dialogue d'autorisation réseau : réglages → coller une clé → Enregistrer → accepter la demande d'accès.
- Smoke test Firefox : ouvrir la sidebar, lancer une analyse longue jusqu'au bout.
- Bump de version = tag `vX.Y.Z` correspondant (la CI vérifie la correspondance entre la version du manifeste et le tag).
