// Minimal translation helper shared by the widget page and the separate map window.
// The language is picked from the browser: French if it starts with "fr", English otherwise.
(function () {
  const dictionaries = {
    fr: {
      // Column mapping shown in the Grist creator panel
      columnLongitude: `Longitude`,
      columnLatitude: `Latitude`,
      columnDescription: `Description (étiquette)`,
      columnShape: `Forme (GeoJSON)`,
      columnColor: `Couleur (HEX ou nom)`,

      // Data messages
      noData: `Aucune donnée à afficher.`,
      needColumns: `Associez la colonne Name et la colonne Shape (ou les colonnes Latitude et Longitude) dans le panneau de droite, sous le niveau d'accès.`,
      shapesIgnored: `{count} ligne(s) ignorée(s) : forme illisible dans la colonne « {shape} » (exemples : {examples}). Une forme est un texte GeoJSON de type Polygon ou MultiPolygon.`,
      rowsIgnored: `{count} ligne(s) ignorée(s) : coordonnées invalides dans les colonnes « {lat} » et « {lng} » (exemples : {examples}). Vérifiez ces colonnes dans le tableau.`,
      andOthers: `{examples} et {rest} autres`,
      needsApiKey: `La carte « {name} » nécessite une clé API. Ouvrez le catalogue de cartes pour la renseigner.`,

      // Tools
      openCatalog: `Catalogue de cartes`,
      openWindow: `Ouvrir la carte dans une fenêtre séparée`,
      dockWindow: `Réintégrer la carte dans Grist`,
      dockedMessage: `La carte est affichée dans une fenêtre séparée. Elle suit la ligne sélectionnée dans le tableau.`,
      dockButton: `Réintégrer la carte`,
      windowBlocked: `Le navigateur a bloqué la fenêtre. Autorisez les fenêtres surgissantes pour ce site puis cliquez de nouveau sur le bouton.`,
      windowWaiting: `En attente des données de Grist…`,
      zoomSlider: `Niveau de zoom`,
      transparency: `Transparence`,
      transparencyTitle: `Transparence du remplissage des formes`,

      // Catalogue menu
      menuTitle: `Catalogue de cartes`,
      ok: `OK`,
      save: `Enregistrer`,
      editMap: `Modifier cette carte`,
      dialogTitleEdit: `Modifier la carte`,
      sectionReference: `Cartes de référence (IGN)`,
      sectionBase: `Autres fonds de carte`,
      sectionCustom: `Mes cartes`,
      sourceIgn: `Géoplateforme (IGN)`,
      sourceCustom: `Carte ajoutée`,
      needsKeyBadge: `clé API requise`,
      deleteMap: `Supprimer cette carte`,
      other: `Autre…`,

      // "Other" dialog
      dialogTitle: `Ajouter une carte`,
      fieldName: `Nom de la carte`,
      fieldUrl: `Adresse des tuiles`,
      fieldUrlHelp: `Doit commencer par https:// et contenir {z}, {x} et {y}. Placez {apikey} à l'endroit de la clé, si la carte en demande une.`,
      fieldCopyright: `Droits d'auteur à afficher`,
      fieldKey: `Clé API (facultative)`,
      fieldKeyHelp: `La clé est enregistrée en clair dans les options du widget, donc visible par les personnes qui ont accès au document. Restreignez-la à un domaine chez le fournisseur.`,
      cancel: `Annuler`,
      create: `Nouveau`,
      errName: `Saisissez un nom.`,
      errUrl: `L'adresse doit commencer par https:// et être une adresse valide.`,
      errUrlPlaceholders: `L'adresse doit contenir {z}, {x} et {y}.`,
      errUrlOther: `L'adresse contient un marqueur non pris en charge : {name}.`,
      errKeyMissing: `Cette carte nécessite une clé API : saisissez-la dans le champ Clé API.`,
      errKeyUnused: `Une clé est saisie mais l'adresse ne contient pas {apikey} : ajoutez-le à l'endroit de la clé.`,
      // Drawing mode
      editMode: `Modifier les formes`,
      editNeedsShape: `Associez la colonne Shape dans le panneau de droite pour dessiner des formes.`,
      toolRectangle: `Rectangle`,
      toolEllipse: `Ovale`,
      toolPolygon: `Forme libre`,
      toolErase: `Gomme`,
      toolSnap: `Accrochage aux sommets des formes voisines (Alt pour l'ignorer un instant)`,
      hint_select: `Cliquez une forme pour la retoucher : tirez un point pour le déplacer, tirez le milieu d'un trait pour ajouter un point, double-clic sur un point pour le retirer. Poignée du haut : faire tourner un rectangle ou un ovale (Maj : par pas de 15 degrés). Coin avec Maj : garder les proportions. Tirez la forme pour la déplacer. Ctrl+Z (Cmd+Z sur Mac) : annuler. Espace + glisser : déplacer la carte.`,
      hintTarget: `La forme sera enregistrée sur la ligne « {name} », qui n'a pas encore de forme.`,
      hint_rectangle: `Rectangle : glissez sur la carte (Maj : carré). Espace + glisser : déplacer la carte.`,
      hint_ellipse: `Ovale : glissez sur la carte (Maj : cercle). Espace + glisser : déplacer la carte.`,
      hint_polygon: `Forme libre : cliquez pour poser chaque point, puis cliquez sur le premier point, double-cliquez ou appuyez sur Entrée pour fermer la forme. Retour arrière : retirer le dernier point. Échap ou clic droit : annuler le tracé.`,
      hint_erase: `Gomme : cliquez une forme pour l'effacer. La ligne reste dans le tableau, sans forme. Ctrl+Z (Cmd+Z sur Mac) la rétablit.`,
      toolFusion: `Fusion : combiner la forme sélectionnée avec une seconde forme à dessiner`,
      hint_fusion: `Fusion : dessinez la seconde forme avec le rectangle, l'ovale ou la forme libre. Vous verrez ensuite le résultat de 1 + 2, de 1 − 2 ou de 2 − 1 avant de valider (la forme 1 est celle qui était sélectionnée).`,
      fusionNeedsShape: `Sélectionnez d'abord, dans le tableau ou sur la carte, la ligne dont la forme doit être modifiée.`,
      fusionEmpty: `Ce résultat est vide ou trop grand : choisissez une autre opération ou déplacez la seconde forme.`,
      fusionOpAdd: `1 + 2 : addition des deux formes`,
      fusionOpFirst: `1 − 2 : la forme 2 est retirée de la forme 1 (un trou, un patio)`,
      fusionOpSecond: `2 − 1 : de la forme 2, on ne garde que ce qui sort de la forme 1`,
      hint_fusion_pending: `Fusion : la forme 1 est celle qui était sélectionnée, la forme 2 celle que vous venez de dessiner. Déplacez-la ou retouchez-la comme une forme, choisissez l'opération avec les trois boutons à droite de la fusion, puis cliquez sur la carte en dehors de la forme 2 (ou appuyez sur Entrée) pour valider, c'est définitif. Échap annule. Espace + glisser : déplacer la carte.`,
      fusionFailed: `Les deux formes n'ont pas pu être combinées. Redessinez la seconde forme.`,
      handleMove: `Tirez pour déplacer ce point (double-clic : le retirer)`,
      handleAdd: `Tirez pour ajouter un point`,
      handleRotate: `Tirez pour faire tourner la forme (Maj : par pas de 15 degrés)`,
      handleResize: `Tirez pour redimensionner (Maj sur un coin : garder les proportions)`,
      shapeNameTitle: `Nouvelle forme`,
      shapeNameField: `Nom de la forme`,
      defaultShapeName: `Forme {number}`,
      shapeErased: `Forme « {name} » effacée : la ligne reste dans le tableau. Ctrl+Z (Cmd+Z sur Mac) la rétablit.`,
      writeFailed: `Le tableau n'a pas pu être modifié : {error}`,
      tooManyPoints: `Cette forme a {count} points : trop pour les retoucher un par un. Vous pouvez la déplacer ou la supprimer.`
    },
    en: {
      columnLongitude: `Longitude`,
      columnLatitude: `Latitude`,
      columnDescription: `Description (label)`,
      columnShape: `Shape (GeoJSON)`,
      columnColor: `Colour (HEX or name)`,

      noData: `No data to show.`,
      needColumns: `Map the Name column and the Shape column (or the Latitude and Longitude columns) in the right-hand panel, under the access level.`,
      shapesIgnored: `{count} row(s) ignored: unreadable shape in column "{shape}" (examples: {examples}). A shape is a GeoJSON text of type Polygon or MultiPolygon.`,
      rowsIgnored: `{count} row(s) ignored: invalid coordinates in columns "{lat}" and "{lng}" (examples: {examples}). Check these columns in the table.`,
      andOthers: `{examples} and {rest} more`,
      needsApiKey: `The map "{name}" needs an API key. Open the map catalogue to enter it.`,

      openCatalog: `Map catalogue`,
      openWindow: `Open the map in a separate window`,
      dockWindow: `Put the map back in Grist`,
      dockedMessage: `The map is shown in a separate window. It follows the row selected in the table.`,
      dockButton: `Put the map back`,
      windowBlocked: `The browser blocked the window. Allow pop-ups for this site then click the button again.`,
      windowWaiting: `Waiting for data from Grist…`,
      zoomSlider: `Zoom level`,
      transparency: `Transparency`,
      transparencyTitle: `Transparency of the fill of the shapes`,

      menuTitle: `Map catalogue`,
      ok: `OK`,
      save: `Save`,
      editMap: `Edit this map`,
      dialogTitleEdit: `Edit the map`,
      sectionReference: `Reference maps (IGN)`,
      sectionBase: `Other base maps`,
      sectionCustom: `My maps`,
      sourceIgn: `Géoplateforme (IGN)`,
      sourceCustom: `Added map`,
      needsKeyBadge: `API key required`,
      deleteMap: `Delete this map`,
      other: `Other…`,


      dialogTitle: `Add a map`,
      fieldName: `Map name`,
      fieldUrl: `Tile address`,
      fieldUrlHelp: `Must start with https:// and contain {z}, {x} and {y}. Put {apikey} where the key goes, if the map needs one.`,
      fieldCopyright: `Copyright to display`,
      fieldKey: `API key (optional)`,
      fieldKeyHelp: `The key is stored in clear text in the widget options, so people with access to the document can see it. Restrict it to a domain at the provider.`,
      cancel: `Cancel`,
      create: `New`,
      errName: `Enter a name.`,
      errUrl: `The address must start with https:// and be a valid address.`,
      errUrlPlaceholders: `The address must contain {z}, {x} and {y}.`,
      errUrlOther: `The address contains an unsupported marker: {name}.`,
      errKeyMissing: `This map needs an API key: enter it in the API key field.`,
      errKeyUnused: `A key is entered but the address has no {apikey}: add it where the key goes.`,
      // Drawing mode
      editMode: `Edit shapes`,
      editNeedsShape: `Map the Shape column in the right-hand panel to draw shapes.`,
      toolRectangle: `Rectangle`,
      toolEllipse: `Oval`,
      toolPolygon: `Free shape`,
      toolErase: `Eraser`,
      toolSnap: `Snap to the corners of neighbouring shapes (hold Alt to ignore it for a moment)`,
      hint_select: `Click a shape to reshape it: drag a point to move it, drag the middle of a side to add a point, double-click a point to remove it. Top handle: turn a rectangle or an oval (Shift: steps of 15 degrees). Corner with Shift: keep the proportions. Drag the shape to move it. Ctrl+Z (Cmd+Z on a Mac): undo. Space + drag: move the map.`,
      hintTarget: `The shape will be saved on the row "{name}", which has no shape yet.`,
      hint_rectangle: `Rectangle: drag on the map (Shift: square). Space + drag: move the map.`,
      hint_ellipse: `Oval: drag on the map (Shift: circle). Space + drag: move the map.`,
      hint_polygon: `Free shape: click to place each point, then click the first point, double-click or press Enter to close the shape. Backspace: remove the last point. Esc or right click: cancel the drawing.`,
      hint_erase: `Eraser: click a shape to erase it. The row stays in the table, without a shape. Ctrl+Z (Cmd+Z on a Mac) brings it back.`,
      toolFusion: `Merge: combine the selected shape with a second shape to draw`,
      hint_fusion: `Merge: draw the second shape with the rectangle, the oval or the free shape. You will then see the result of 1 + 2, 1 - 2 or 2 - 1 before you confirm (shape 1 is the one that was selected).`,
      fusionNeedsShape: `First select, in the table or on the map, the row whose shape must be changed.`,
      fusionEmpty: `This result is empty or too large: choose another operation or move the second shape.`,
      fusionOpAdd: `1 + 2: the two shapes added`,
      fusionOpFirst: `1 - 2: shape 2 is cut out of shape 1 (a hole, a patio)`,
      fusionOpSecond: `2 - 1: of shape 2, only what lies outside shape 1 is kept`,
      hint_fusion_pending: `Merge: shape 1 is the one that was selected, shape 2 the one you just drew. Move it or reshape it like any shape, choose the operation with the three buttons to the right of the merge button, then click on the map outside shape 2 (or press Enter) to confirm, it is final. Esc cancels. Space + drag: move the map.`,
      fusionFailed: `The two shapes could not be combined. Draw the second shape again.`,
      handleMove: `Drag to move this point (double-click: remove it)`,
      handleAdd: `Drag to add a point`,
      handleRotate: `Drag to turn the shape (Shift: steps of 15 degrees)`,
      handleResize: `Drag to resize (Shift on a corner: keep the proportions)`,
      shapeNameTitle: `New shape`,
      shapeNameField: `Name of the shape`,
      defaultShapeName: `Shape {number}`,
      shapeErased: `Shape "{name}" erased: the row stays in the table. Ctrl+Z (Cmd+Z on a Mac) brings it back.`,
      writeFailed: `The table could not be changed: {error}`,
      tooManyPoints: `This shape has {count} points: too many to reshape one by one. You can still move or delete it.`
    }
  };

  const lang = String(navigator.language || ``).toLowerCase().startsWith(`fr`) ? `fr` : `en`;

  // Returns the translated text for a key, replacing each {name} with values[name].
  function t(key, values) {
    const template = dictionaries[lang][key];
    if (template === undefined) return key;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      values && values[name] !== undefined ? String(values[name]) : match
    );
  }

  window.mapBuilderI18n = { t };
})();
