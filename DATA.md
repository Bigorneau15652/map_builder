# Department and region outlines / Contours des départements et des régions

English first, version française plus bas.

## English

`data/departements-regions.xlsx` (and the same table as `data/departements-regions.csv`) holds the outlines of the 101 French departments and of the 18 regions, ready to be imported in Grist and drawn by map_builder. No calibration is needed: the coordinates are geographic (WGS 84), like the ones of any shape of the widget.

### Columns

| Column | Content |
|---|---|
| Name | Name of the department or of the region |
| Shape | The outline, as GeoJSON text (see the README) |
| Color | A colour in HEX. Departments take the colour of their region |
| Description | A label, for example "Département 34, région Occitanie" |
| Code | The official code (text: 01, 2A, 971...) |
| Type | `Département` or `Région` |
| Region | The region of a department (empty for a region) |

Filter on Type to see only the departments or only the regions. Departments are drawn above regions.

### Import in Grist

1. Open your Grist document, click "Ajouter" then "Importer depuis un fichier", choose `departements-regions.xlsx` and validate. A table with the seven columns is created. Check that Shape and Code are Text columns.
2. Add a page with a custom widget on that table, paste the address of map_builder and map the columns: Name, Shape, Color and Description.
3. Add the Type column to a filter of the page to choose what is shown.

### Source and rights

- Source: IGN, Admin Express COG, edition 2018, converted to GeoJSON by Grégoire David ([france-geojson](https://github.com/gregoiredavid/france-geojson)), who publishes it under the Licence ouverte (Etalab): the producer is to be cited ("IGN, Admin Express"), and the data may be reused freely, including commercially. Check the current terms of Admin Express before a publication: [cartes.gouv.fr](https://cartes.gouv.fr/).
- The overseas collectivities (Polynesia, Saint-Barthélemy, Saint-Martin, Saint-Pierre-et-Miquelon, Wallis-et-Futuna) are not in the source.
- The 2018 edition is used: the outlines of the departments are unchanged, and the regions are those since 2016 (Corsica is a region of its own).

### Simplification

The outlines are simplified so that each cell stays under the 32 767 characters that Excel accepts: 250 metres for the departments and 600 metres for the regions (a tolerance of 0.003 and 0.0075 degrees). The simplification keeps the border shared by two neighbours identical, so no gap or overlap appears. They are good for a view of a department or a region, not for a view of a street: draw your own shapes for that. Islands under about 0.3 square kilometre are left out.

To rebuild the files: `pip install shapely openpyxl` then `python3 tools/build_admin_data.py` (the source files are downloaded once). `node tests/admin-data.js` checks that the widget reads and draws all the rows.

## Français

`data/departements-regions.xlsx` (et le même tableau en `data/departements-regions.csv`) contient les contours des 101 départements français et des 18 régions, prêts à être importés dans Grist et dessinés par map_builder. Aucun calage n'est nécessaire : les coordonnées sont géographiques (WGS 84), comme celles de n'importe quelle forme du widget.

### Colonnes

| Colonne | Contenu |
|---|---|
| Name | Nom du département ou de la région |
| Shape | Le contour, en texte GeoJSON (voir le README) |
| Color | Une couleur en HEX. Les départements prennent la couleur de leur région |
| Description | Une étiquette, par exemple « Département 34, région Occitanie » |
| Code | Le code officiel (texte : 01, 2A, 971...) |
| Type | `Département` ou `Région` |
| Region | La région d'un département (vide pour une région) |

Filtrez sur Type pour ne voir que les départements ou que les régions. Les départements sont dessinés au-dessus des régions.

### Import dans Grist

1. Ouvrez votre document Grist, cliquez sur « Ajouter » puis sur « Importer depuis un fichier », choisissez `departements-regions.xlsx` et validez. Une table avec les sept colonnes est créée. Vérifiez que Shape et Code sont des colonnes de type Texte.
2. Ajoutez une page avec un widget personnalisé sur cette table, collez l'adresse de map_builder et associez les colonnes : Name, Shape, Color et Description.
3. Ajoutez la colonne Type à un filtre de la page pour choisir ce qui est affiché.

### Source et droits

- Source : IGN, Admin Express COG, édition 2018, converti en GeoJSON par Grégoire David ([france-geojson](https://github.com/gregoiredavid/france-geojson)), qui le publie sous Licence ouverte (Etalab) : le producteur doit être cité (« IGN, Admin Express ») et les données peuvent être réutilisées librement, y compris commercialement. Vérifiez les conditions actuelles d'Admin Express avant une publication : [cartes.gouv.fr](https://cartes.gouv.fr/).
- Les collectivités d'outre-mer (Polynésie, Saint-Barthélemy, Saint-Martin, Saint-Pierre-et-Miquelon, Wallis-et-Futuna) ne sont pas dans la source.
- L'édition 2018 est utilisée : les contours des départements n'ont pas changé, et les régions sont celles depuis 2016 (la Corse est une région à part entière).

### Simplification

Les contours sont simplifiés pour que chaque cellule reste sous les 32 767 caractères acceptés par Excel : 250 mètres pour les départements et 600 mètres pour les régions (une tolérance de 0,003 et de 0,0075 degré). La simplification garde identique la frontière commune de deux voisins, si bien qu'aucun trou ni chevauchement n'apparaît. Les contours conviennent à une vue d'un département ou d'une région, pas à une vue d'une rue : dessinez vos propres formes pour cela. Les îles de moins de 0,3 kilomètre carré environ sont écartées.

Pour refaire les fichiers : `pip install shapely openpyxl` puis `python3 tools/build_admin_data.py` (les fichiers sources sont téléchargés une fois). `node tests/admin-data.js` vérifie que le widget lit et dessine toutes les lignes.
