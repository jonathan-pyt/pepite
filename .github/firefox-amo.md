# Dossier Firefox Add-ons (AMO) — Pépite

✅ **PUBLIÉ** (v0.4.1, 12 juin 2026)
- **Fiche** : https://addons.mozilla.org/fr/firefox/addon/p%C3%A9pite-analyse-immobili%C3%A8re/
- **Gecko id** : `pepite@jonathan-pyt.github.io`
- **Developer Hub** : https://addons.mozilla.org/developers/

Les notes ci-dessous restent valables pour les **mises à jour** (bump de version,
upload du `-firefox.zip` + du `-sources.zip`).

## Avant la première soumission (obligatoire)

1. **Déclaration de collecte de données** : AMO exige `data_collection_permissions` dans le
   manifest Firefox. À ajouter dans `wxt.config.ts` (bloc `browser_specific_settings.gecko`) :
   ```ts
   data_collection_permissions: { required: ["none"] },
   ```
   « none » = le développeur ne collecte rien (c'est notre cas — cf. PRIVACY.md). Retirer
   alors `suppressWarnings.firefoxDataCollection` du config.
2. **Bump de version** : AMO refuse un upload avec une version déjà soumise — la garde CI
   tag/version impose déjà le bump, garder le réflexe pour les soumissions manuelles.
3. L'**id gecko** est déjà fixé (`pepite@jonathan-pyt.github.io`) — ne plus jamais le changer,
   c'est l'identité de l'extension pour les mises à jour.

## Soumission

1. Developer Hub → « Submit a New Add-on » → « On this site » (listed).
2. Uploader `pepiteextension-X.Y.Z-firefox.zip` (généré par `pnpm zip:firefox` ou attaché à la release CI).
3. **Code source** : comme on utilise un bundler (Vite/WXT), Mozilla demande les sources non
   minifiées → uploader le `pepiteextension-X.Y.Z-sources.zip` généré automatiquement par
   `wxt zip -b firefox`, avec ces instructions de build reproductible dans le champ prévu :
   ```
   Requirements: Node.js 22, pnpm 10
   pnpm install --frozen-lockfile
   cd packages/extension && pnpm zip:firefox
   Output: .output/pepiteextension-X.Y.Z-firefox.zip
   ```
4. Fiche : réutiliser les textes de `.github/chrome-web-store.md` (résumé, description,
   captures depuis `.github/screenshots/`), catégorie « Shopping » ou « Productivité »,
   politique de confidentialité : https://github.com/jonathan-pyt/pepite/blob/main/PRIVACY.md
5. Review : validation automatique quasi immédiate (signature), review humaine a posteriori —
   les host_permissions multiples peuvent déclencher des questions, les justifications du
   dossier Web Store y répondent.

## Spécificités Firefox déjà gérées dans le code (pour mémoire)

- Background = event page (pas service worker) → keepalive pendant les appels LLM longs.
- `sidebar_action` à la place de l'API sidePanel ; l'ouverture de la sidebar exige un geste
  utilisateur direct sur l'extension (icône barre d'outils) — le badge in-page ne peut pas l'ouvrir.
- host_permissions optionnelles selon la version → bandeau « Autoriser » en filet de sécurité.
- `use_dynamic_url` retiré du manifest Firefox (hook build, clé non supportée — bugzilla 1713196).
