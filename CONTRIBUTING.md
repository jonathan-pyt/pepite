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

## Publier (mainteneur)

Pousser un tag `vX.Y.Z` enchaîne tout : tests → archives → release GitHub →
**soumission automatique au Chrome Web Store et à Firefox AMO**. Les deux
stores passent ensuite par leur revue avant mise en ligne effective.

Un tag poussé par erreur part donc en revue. Pour l'annuler, il faut le faire
depuis les dashboards des stores — pas depuis Git.

### Secrets du dépôt

La soumission est ignorée (avec une notice, sans échec) tant qu'aucun secret
n'est configuré. Si certains le sont et d'autres pas, la CI échoue en listant
les manquants.

| Store | Secrets |
|---|---|
| Chrome Web Store | `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` |
| Firefox AMO | `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` |

- Chrome : identifiants OAuth via la [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api).
  `CHROME_EXTENSION_ID` est déjà connu : `egkdkadgnhejggojnbgipohjaciiigkf`.
- Firefox : couple issuer/secret à générer sur [addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/en-US/developers/addon/api/key/).

### Vérifier les identifiants sans rien soumettre

```bash
cd packages/extension
pnpm zip && pnpm zip:firefox
pnpm submit:dry     # authentifie seulement, n'envoie rien
```

AMO exige les sources de toute extension buildée : `pnpm zip:firefox` produit
le `*-sources.zip`, joint automatiquement par le script `submit`.
