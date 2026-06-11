# Dossier Chrome Web Store — Pépite

Tout ce qu'il faut pour publier : crée le compte développeur (5 $ une fois) sur
https://chrome.google.com/webstore/devconsole, téléverse le zip de la release
(`pepiteextension-X.Y.Z-chrome.zip`), puis copie-colle les blocs ci-dessous.

## Fiche

- **Nom** : Pépite — analyse immobilière
- **Résumé court** (≤ 132 caractères) :
  > Analysez les annonces immobilières : prix vs ventes réelles (DVF), quartier, risques, analyse IA et aide à la négociation.
- **Catégorie** : Outils de productivité (ou « Shopping »)
- **Langue** : Français
- **Description détaillée** :
  > Ouvrez une annonce immobilière (Leboncoin, SeLoger, Citya, Bien'ici…) et Pépite vous dit si le prix est juste.
  >
  > • Score prix instantané basé sur les ventes réelles du secteur (données DVF officielles)
  > • Analyse IA complète avec vos propres clés API (Gemini, Claude ou OpenAI) : synthèse, points de vigilance, fourchette de négociation, checklist de visite, avis selon votre projet (résidence, locatif, Airbnb, colocation)
  > • Quartier : écoles, commerces, transports, espaces verts (OpenStreetMap)
  > • Risques naturels et technologiques (Géorisques), marché locatif, population, zonage PLU, taxe foncière
  > • Mails de négociation prêts à envoyer
  > • Restyle IA : faites redécorer les photos de l'annonce par Gemini selon votre style, avec estimation des travaux
  > • Historique de vos analyses et comparateur de biens
  >
  > 100 % local : pas de compte, pas de serveur, pas de télémétrie. Vos clés API et vos analyses restent dans votre navigateur. Open source (MIT) : github.com/jonathan-pyt/pepite
- **URL de la politique de confidentialité** : https://github.com/jonathan-pyt/pepite/blob/main/PRIVACY.md
- **Site** : https://github.com/jonathan-pyt/pepite
- **Visuels** : screenshots 1280×800 — recadrer ceux de `.github/screenshots/` (rapport-synthese, restyle-studio, historique, comparateur) ; icône 128×128 déjà dans `packages/extension/`.

## Single purpose (champ « Justification de l'objectif unique »)

> Pépite a un objectif unique : aider l'utilisateur à évaluer l'annonce immobilière qu'il consulte (prix vs marché, contexte du bien, aide à la décision et à la négociation).

## Justification des permissions

| Permission | Justification à coller |
|---|---|
| `storage` | Enregistrer en local les réglages de l'utilisateur (fournisseur d'IA et clé API) et ses analyses. Rien n'est synchronisé ni transmis au développeur. |
| `sidePanel` | Afficher le panneau latéral qui résume l'analyse du bien consulté. |
| `tabs` | Identifier l'onglet actif pour associer l'analyse à l'annonce ouverte et mettre à jour le panneau quand l'utilisateur change d'onglet. |
| Hôtes immobiliers (leboncoin.fr, seloger.com, bienici.com, citya.com) | Lire le contenu de l'annonce que l'utilisateur consulte afin d'en extraire les caractéristiques du bien. Aucune autre page n'est lue. |
| CDN photos (img.leboncoin.fr, mms.seloger.com, photo.bienici.com, img.citya.com, www.citya.com) | Télécharger les photos de l'annonce sélectionnées par l'utilisateur pour la fonction Restyle IA. |
| APIs publiques (files.data.gouv.fr, data.geopf.fr, geo.api.gouv.fr, apicarto.ign.fr, georisques.gouv.fr, data.economie.gouv.fr, overpass-api.de, overpass.osm.ch) | Récupérer les données publiques nécessaires à l'analyse : ventes immobilières DVF, géocodage, population, zonage PLU, risques, taux de taxe foncière, commodités du quartier. |
| APIs d'IA (generativelanguage.googleapis.com, api.anthropic.com, api.openai.com) | Appeler le fournisseur d'IA choisi par l'utilisateur, avec sa propre clé API, pour générer l'analyse rédigée, les mails de négociation et les images de restyle. |

## Déclaration d'usage des données (formulaire « Privacy practices »)

- L'extension **ne collecte aucune donnée** pour le développeur : répondre « non » à toutes les catégories de collecte (l'envoi des caractéristiques d'annonce au fournisseur d'IA se fait avec la clé de l'utilisateur, à sa demande, et n'est pas une collecte par le développeur — le préciser dans le champ libre si demandé).
- Pas de code distant (tout le code est dans le paquet).
- Certifier les trois cases de conformité (usage limité, pas de vente de données, pas d'usage hors objectif unique).

## Conseils review

- La review Google prend en général 1 à 3 jours ; les permissions d'hôtes multiples peuvent déclencher une review approfondie — les justifications ci-dessus y répondent.
- Toute nouvelle permission dans une mise à jour relance une review complète.
- Garder la version du manifest (`package.json` → `version`) synchronisée avec le tag de release.
