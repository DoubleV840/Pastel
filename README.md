# Pastel

Appli de coloriage et de dessin pour iPad, dans le navigateur (PWA installable).
Pensée pour l'Apple Pencil : pression, inclinaison (ombrage au crayon), survol.

## Fonctions

- **42 outils** en 11 familles : crayons (couleur, fin, gras, esquisse), feutres
  (fin, pinceau, biseauté, surligneur), pinceaux (rond, plat, huile, gouache),
  aquarelle (lavis, humide avec bords foncés et diffusion, pinceau sec),
  pastels (sec, gras, crayon de cire, fusain), aérographe (doux, fin, bombe,
  éclaboussures), paillettes (fines, arc-en-ciel, étoiles, gel), estompe
  (estompe, doigt, flou), gommes (dure, douce, mie de pain), remplissage et pipette.
- **Remplissage par toucher** : uni, dégradé (glisser pour la direction),
  dégradé rond, ombré, texture, pois, rayures, carreaux.
- **Animations** : remplissage qui coule depuis le point touché en suivant la forme
  de la zone, onde au toucher, annuler en fondu, outils qui rebondissent, aperçus
  des pinceaux qui se dessinent, badge « Enregistré », confettis à l'export.
  Désactivables (Réglages) et coupées si « Réduire les animations » est activé sur l'iPad.
- **Rester dans les traits** : un trait commencé dans une zone n'en sort pas.
- **Coloriages** générés à l'infini, 10 catégories (mandalas, fleurs, papillons,
  océan, paysages, kaléidoscopes, vitraux, géométrie, motifs, abstrait) : chaque
  numéro donne toujours la même page.
- **Importer un dessin** (PNG/JPG au trait) et **photo → coloriage** (zones
  fermées ou contours façon croquis).
- **Toile vierge** (portrait, paysage, carré, écran) et 6 papiers (blanc, crème,
  grain, aquarelle, kraft, gris). Couleur des traits au choix.
- Couleurs : roue, 13 palettes, harmonies, couleurs récentes, « Mes couleurs »,
  seconde couleur pour dégradés et motifs.
- Annuler / rétablir (boutons, 2 ou 3 doigts), zoom au pincement, export PNG
  (partage iPad → « Enregistrer l'image » dans Photos), avec ou sans traits/papier.
- Enregistrement automatique sur l'appareil (IndexedDB), rien n'est envoyé.

- **3 langues** : français, anglais, espagnol d'Amérique latine. Détectée selon la
  langue de l'iPad, modifiable par le globe de l'accueil ou dans Réglages.

Doigt : en mode « Auto », le doigt dessine tant qu'aucun Apple Pencil n'a été
utilisé ; ensuite il sert à zoomer et déplacer (appui long = pipette). Réglable.

## Lancer en local

```sh
python3 -m http.server 8766
```

Puis ouvrir http://localhost:8766. Sur l'iPad (même Wi-Fi) :
`python3 -m http.server 8766 --bind 0.0.0.0` puis `http://<ip-du-mac>:8766`.

## Mise en ligne (GitHub Pages)

Prévu sur **https://pastel.ivwi.fr** (dépôt `DoubleV840/Pastel`). Site statique
sans build : un `git push` sur `main` suffit à publier.

- GitHub : Settings → Pages → « Deploy from a branch » → `main` / `(root)`.
  Le fichier `CNAME` donne le domaine.
- DNS (zone `ivwi.fr` chez OVH) : `pastel  CNAME  doublev840.github.io.`

Sur l'iPad : ouvrir le site dans Safari → Partager → « Sur l'écran d'accueil ».
Installée ainsi, l'appli s'ouvre en plein écran et Safari ne purge pas ses données.

Le service worker sert la dernière version dès que le réseau répond.
Changer `CACHE` dans `sw.js` seulement si la liste des fichiers change.

## Fichiers

- `js/engine.js` : moteur de tracé (empreintes, grain, masque, estompe, aquarelle).
- `js/brushes.js` : catalogue des outils, textures de pointe et de papier.
- `js/regions.js`, `js/fill.js` : zones fermées, remplissages.
- `js/pages.js` : générateurs de coloriages. `js/lineart.js` : image/photo → traits.
- `js/editor.js` : écran de dessin (saisie, gestes, historique, export).
- `js/i18n.js` : traductions (fr, en, es-419).
- `js/gallery.js` : accueil. `js/colorpicker.js` : couleurs. `js/store.js` : IndexedDB.
- `sw.js`, `manifest.webmanifest`, `icons/` : installation en appli.
