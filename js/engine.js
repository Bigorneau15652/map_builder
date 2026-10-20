// The map itself. It is created once and then updated in place: switching the base map,
// moving the transparency slider or editing one row never rebuilds the whole map.
// A row can be a shape (drawn on a canvas layer), a pin (clustered), or both.
(function () {
  const { pinIcon, resolve, darken } = window.mapBuilderColors;
  const { tileUrl } = window.mapBuilderCatalog;

  const MAX_ZOOM = 20;
  const CLUSTER_RADIUS = 30;
  const NO_CLUSTER_ZOOM = 18;
  const FIT_PADDING = [30, 30];
  const FIT_MAX_ZOOM = 13;
  const SELECTED_Z_OFFSET = 1000;
  const BORDER_WEIGHT = 2;
  // A selected shape is shown by a more opaque fill; its border does not change.
  const SELECTED_FILL_BOOST = 0.3;
  const FRANCE_CENTER = [46.6, 2.4];
  const FRANCE_ZOOM = 5;
  const VIEW_SAVE_DELAY_MS = 300;

  class MapEngine {
    // container: the element that receives the map.
    // handlers.onSelect(id): called when the user clicks a pin.
    constructor(container, handlers) {
      this.handlers = handlers || {};
      this.entries = new Map();      // row id -> { marker, signature, point }
      this.shapes = new Map();       // row id -> { layer, signature, shape }
      this.shapeOpacity = 0.45;
      this.editHandler = null;       // set by the drawing mode: receives the clicks on the shapes
      this.selectedId = null;
      this.baseLayer = null;
      this.baseKey = ``;
      this.pendingView = null;       // saved view to restore when the first pins arrive
      this.hasFitted = false;        // the map is fitted on the pins only once, at the start
      this.suppressPan = false;      // the first selection must not move a restored view
      this.viewReady = false;        // true once the first view (saved or fitted) is in place
      this.viewTimer = null;

      this.map = L.map(container, { zoomControl: false, wheelPxPerZoomLevel: 90, maxZoom: MAX_ZOOM });
      this.map.setView(FRANCE_CENTER, FRANCE_ZOOM);
      // Shapes share one canvas (light with thousands of shapes), below the pins.
      this.renderer = L.canvas({ padding: 0.3 });

      this.cluster = L.markerClusterGroup({
        chunkedLoading: true,
        disableClusteringAtZoom: NO_CLUSTER_ZOOM,
        maxClusterRadius: CLUSTER_RADIUS,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => this._clusterIcon(cluster)
      });
      this.cluster.on(`click`, (event) => {
        const id = event.layer.options.rowId;
        this.select(id, { pan: false });
        if (this.handlers.onSelect) this.handlers.onSelect(id);
      });
      this.map.addLayer(this.cluster);

      // Every change of the view (centre and zoom) is reported, so that the saved view is always
      // the one shown on the map. Nothing is reported before the first view is in place.
      this.map.on(`moveend`, () => this._reportView());
      this.map.on(`zoomend`, () => {
        if (this.handlers.onZoom) this.handlers.onZoom(this.map.getZoom());
      });
      // A pending save is written at once when the page is closed or hidden.
      window.addEventListener(`pagehide`, () => this._flushView());

      // The accent colour of a label follows the colour of its pin.
      this.map.on(`popupopen`, (event) => {
        const source = event.popup._source;
        const id = source && source.options.rowId !== undefined ? source.options.rowId : event.popup.options.rowId;
        if (id === undefined) return;
        const entry = this.entries.get(id) || this.shapes.get(id);
        const element = event.popup.getElement();
        const color = entry && (entry.point || entry.shape).color;
        if (element && entry) element.style.setProperty(`--accent`, resolve(color));
      });
    }

    // ----------------------------------------------------------------- Layers

    _makeTileLayer(entry) {
      return L.tileLayer(tileUrl(entry), {
        attribution: entry.attribution,
        minZoom: entry.minZoom,
        maxNativeZoom: entry.maxNativeZoom,
        maxZoom: MAX_ZOOM,
        subdomains: entry.subdomains || `abc`,
        keepBuffer: 1
      });
    }

    // Shows a base map (or none when the entry is null or lacks its key). The same map is
    // not loaded twice.
    setBase(entry) {
      const wanted = !entry || (entry.needsKey && !entry.apiKey) ? `` : tileUrl(entry);
      if (this.baseLayer && wanted === this.baseKey) return;
      if (this.baseLayer) this.map.removeLayer(this.baseLayer);
      this.baseLayer = null;
      this.baseKey = wanted;
      if (!wanted) return;
      this.baseLayer = this._makeTileLayer(entry).addTo(this.map);
    }

    // ------------------------------------------------------------------- View

    // Zoom chosen with the zoom slider.
    setZoom(zoom) {
      this.map.setZoom(zoom);
    }

    // The view saved at the last visit: it replaces the automatic fit when the pins arrive.
    restoreView(view) {
      this.pendingView = view;
    }

    _reportView() {
      if (!this.handlers.onViewChange || !this.viewReady) return;
      clearTimeout(this.viewTimer);
      this.viewTimer = setTimeout(() => this._flushView(), VIEW_SAVE_DELAY_MS);
    }

    _flushView() {
      if (!this.handlers.onViewChange || !this.viewReady) return;
      clearTimeout(this.viewTimer);
      const center = this.map.getCenter();
      this.handlers.onViewChange({ lat: center.lat, lng: center.lng, zoom: this.map.getZoom() });
    }

    // ------------------------------------------------------------------ Size

    invalidateSize() {
      this.map.invalidateSize();
    }

    // ---------------------------------------------------------------- Content

    // Shows the pins and the shapes of the table, then sets the first view when needed.
    setContent(points, shapes) {
      this.setPoints(points);
      this.setShapes(shapes);
      this._positionFirstView();
    }

    // ------------------------------------------------------------------ Points

    // Brings the pins in line with the given points, touching only what changed.
    setPoints(points) {
      const wanted = new Map(points.map((p) => [p.id, p]));
      const toAdd = [];
      const toRemove = [];

      for (const [id, entry] of this.entries) {
        if (!wanted.has(id)) {
          toRemove.push(entry.marker);
          this.entries.delete(id);
        }
      }
      for (const point of points) {
        const signature = `${point.lat}|${point.lng}|${point.name}|${point.description}|${point.color}`;
        const entry = this.entries.get(point.id);
        if (!entry) {
          const marker = this._makeMarker(point);
          this.entries.set(point.id, { marker, signature, point });
          toAdd.push(marker);
        } else if (entry.signature !== signature) {
          entry.marker.setLatLng([point.lat, point.lng]);
          // The title is read again when the icon is rebuilt.
          entry.marker.options.title = point.name;
          entry.marker.setIcon(pinIcon(resolve(point.color), point.id === this.selectedId));
          entry.signature = signature;
          entry.point = point;
        }
      }

      if (toRemove.length) this.cluster.removeLayers(toRemove);
      if (toAdd.length) this.cluster.addLayers(toAdd);
    }

    // The view is set once, when the first pins or shapes appear (saved view, or fit on all of
    // them). After that it only moves when the user moves it or when a row is selected: a table
    // linked to another one replaces its rows at every selection, which must not change zoom.
    _positionFirstView() {
      if (this.hasFitted || !(this.entries.size || this.shapes.size)) return;
      this.hasFitted = true;
      if (this.pendingView) {
        const { lat, lng, zoom } = this.pendingView;
        this.map.setView([lat, lng], zoom, { animate: false });
        this.pendingView = null;
        this.suppressPan = true;
      } else {
        this._fit();
      }
      // Moves made by the first positioning are not saved; later ones are.
      setTimeout(() => { this.viewReady = true; }, 0);
    }

    // ------------------------------------------------------------------ Shapes

    // Brings the shapes in line with the given list, touching only what changed. Large shapes
    // are drawn first so that a building stays visible and clickable on top of its site.
    setShapes(shapes) {
      const wanted = new Map(shapes.map((shape) => [shape.id, shape]));
      let reorder = false;
      for (const [id, entry] of this.shapes) {
        if (!wanted.has(id)) {
          entry.layer.remove();
          this.shapes.delete(id);
          reorder = true;
        }
      }
      for (const shape of shapes) {
        const geometry = JSON.stringify(shape.polygons);
        const signature = `${geometry}|${shape.rotation}|${shape.name}|${shape.description}|${shape.color}`;
        const entry = this.shapes.get(shape.id);
        if (!entry) {
          const layer = this._makeShape(shape);
          this.shapes.set(shape.id, { layer, signature, geometry, shape });
          layer.addTo(this.map);
          reorder = true;
        } else if (entry.signature !== signature) {
          if (entry.geometry !== geometry) {
            entry.layer.setLatLngs(shape.polygons);
            entry.geometry = geometry;
            reorder = true;
          }
          entry.shape = shape;
          entry.signature = signature;
          entry.layer.setStyle(this._shapeStyle(shape, shape.id === this.selectedId));
        }
      }
      if (reorder) this._orderShapes();
      if (this.handlers.onShapesChanged) this.handlers.onShapesChanged();
    }

    _shapeStyle(shape, selected) {
      const fill = resolve(shape.color);
      return {
        color: darken(fill),
        weight: BORDER_WEIGHT,
        fillColor: fill,
        fillOpacity: Math.min(1, this.shapeOpacity + (selected ? SELECTED_FILL_BOOST : 0))
      };
    }

    _makeShape(shape) {
      const layer = L.polygon(shape.polygons, {
        smoothFactor: 0.4,
        ...this._shapeStyle(shape, shape.id === this.selectedId),
        renderer: this.renderer, rowId: shape.id, bubblingMouseEvents: false
      });
      layer.on(`click`, (event) => {
        // In drawing mode the clicks belong to the editor.
        if (this.editHandler) {
          this.editHandler.shapeClick(shape.id, event);
          return;
        }
        this.select(shape.id, { pan: false });
        if (this.handlers.onSelect) this.handlers.onSelect(shape.id);
        this._showShapePopup(shape.id, event.latlng);
      });
      layer.on(`mousedown`, (event) => {
        if (this.editHandler) this.editHandler.shapeDown(shape.id, event);
      });
      layer.on(`mouseover`, () => { if (this.editHandler) this.editHandler.shapeOver(true); });
      layer.on(`mouseout`, () => { if (this.editHandler) this.editHandler.shapeOver(false); });
      return layer;
    }

    // The label of a shape, opened at a position. It is built only when it opens, as for the pins.
    _showShapePopup(id, latlng) {
      if (!this.shapes.has(id)) return;
      L.popup({ className: `map-popup`, rowId: id })
        .setLatLng(latlng)
        .setContent(this._popupContent(id))
        .openOn(this.map);
    }

    // Draws the large shapes first (below) and the small ones last (above).
    _orderShapes() {
      const sorted = [...this.shapes.values()].sort((a, b) => b.shape.size - a.shape.size);
      for (const entry of sorted) entry.layer.bringToFront();
    }

    // Shows a shape at another place or form while it is being edited, before the table has it.
    previewShape(id, polygons, rotation) {
      const entry = this.shapes.get(id);
      if (!entry) return;
      entry.layer.setLatLngs(polygons);
      entry.shape = { ...entry.shape, polygons, rotation: rotation === undefined ? entry.shape.rotation : rotation };
    }

    // Transparency of the fill of all the shapes (0 to 1 of opacity); the border stays solid.
    setShapeOpacity(opacity) {
      this.shapeOpacity = opacity;
      for (const entry of this.shapes.values()) {
        entry.layer.setStyle(this._shapeStyle(entry.shape, entry.shape.id === this.selectedId));
      }
    }

    _makeMarker(point) {
      const marker = L.marker([point.lat, point.lng], {
        title: point.name,
        rowId: point.id,
        icon: pinIcon(resolve(point.color), point.id === this.selectedId)
      });
      // The label is built only when it opens, so thousands of pins stay light.
      marker.bindPopup(() => this._popupContent(point.id), { className: `map-popup` });
      return marker;
    }

    // Label content built from text nodes only: table data is never read as HTML.
    _popupContent(id) {
      const entry = this.entries.get(id);
      const shapeEntry = this.shapes.get(id);
      const content = entry ? entry.point : (shapeEntry ? shapeEntry.shape : null);
      const root = document.createElement(`div`);
      if (!content) return root;
      const title = document.createElement(`div`);
      title.className = `popup-title`;
      title.textContent = content.name;
      root.appendChild(title);
      if (content.description) {
        const description = document.createElement(`div`);
        description.className = `popup-desc`;
        // Both a real line break and the two characters \n start a new line.
        const lines = content.description.split(/\r?\n|\\n/);
        lines.forEach((line, index) => {
          if (index > 0) description.appendChild(document.createElement(`br`));
          description.appendChild(document.createTextNode(line));
        });
        root.appendChild(description);
      }
      return root;
    }

    // The box around all the pins and shapes.
    _bounds() {
      const bounds = L.latLngBounds([]);
      for (const entry of this.entries.values()) bounds.extend(entry.marker.getLatLng());
      for (const entry of this.shapes.values()) bounds.extend(entry.layer.getBounds());
      return bounds;
    }

    _fit() {
      const bounds = this._bounds();
      if (bounds.isValid()) {
        this.map.fitBounds(bounds, { maxZoom: FIT_MAX_ZOOM, padding: FIT_PADDING, animate: false });
      }
    }

    // --------------------------------------------------------------- Selection

    _clusterIcon(cluster) {
      const count = cluster.getChildCount();
      const size = count < 10 ? `small` : count < 100 ? `medium` : `large`;
      const selected = this.selectedId !== null &&
        cluster.getAllChildMarkers().some((m) => m.options.rowId === this.selectedId);
      const content = document.createElement(`div`);
      const label = document.createElement(`span`);
      label.textContent = String(count);
      content.appendChild(label);
      return L.divIcon({
        html: content.outerHTML,
        className: `marker-cluster marker-cluster-${size}${selected ? ` marker-cluster-selected` : ``}`,
        iconSize: new L.Point(40, 40)
      });
    }

    // Gives the pin and the shape of a row their selected (or normal) look.
    _setSelectedLook(id, selected) {
      const result = { marker: null, layer: null };
      const entry = this.entries.get(id);
      if (entry) {
        entry.marker.setIcon(pinIcon(resolve(entry.point.color), selected));
        entry.marker.setZIndexOffset(selected ? SELECTED_Z_OFFSET : 0);
        result.marker = entry.marker;
      }
      const shapeEntry = this.shapes.get(id);
      if (shapeEntry) {
        shapeEntry.layer.setStyle(this._shapeStyle(shapeEntry.shape, selected));
        result.layer = shapeEntry.layer;
      }
      return result;
    }

    // Highlights the pin and the shape of a row. With pan, the map moves to it and opens its label.
    select(id, options) {
      const previous = this._setSelectedLook(this.selectedId, false);
      this.selectedId = id === undefined ? null : id;
      const current = this._setSelectedLook(this.selectedId, true);
      // Only the clusters holding these two pins need a new icon.
      const touched = [previous.marker, current.marker].filter(Boolean);
      if (touched.length) this.cluster.refreshClusters(touched);
      if (!(options && options.pan)) return;
      const position = current.marker ? current.marker.getLatLng()
        : current.layer ? current.layer.getBounds().getCenter() : null;
      if (!position) return;
      // The first selection after a restored view leaves the map alone when the row is in view.
      if (this.suppressPan) {
        this.suppressPan = false;
        if (this.map.getBounds().contains(position)) return;
      }

      // The zoom chosen by the user is kept: the map is only centred on the row.
      this.map.panTo(position);
      if (!current.marker) {
        if (!this.editHandler) this._showShapePopup(id, position);
        return;
      }
      // A pin hidden inside a cluster is only centred (its cluster is highlighted); its label
      // opens when the pin is visible.
      const marker = current.marker;
      if (marker._icon) {
        marker.openPopup();
        return;
      }
      // A pin outside the view is drawn once the map has moved; its label then opens, unless
      // another row was selected in the meantime or the pin is still inside a cluster.
      this.map.once(`moveend`, () => setTimeout(() => {
        if (this.selectedId === id && marker._icon) marker.openPopup();
      }, 0));
    }

    clearSelection() {
      this.select(null);
      this.map.closePopup();
    }
  }

  window.MapEngine = MapEngine;
})();
