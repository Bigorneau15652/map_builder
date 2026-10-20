ign-layers.js lists the 21 IGN layers of the Géoplateforme WMTS service shown in the catalogue. They need
no key (Web Mercator image layers). They were taken from the full list read in the GetCapabilities document of
https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities read on 2026-10-20.
The service describes itself as Public, with fees "none", under the terms of https://cartes.gouv.fr/cgu.
The service holds hundreds of other layers; many do not work in this widget and were left out. To add one,
read its row in the GetCapabilities document: [layer id, title, format (j = jpeg, p = png), min zoom, max zoom,
style id, dataset id]. Users can also add any layer at run time with "Other...".
