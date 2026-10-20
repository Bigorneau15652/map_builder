Third-party code shipped with the widget, copied unchanged from the npm packages except one edit:
the trailing sourceMappingURL comment was removed from the minified files (the map files are not shipped).

- Leaflet 1.9.4 (BSD 2-Clause): leaflet.js, leaflet.css. https://www.npmjs.com/package/leaflet/v/1.9.4
- Leaflet.markercluster 1.5.3 (MIT): leaflet.markercluster.js, MarkerCluster.css, MarkerCluster.Default.css.
  https://www.npmjs.com/package/leaflet.markercluster/v/1.5.3

- polygon-clipping 0.15.7 (MIT): polygon-clipping.umd.min.js, used to add and subtract shapes.
  https://github.com/mfogel/polygon-clipping (file `dist/polygon-clipping.umd.min.js` of the release 0.15.7; it contains the
  splaytree and robust-predicates libraries, see the licence text in the file `LICENSE`).

The images of Leaflet (layers control, default marker) are not shipped: the widget uses neither.
