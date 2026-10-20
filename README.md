# map_builder

English first, version française plus bas.

## English

A light geographic information system for [Grist](https://www.getgrist.com): shapes (rectangles, ovals, free outlines) and pins stored in a Grist table and drawn over a base map. One row of the table is one object. Colours, filters, links with other widgets and sharing are handled by Grist itself, so a Grist document can hold departments, regions or the buildings of a campus and be reused by everybody. It is built from the [map_view](https://github.com/Bigorneau15652/map_view) widget.

Status: work in progress. Reading and display of shapes and pins are done. The drawing mode (create, edit and erase shapes in the widget) and the import of department and region outlines are the next steps.

### Features

- One object per row: a shape (a GeoJSON polygon stored in the Shape column), a pin (Latitude and Longitude columns) or both.
- The fill colour comes from a Color column (HEX code such as `#4A90D9`). The border is the same colour, darker.
- A label (name and description) shows when the row is selected or the shape is clicked. Labels are plain text.
- Two-way selection: selecting a row centres the map on it, clicking a shape or a pin selects the row in Grist. The zoom chosen by the user is never changed: if the next shape is larger, zoom out yourself.
- Nested shapes stay usable: large shapes are drawn first, small ones on top, so a building can be clicked inside its site.
- Filters are the ones of Grist: the widget only shows the rows that its section shows (filter by colour, by name, link with another widget with "Select by").
- A single base map, chosen from a catalogue of 11 layers of the IGN, three open maps (OpenStreetMap, CyclOSM, OpenTopoMap) and your own maps (see [MAPS.md](MAPS.md)). A click shows the map at once, OK saves the choice, Cancel puts the previous map back.
- A transparency slider for the fill of the shapes, at the bottom left.
- The buttons and sliders fade after three seconds without movement over the map. The view (centre and zoom) is kept in the browser of each user.
- The map can be opened in a separate window, for example on a second screen.
- Interface in French and English, chosen from the browser language.

### Columns

| Column | Type | Required |
|---|---|:---:|
| Name | any | yes |
| Shape | Text | one of Shape or Latitude and Longitude |
| Latitude, Longitude | Numeric | one of Shape or Latitude and Longitude |
| Color | Text | no |
| Description | Text | no |

The Shape column holds GeoJSON text, for example `{"type":"Feature","properties":{"kind":"rectangle"},"geometry":{"type":"Polygon","coordinates":[[[3.86,43.60],[3.89,43.60],[3.89,43.62],[3.86,43.62],[3.86,43.60]]]}}`. Coordinates are longitude then latitude, in degrees (WGS 84): the shape lands on the map without any calibration. A bare `Polygon` or `MultiPolygon` geometry is accepted too, so outlines exported from QGIS can be pasted as they are. The `kind` property (`rectangle`, `ellipse` or `polygon`) is optional.

Limits, to keep the widget fast and safe: 2 million characters per cell, 50 000 vertices per shape, 500 polygons per shape. A row whose Shape cannot be read is left out, and a banner above the map names the column to check, the number of rows and a few examples.

### Install

1. Publish this repository with GitHub Pages: Settings, Pages, Source "Deploy from a branch", branch `main`, folder `/ (root)`.
2. The widget address is `https://YOUR-ACCOUNT.github.io/map_builder/index.html`.
3. In Grist, add a page with a custom widget, paste that address and give it read access to the table ("Read table").
4. In the right-hand panel, under the access level, map the columns.

If your Grist server is not `grist.numerique.gouv.fr`, edit two places in `index.html`: the `src` of the `grist-plugin-api.js` script and the host named in the Content-Security-Policy line above it (for the public service use `https://docs.getgrist.com`).

### Security and privacy

- No external script except the Grist plugin API, loaded from your own Grist server. Leaflet and its clustering plugin are in `vendor`. A Content-Security-Policy limits scripts to this site and images to https.
- The data of the table is never sent anywhere. Each map provider sees the IP address of the users, the displayed area and the site that shows the map. Shapes are never downloaded from anywhere: they come from the table.
- Labels and names are written as text, never as HTML. The text of the Shape column is checked (types, ranges, sizes) before drawing.
- Messages between the widget and the separate windows are accepted only from the same site and from the window the widget opened, and the settings they carry are checked before use.

### Tests

`tests/run.js` runs the widget in a headless browser with a mocked Grist (`tests/mock-grist.js`): reading and drawing of shapes, selection and zoom, banners, narrow panel in dark mode, and 3 000 shapes. See the first lines of the file for the command.

### Files

- `index.html`, `js/main-grist.js`: the widget. `window.html`, `js/main-window.js`: the separate map window. `catalog.html`, `js/main-catalog.js`: the catalogue window.
- `js/app.js`: the map screen. `js/engine.js`: the map, the shapes and the pins. `js/geometry.js`: reading of the Shape column. `js/records.js`: reading and checking of the rows. `js/menu.js`: catalogue, "Other" dialog, transparency slider. `js/catalog.js`: maps. `js/config.js`: saved settings. `js/colors.js`, `js/i18n.js`, `js/window-link.js`.
- `data/ign-layers.js`: the IGN layers. `vendor`: Leaflet and Leaflet.markercluster.

Browsers keep GitHub Pages files for about ten minutes. Scripts and styles are referenced with `?v=0.1.0`: change that number in `index.html`, `window.html`, `catalog.html` and `js/window-link.js` with every release.

Licence: MIT. Leaflet is under the BSD 2-Clause licence and Leaflet.markercluster under the MIT licence.

## Français

Un système d'information géographique léger pour [Grist](https://www.getgrist.com) : des formes (rectangles, ovales, contours libres) et des épingles stockées dans un tableau Grist et dessinées sur un fond de carte. Une ligne du tableau est un objet. Les couleurs, les filtres, les liens avec d'autres widgets et le partage sont gérés par Grist lui-même, si bien qu'un document Grist peut contenir des départements, des régions ou les bâtiments d'un campus et être réutilisé par tous. Il est construit à partir du widget [map_view](https://github.com/Bigorneau15652/map_view).

État : en cours de réalisation. La lecture et l'affichage des formes et des épingles sont faits. Le mode dessin (créer, modifier et effacer des formes dans le widget) et l'import des contours des départements et des régions sont les prochaines étapes.

### Fonctions

- Un objet par ligne : une forme (un polygone GeoJSON dans la colonne Shape), une épingle (colonnes Latitude et Longitude) ou les deux.
- La couleur de remplissage vient d'une colonne Color (code HEX comme `#4A90D9`). La bordure est de la même couleur, plus foncée.
- Une étiquette (nom et description) s'affiche à la sélection de la ligne ou au clic sur la forme. Les étiquettes sont du texte simple.
- Sélection dans les deux sens : sélectionner une ligne centre la carte dessus, cliquer une forme ou une épingle sélectionne la ligne dans Grist. Le zoom choisi par l'utilisateur n'est jamais modifié : si la forme suivante est plus grande, il suffit de dézoomer.
- Les formes imbriquées restent utilisables : les grandes formes sont dessinées en premier, les petites par-dessus, si bien qu'un bâtiment reste cliquable dans son site.
- Les filtres sont ceux de Grist : le widget n'affiche que les lignes que sa section affiche (filtre par couleur, par nom, lien avec un autre widget par « Sélectionner par »).
- Un seul fond de carte, choisi dans un catalogue de 11 couches de l'IGN, trois cartes libres (OpenStreetMap, CyclOSM, OpenTopoMap) et vos propres cartes (voir [MAPS.md](MAPS.md)). Un clic affiche aussitôt la carte, OK enregistre le choix, Annuler remet la carte précédente.
- Une réglette de transparence du remplissage des formes, en bas à gauche.
- Les boutons et les réglettes s'effacent après trois secondes sans mouvement sur la carte. La vue (position et zoom) est conservée dans le navigateur de chaque utilisateur.
- La carte peut s'ouvrir dans une fenêtre séparée, par exemple sur un second écran.
- Interface en français et en anglais, selon la langue du navigateur.

### Colonnes

| Colonne | Type | Obligatoire |
|---|---|:---:|
| Name | tout type | oui |
| Shape | Texte | Shape, ou bien Latitude et Longitude |
| Latitude, Longitude | Numérique | Shape, ou bien Latitude et Longitude |
| Color | Texte | non |
| Description | Texte | non |

La colonne Shape contient du texte GeoJSON, par exemple `{"type":"Feature","properties":{"kind":"rectangle"},"geometry":{"type":"Polygon","coordinates":[[[3.86,43.60],[3.89,43.60],[3.89,43.62],[3.86,43.62],[3.86,43.60]]]}}`. Les coordonnées sont la longitude puis la latitude, en degrés (WGS 84) : la forme se place sur la carte sans aucun calage. Une géométrie `Polygon` ou `MultiPolygon` seule est aussi acceptée, donc des contours exportés de QGIS peuvent être collés tels quels. La propriété `kind` (`rectangle`, `ellipse` ou `polygon`) est facultative.

Limites, pour que le widget reste rapide et sûr : 2 millions de caractères par cellule, 50 000 sommets par forme, 500 polygones par forme. Une ligne dont la colonne Shape est illisible est exclue, et un bandeau au-dessus de la carte nomme la colonne à vérifier, le nombre de lignes et quelques exemples.

### Installation pas à pas

1. Sur GitHub, ouvrez le dépôt, puis Settings, puis Pages. Sous Source, choisissez « Deploy from a branch », la branche `main` et le dossier `/ (root)`, puis cliquez sur Save. Attendez une à deux minutes.
2. L'adresse du widget est `https://VOTRE-COMPTE.github.io/map_builder/index.html`.
3. Dans Grist : Ajouter, puis Ajouter une page, puis choisissez Personnalisée. Collez l'adresse du widget et donnez-lui l'accès en lecture à la table (« Lire la table »).
4. Dans le panneau de droite, sous le niveau d'accès, associez les colonnes.

Si votre serveur Grist n'est pas `grist.numerique.gouv.fr`, modifiez deux endroits dans `index.html` : l'adresse du script `grist-plugin-api.js` et l'hôte indiqué dans la ligne Content-Security-Policy située au-dessus.

### Sécurité et confidentialité

Aucun script externe sauf l'API de plugin Grist, chargée depuis votre serveur Grist. Leaflet et son plugin de regroupement sont dans `vendor`. Une politique de sécurité de contenu limite les scripts à ce site et les images à https. Les données du tableau ne sont jamais envoyées. Chaque fournisseur de carte voit l'adresse IP des utilisateurs, la zone affichée et le site qui affiche la carte. Les formes ne sont jamais téléchargées : elles viennent du tableau. Les étiquettes et les noms sont écrits comme du texte, jamais comme du HTML. Le texte de la colonne Shape est vérifié (types, plages, tailles) avant le dessin. Les messages entre le widget et les fenêtres séparées ne sont acceptés que du même site et de la fenêtre ouverte par le widget, et les réglages qu'ils portent sont vérifiés avant usage.

### Tests

`tests/run.js` lance le widget dans un navigateur sans fenêtre avec un Grist simulé (`tests/mock-grist.js`) : lecture et dessin des formes, sélection et zoom, bandeaux, panneau étroit en mode sombre, et 3 000 formes. La commande est indiquée en tête du fichier.

### Publier une modification

Les navigateurs gardent les fichiers de GitHub Pages environ dix minutes. Les scripts et les styles sont appelés avec `?v=0.1.0` : changez ce numéro dans `index.html`, `window.html`, `catalog.html` et `js/window-link.js` à chaque version.

Licence : MIT. Leaflet est sous licence BSD 2-Clause et Leaflet.markercluster sous licence MIT.
