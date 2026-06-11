# Politique de confidentialité — Pépite

*Dernière mise à jour : 11 juin 2026*

Pépite est une extension Chrome open source d'analyse de biens immobiliers. Elle fonctionne **entièrement dans votre navigateur, sans serveur** : le développeur ne collecte, ne reçoit et ne stocke **aucune donnée**.

## Ce que l'extension traite, et où

- **Contenu des annonces immobilières** : lorsque vous visitez une annonce (Leboncoin, SeLoger, Bien'ici, Citya…), l'extension lit le contenu de la page pour en extraire les caractéristiques du bien (prix, surface, adresse approximative, photos). Ces données restent dans votre navigateur (IndexedDB locale).
- **Clés API** : vous fournissez vos propres clés (Google Gemini, Anthropic Claude ou OpenAI). Elles sont stockées dans `chrome.storage.local`, **jamais synchronisées** ni transmises ailleurs qu'au fournisseur d'IA correspondant.
- **Rapports, historique et images générées** : stockés localement (IndexedDB). Vous pouvez les supprimer depuis la page Historique ou en désinstallant l'extension.

## Données envoyées à des tiers

L'extension interroge des services externes uniquement pour produire l'analyse :

| Destinataire | Données envoyées | Finalité |
|---|---|---|
| Fournisseur d'IA que **vous** avez choisi (Google / Anthropic / OpenAI) | Caractéristiques de l'annonce, données de marché agrégées et, pour le Restyle, la photo sélectionnée | Analyse rédigée, mails de négociation, génération d'image — avec **votre** clé, selon les conditions et la politique de confidentialité du fournisseur |
| data.gouv.fr, data.geopf.fr (IGN), geo.api.gouv.fr, apicarto.ign.fr, georisques.gouv.fr, data.economie.gouv.fr, overpass-api.de / overpass.osm.ch | Coordonnées géographiques approximatives ou code commune du bien analysé | Données publiques : ventes DVF, géocodage, population, zonage PLU, risques, taux de taxe foncière, commodités OpenStreetMap |

Aucune de ces requêtes ne contient d'identifiant personnel. Aucune donnée n'est envoyée au développeur de l'extension. Il n'y a ni télémétrie, ni analytics, ni compte utilisateur.

## Permissions demandées

- `storage` : enregistrer vos réglages et analyses en local.
- `sidePanel` : afficher le panneau d'analyse.
- `tabs` : détecter l'annonce ouverte dans l'onglet actif.
- Accès aux sites immobiliers : lire l'annonce que vous consultez.
- Accès aux APIs publiques et aux APIs d'IA : récupérer les données ci-dessus.

## Contact

Questions ou demandes : ouvrez une issue sur [github.com/jonathan-pyt/pepite](https://github.com/jonathan-pyt/pepite/issues).
