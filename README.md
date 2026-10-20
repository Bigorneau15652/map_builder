# map_builder

English first, version française plus bas.

## English

A light geographic information system for [Grist](https://www.getgrist.com): shapes (rectangles, ovals, free outlines) and pins stored in a Grist table and drawn over a base map. One row of the table is one object. Colours, filters, links with other widgets and sharing are handled by Grist itself, so a Grist document can hold departments, regions or the buildings of a campus and be reused by everybody. It is built from the [map_view](https://github.com/Bigorneau15652/map_view) widget.

Status: usable. Reading, display, the drawing mode and a ready-made file of the French departments and regions (see [DATA.md](DATA.md)) are done.

### Features

- One object per row: a shape (a GeoJSON polygon stored in the Shape column), a pin (Latitude and Longitude columns) or both.
- A drawing mode (pencil button at the top right) to create, reshape, move and erase shapes on the map. Each shape drawn becomes a row of the table, and each change is written to it.
- The fill colour comes from a Color column (HEX code such as `#4A90D9`). The border is the same colour, darker.
- A label (name and description) shows when the row is selected or the shape is clicked. Labels are plain text, drawn above the shapes and the pins.
- Two-way selection: selecting a row centres the map on it, clicking a shape or a pin selects the row in Grist. The zoom chosen by the user is never changed: if the next shape is larger, zoom out yourself.
- A selected shape gets a more opaque fill; its border does not change.
- Nested shapes stay usable: large shapes are drawn first, small ones on top, so a building can be clicked inside its site.
- Filters are the ones of Grist: the widget only shows the rows that its section shows (filter by colour, by name, link with another widget with "Select by").
- A single base map, chosen from a catalogue of 11 layers of the IGN, three open maps (OpenStreetMap, CyclOSM, OpenTopoMap) and your own maps (see [MAPS.md](MAPS.md)). A click shows the map at once, OK saves the choice, Cancel puts the previous map back.
- A transparency slider for the fill of the shapes, at the bottom left.
- The buttons and sliders fade after three seconds without movement over the map. The view (centre and zoom) is kept in the browser of each user.
- The map can be opened in a separate window, for example on a second screen.
- A ready-made Excel file with the outlines of the French departments and regions, to import in Grist ([DATA.md](DATA.md)).
- Interface in French and English, chosen from the browser language.

### Drawing mode

The pencil button turns the drawing mode on and off; while it is on, a coloured frame goes around the map. A toolbar on the left of the map has, in separate groups, the three shape tools (rectangle, oval, free shape), the eraser, the fusion button and the snapping switch. With no tool pressed, the editor is in its normal mode: select a shape, reshape it, move it. A second click on the pressed tool, the Esc key, or the end of a drawing goes back to the normal mode. A line at the top of the map explains what can be done.

- Rectangle and oval: drag on the map. Hold Shift for a square or a circle.
- Free shape: click each point, then click the first point, double-click or press Enter to close the shape. Backspace removes the last point. Esc or a right click cancels the drawing in progress (the keys work once the widget has the focus: click on the map first).
- Reshape: select a shape (click it, or select its row). Drag a round handle to move a point, drag the small handle in the middle of a side to add a point, double-click a point to remove it. A rectangle or an oval keeps its eight handles and its kind: the cursor shows the direction of each handle (arrows up and down, left and right, or diagonal at the corners), a hand over the rotation handle, and a tooltip says what each handle does, and a corner dragged with Shift keeps the proportions. A round green handle above a rectangle or an oval turns it (Shift: steps of 15 degrees); the turn is saved in the shape. Drag the shape itself to move it.
- Eraser: click a shape to erase it: the Shape cell is emptied and the row stays in the table with its name, its colour and its other columns, ready to be drawn again. The Delete key also erases the selected shape.
- Fusion (a square and a circle that overlap): select a shape first (it is shape 1), press the fusion button, then draw a second shape with the rectangle, the oval or the free shape. The second shape is not saved as a row. Three buttons appear to the right of the fusion button: 1 + 2 adds the two shapes, 1 − 2 cuts shape 2 out of shape 1 (a hole, for example a patio), 2 − 1 keeps of shape 2 only what lies outside shape 1. The result of the chosen operation is shown on the map at once, and shape 2 can still be moved (drag it), resized, turned or reshaped with its handles before you confirm: the result follows. While the second shape is adjusted, drag it to move it (the map is moved with the space bar held down). Once an operation button is pressed, a click on the map outside the second shape (or Enter) confirms: the result replaces the Shape of the row of shape 1 (its name, colour and other columns are kept) and this is final, except for Ctrl+Z. Esc gives up and the buttons disappear.
- Space bar held down, then drag: move the map while a tool is active. The mouse wheel zooms as usual.
- Snapping: the cursor is attracted by the corners of neighbouring shapes, so two buildings that touch share their corner. The shapes stay independent rows. Hold Alt to ignore snapping for a moment.
- Undo: Ctrl+Z (Cmd+Z on a Mac) while the widget has the focus undoes the last 20 actions. The Undo button of Grist works too.
- A new shape asks for its name, gets the colour `#4A90D9` and is written as a new row. Change its colour in the table.
- You can also start from the table: type the names (and colours) of the rows first, select a row that has no shape yet, and draw. The shape is then written to that row, without asking for a name. The row may already have a pin (Latitude and Longitude): it then keeps its pin and gets its shape, with one label for both. The help line tells which row will receive the shape.

The drawing mode needs write access: the widget asks for the access level "Full". It only uses the table it is attached to. If the table is linked to another widget ("Select by"), a new row does not get the link value: set it in the table.

### Columns

| Column | Type | Required |
|---|---|:---:|
| Name | any | yes |
| Shape | Text | one of Shape or Latitude and Longitude |
| Latitude, Longitude | Numeric | one of Shape or Latitude and Longitude |
| Color | Text | no |
| Description | Text | no |

The Shape column holds GeoJSON text, for example `{"type":"Feature","properties":{"kind":"rectangle"},"geometry":{"type":"Polygon","coordinates":[[[3.86,43.60],[3.89,43.60],[3.89,43.62],[3.86,43.62],[3.86,43.60]]]}}`. Coordinates are longitude then latitude, in degrees (WGS 84): the shape lands on the map without any calibration. A bare `Polygon` or `MultiPolygon` geometry is accepted too, so outlines exported from QGIS can be pasted as they are. The `kind` property (`rectangle`, `ellipse` or `polygon`) and the `rotation` property (degrees, clockwise on the screen) are optional: the corners are always in the geometry.

Limits, to keep the widget fast and safe: 2 million characters per cell, 50 000 vertices per shape, 500 polygons per shape. A row whose Shape cannot be read is left out, and a banner above the map names the column to check, the number of rows and a few examples.

### Install

1. Publish this repository with GitHub Pages: Settings, Pages, Source "Deploy from a branch", branch `main`, folder `/ (root)`.
2. The widget address is `https://YOUR-ACCOUNT.github.io/map_builder/index.html`.
3. In Grist, add a page with a custom widget, paste that address and give it full access ("Full"): it is needed to write the shapes you draw.
4. In the right-hand panel, under the access level, map the columns.

If your Grist server is not `grist.numerique.gouv.fr`, edit two places in `index.html`: the `src` of the `grist-plugin-api.js` script and the host named in the Content-Security-Policy line above it (for the public service use `https://docs.getgrist.com`).

### Security and privacy

- No external script except the Grist plugin API, loaded from your own Grist server. Leaflet, its clustering plugin and polygon-clipping (MIT) are in `vendor`. A Content-Security-Policy limits scripts to this site and images to https.
- The widget only reads and writes the table it is attached to, and only the mapped columns. The data of the table is never sent anywhere. Each map provider sees the IP address of the users, the displayed area and the site that shows the map. Shapes are never downloaded from anywhere: they come from the table.
- Labels and names are written as text, never as HTML. The text of the Shape column is checked (types, ranges, sizes) before drawing.
- Messages between the widget and the separate windows are accepted only from the same site and from the window the widget opened, and the settings they carry are checked before use.

### Tests

`tests/run.js`, `tests/edit.js` and `tests/admin-data.js` run the widget in a headless browser with a mocked Grist (`tests/mock-grist.js`): reading and drawing of shapes, selection and zoom, banners, narrow panel in dark mode, 3 000 shapes, and the whole drawing mode (rectangle, oval, free shape, reshaping, moving, eraser, undo, snapping, refused writes). See the first lines of `tests/run.js` for the command.

### Files

- `index.html`, `js/main-grist.js`: the widget. `window.html`, `js/main-window.js`: the separate map window. `catalog.html`, `js/main-catalog.js`: the catalogue window.
- `js/app.js`: the map screen. `js/engine.js`: the map, the shapes and the pins. `js/editor.js`: the drawing mode. `vendor`: Leaflet, Leaflet.markercluster and polygon-clipping (to add and subtract shapes). `js/geometry.js`: reading of the Shape column. `js/records.js`: reading and checking of the rows. `js/menu.js`: catalogue, "Other" dialog, transparency slider. `js/catalog.js`: maps. `js/config.js`: saved settings. `js/colors.js`, `js/i18n.js`, `js/window-link.js`.
- `data/ign-layers.js`: the IGN layers. `vendor`: Leaflet and Leaflet.markercluster.

Browsers keep GitHub Pages files for about ten minutes. Scripts and styles are referenced with `?v=0.7.0`: change that number in `index.html`, `window.html`, `catalog.html` and `js/window-link.js` with every release.

Licence: MIT. Leaflet is under the BSD 2-Clause licence, Leaflet.markercluster and polygon-clipping under the MIT licence.

## Français

Un système d'information géographique léger pour [Grist](https://www.getgrist.com) : des formes (rectangles, ovales, contours libres) et des épingles stockées dans un tableau Grist et dessinées sur un fond de carte. Une ligne du tableau est un objet. Les couleurs, les filtres, les liens avec d'autres widgets et le partage sont gérés par Grist lui-même, si bien qu'un document Grist peut contenir des départements, des régions ou les bâtiments d'un campus et être réutilisé par tous. Il est construit à partir du widget [map_view](https://github.com/Bigorneau15652/map_view).

État : utilisable. La lecture, l'affichage, le mode dessin et un fichier prêt à l'emploi des départements et des régions français (voir [DATA.md](DATA.md)) sont faits.

### Fonctions

- Un objet par ligne : une forme (un polygone GeoJSON dans la colonne Shape), une épingle (colonnes Latitude et Longitude) ou les deux.
- Un mode dessin (bouton crayon en haut à droite) pour créer, retoucher, déplacer et effacer des formes sur la carte. Chaque forme dessinée devient une ligne du tableau, et chaque modification y est écrite.
- La couleur de remplissage vient d'une colonne Color (code HEX comme `#4A90D9`). La bordure est de la même couleur, plus foncée.
- Une étiquette (nom et description) s'affiche à la sélection de la ligne ou au clic sur la forme. Les étiquettes sont du texte simple, dessinées au-dessus des formes et des épingles.
- Sélection dans les deux sens : sélectionner une ligne centre la carte dessus, cliquer une forme ou une épingle sélectionne la ligne dans Grist. Le zoom choisi par l'utilisateur n'est jamais modifié : si la forme suivante est plus grande, il suffit de dézoomer.
- Une forme sélectionnée a un remplissage plus opaque ; sa bordure ne change pas.
- Les formes imbriquées restent utilisables : les grandes formes sont dessinées en premier, les petites par-dessus, si bien qu'un bâtiment reste cliquable dans son site.
- Les filtres sont ceux de Grist : le widget n'affiche que les lignes que sa section affiche (filtre par couleur, par nom, lien avec un autre widget par « Sélectionner par »).
- Un seul fond de carte, choisi dans un catalogue de 11 couches de l'IGN, trois cartes libres (OpenStreetMap, CyclOSM, OpenTopoMap) et vos propres cartes (voir [MAPS.md](MAPS.md)). Un clic affiche aussitôt la carte, OK enregistre le choix, Annuler remet la carte précédente.
- Une réglette de transparence du remplissage des formes, en bas à gauche.
- Les boutons et les réglettes s'effacent après trois secondes sans mouvement sur la carte. La vue (position et zoom) est conservée dans le navigateur de chaque utilisateur.
- La carte peut s'ouvrir dans une fenêtre séparée, par exemple sur un second écran.
- Un fichier Excel prêt à l'emploi avec les contours des départements et des régions français, à importer dans Grist ([DATA.md](DATA.md)).
- Interface en français et en anglais, selon la langue du navigateur.

### Mode dessin

Le bouton crayon active et désactive le mode dessin ; quand il est actif, un cadre de couleur entoure la carte. Une barre d'outils à gauche de la carte a, en groupes séparés, les trois outils de forme (rectangle, ovale, forme libre), la gomme, le bouton de fusion et l'interrupteur d'accrochage. Sans outil enfoncé, l'éditeur est dans son mode normal : sélectionner une forme, la retoucher, la déplacer. Un second clic sur l'outil enfoncé, la touche Échap ou la fin d'un tracé ramènent au mode normal. Une ligne en haut de la carte explique ce qu'on peut faire.

- Rectangle et ovale : glissez sur la carte. Maintenez Maj pour un carré ou un cercle.
- Forme libre : cliquez chaque point, puis cliquez sur le premier point, double-cliquez ou appuyez sur Entrée pour fermer la forme. Retour arrière retire le dernier point. Échap ou un clic droit annule le tracé en cours (les touches fonctionnent quand le widget a le focus : cliquez d'abord sur la carte).
- Retouche : sélectionnez une forme (cliquez-la, ou sélectionnez sa ligne). Tirez une poignée ronde pour déplacer un point, tirez la petite poignée au milieu d'un côté pour ajouter un point, double-cliquez un point pour le retirer. Un rectangle ou un ovale garde ses huit poignées et son type : le curseur indique la direction de chaque poignée (flèches haut et bas, gauche et droite, ou en diagonale aux coins), une main sur la poignée de rotation, et une info-bulle dit ce que fait chaque poignée, et un coin tiré avec Maj garde les proportions. Une poignée ronde verte au-dessus d'un rectangle ou d'un ovale le fait tourner (Maj : par pas de 15 degrés) ; la rotation est enregistrée dans la forme. Tirez la forme elle-même pour la déplacer.
- Gomme : cliquez une forme pour l'effacer : la cellule Shape est vidée et la ligne reste dans le tableau avec son nom, sa couleur et ses autres colonnes, prête à être redessinée. La touche Suppr efface aussi la forme sélectionnée.
- Fusion (un carré et un cercle qui se chevauchent) : sélectionnez d'abord une forme (c'est la forme 1), appuyez sur le bouton de fusion, puis dessinez une seconde forme avec le rectangle, l'ovale ou la forme libre. La seconde forme n'est pas enregistrée comme une ligne. Trois boutons apparaissent à droite du bouton de fusion : 1 + 2 additionne les deux formes, 1 − 2 retire la forme 2 de la forme 1 (un trou, par exemple un patio), 2 − 1 ne garde de la forme 2 que ce qui sort de la forme 1. Le résultat de l'opération choisie s'affiche aussitôt sur la carte, et la forme 2 peut encore être déplacée (tirez-la), redimensionnée, tournée ou retouchée avec ses poignées avant de valider : le résultat suit. Pendant le réglage de la seconde forme, tirez-la pour la déplacer (la carte se déplace avec la barre espace maintenue). Dès qu'un bouton d'opération est enfoncé, un clic sur la carte en dehors de la seconde forme (ou Entrée) valide : le résultat remplace la forme de la ligne 1 (son nom, sa couleur et ses autres colonnes sont conservés) et c'est définitif, sauf par Ctrl+Z. Échap annule et les boutons disparaissent.
- Barre espace maintenue, puis glisser : déplace la carte pendant qu'un outil est actif. La molette zoome comme d'habitude.
- Accrochage : le curseur est attiré par les sommets des formes voisines, si bien que deux bâtiments qui se touchent partagent leur sommet. Les formes restent des lignes indépendantes. Maintenez Alt pour ignorer l'accrochage un instant.
- Annuler : Ctrl+Z (Cmd+Z sur Mac) quand le widget a le focus annule les 20 dernières actions. Le bouton Annuler de Grist fonctionne aussi.
- Une nouvelle forme demande son nom, reçoit la couleur `#4A90D9` et est écrite comme une nouvelle ligne. Changez sa couleur dans le tableau.
- Vous pouvez aussi partir du tableau : saisissez d'abord les noms (et les couleurs) des lignes, sélectionnez une ligne qui n'a pas encore de forme, puis dessinez. La forme est alors écrite dans cette ligne, sans demander de nom. La ligne peut déjà avoir une épingle (Latitude et Longitude) : elle garde son épingle et reçoit sa forme, avec une seule étiquette pour les deux. La ligne d'aide indique quelle ligne recevra la forme.

Le mode dessin demande l'accès en écriture : le widget demande le niveau d'accès « Complet ». Il n'utilise que le tableau auquel il est rattaché. Si le tableau est lié à un autre widget (« Sélectionner par »), une nouvelle ligne ne reçoit pas la valeur du lien : renseignez-la dans le tableau.

### Colonnes

| Colonne | Type | Obligatoire |
|---|---|:---:|
| Name | tout type | oui |
| Shape | Texte | Shape, ou bien Latitude et Longitude |
| Latitude, Longitude | Numérique | Shape, ou bien Latitude et Longitude |
| Color | Texte | non |
| Description | Texte | non |

La colonne Shape contient du texte GeoJSON, par exemple `{"type":"Feature","properties":{"kind":"rectangle"},"geometry":{"type":"Polygon","coordinates":[[[3.86,43.60],[3.89,43.60],[3.89,43.62],[3.86,43.62],[3.86,43.60]]]}}`. Les coordonnées sont la longitude puis la latitude, en degrés (WGS 84) : la forme se place sur la carte sans aucun calage. Une géométrie `Polygon` ou `MultiPolygon` seule est aussi acceptée, donc des contours exportés de QGIS peuvent être collés tels quels. Les propriétés `kind` (`rectangle`, `ellipse` ou `polygon`) et `rotation` (degrés, dans le sens des aiguilles d'une montre à l'écran) sont facultatives : les sommets sont toujours dans la géométrie.

Limites, pour que le widget reste rapide et sûr : 2 millions de caractères par cellule, 50 000 sommets par forme, 500 polygones par forme. Une ligne dont la colonne Shape est illisible est exclue, et un bandeau au-dessus de la carte nomme la colonne à vérifier, le nombre de lignes et quelques exemples.

### Installation pas à pas

1. Sur GitHub, ouvrez le dépôt, puis Settings, puis Pages. Sous Source, choisissez « Deploy from a branch », la branche `main` et le dossier `/ (root)`, puis cliquez sur Save. Attendez une à deux minutes.
2. L'adresse du widget est `https://VOTRE-COMPTE.github.io/map_builder/index.html`.
3. Dans Grist : Ajouter, puis Ajouter une page, puis choisissez Personnalisée. Collez l'adresse du widget et donnez-lui l'accès complet (« Complet ») : il est nécessaire pour écrire les formes que vous dessinez.
4. Dans le panneau de droite, sous le niveau d'accès, associez les colonnes.

Si votre serveur Grist n'est pas `grist.numerique.gouv.fr`, modifiez deux endroits dans `index.html` : l'adresse du script `grist-plugin-api.js` et l'hôte indiqué dans la ligne Content-Security-Policy située au-dessus.

### Sécurité et confidentialité

Aucun script externe sauf l'API de plugin Grist, chargée depuis votre serveur Grist. Leaflet, son plugin de regroupement et polygon-clipping (MIT) sont dans `vendor`. Une politique de sécurité de contenu limite les scripts à ce site et les images à https. Le widget ne lit et n'écrit que le tableau auquel il est rattaché, et seulement les colonnes associées. Les données du tableau ne sont jamais envoyées. Chaque fournisseur de carte voit l'adresse IP des utilisateurs, la zone affichée et le site qui affiche la carte. Les formes ne sont jamais téléchargées : elles viennent du tableau. Les étiquettes et les noms sont écrits comme du texte, jamais comme du HTML. Le texte de la colonne Shape est vérifié (types, plages, tailles) avant le dessin. Les messages entre le widget et les fenêtres séparées ne sont acceptés que du même site et de la fenêtre ouverte par le widget, et les réglages qu'ils portent sont vérifiés avant usage.

### Tests

`tests/run.js`, `tests/edit.js` et `tests/admin-data.js` lancent le widget dans un navigateur sans fenêtre avec un Grist simulé (`tests/mock-grist.js`) : lecture et dessin des formes, sélection et zoom, bandeaux, panneau étroit en mode sombre, 3 000 formes, et tout le mode dessin (rectangle, ovale, forme libre, retouche, déplacement, gomme, annulation, accrochage, écritures refusées). La commande est indiquée en tête de `tests/run.js`.

### Publier une modification

Les navigateurs gardent les fichiers de GitHub Pages environ dix minutes. Les scripts et les styles sont appelés avec `?v=0.7.0` : changez ce numéro dans `index.html`, `window.html`, `catalog.html` et `js/window-link.js` à chaque version.

Licence : MIT. Leaflet est sous licence BSD 2-Clause, Leaflet.markercluster et polygon-clipping sous licence MIT.
