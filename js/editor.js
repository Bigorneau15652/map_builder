// The drawing mode: create, reshape, move and erase shapes on the map. Every finished action is
// written to the Grist table through `store`; the map is redrawn from the table as for any change.
// Nothing here knows Grist: the page that builds the editor gives it a store and a few hooks.
(function () {
  const { t } = window.mapBuilderI18n;
  const { serializeShape, round, normalizeAngle } = window.mapBuilderGeometry;
  const crs = L.CRS.EPSG3857;

  const DEFAULT_COLOR = `#4A90D9`;
  const SNAP_PIXELS = 10;
  const CLOSE_PIXELS = 10;
  const MIN_DRAG_PIXELS = 5;
  const CLICK_TOLERANCE = 4;
  const MAX_HANDLES = 500;
  const ELLIPSE_POINTS = 64;
  const MAX_UNDO = 20;
  const ROTATE_HANDLE_PIXELS = 32;
  const ROTATE_STEP_DEGREES = 15;
  const MAX_RESULT_POINTS = 50000;
  // The id given to the second shape of a fusion, which is not a row of the table.
  const SECOND_ID = `__second__`;
  const TOOLS = [`select`, `rectangle`, `ellipse`, `polygon`, `erase`];

  // Positions are kept as [lat, lng] pairs. Sizes are computed in the projection of the map
  // (metres), so that a circle looks like a circle and a square like a square on the screen.
  const toPoint = ([lat, lng]) => crs.project(L.latLng(lat, lng));
  const toPosition = (point) => {
    const latlng = crs.unproject(point);
    return [round(latlng.lat), round(latlng.lng)];
  };
  const copyPolygons = (polygons) => polygons.map((polygon) => polygon.map((ring) => ring.map((p) => [p[0], p[1]])));

  // Shapes as the polygon-clipping library reads them (a list of polygons, [lng, lat], closed
  // rings), and back.
  const toClip = (polygons) => polygons.map((polygon) => polygon.map((ring) => [...ring.map(([lat, lng]) => [lng, lat]), [ring[0][1], ring[0][0]]]));
  const fromClip = (multi) => multi.map((polygon) => polygon.map((ring) => ring.slice(0, -1).map(([lng, lat]) => [round(lat), round(lng)])));

  // Turns a vector by an angle (radians, counter-clockwise in the projection).
  const turn = (x, y, angle) => L.point(x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle));

  // The ring of a rectangle or of an oval inscribed in a box. The box is given in a frame whose
  // origin is `center` and which is turned by `theta` (0 for a box drawn on the map: its
  // coordinates are then the projected ones, with a centre at 0, 0).
  function boxRing(kind, box, center = L.point(0, 0), theta = 0) {
    const place = (x, y) => {
      const turned = turn(x, y, theta);
      return toPosition(L.point(center.x + turned.x, center.y + turned.y));
    };
    if (kind === `rectangle`) {
      return [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]].map(([x, y]) => place(x, y));
    }
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const rx = (box.maxX - box.minX) / 2;
    const ry = (box.maxY - box.minY) / 2;
    const ring = [];
    for (let i = 0; i < ELLIPSE_POINTS; i += 1) {
      const angle = (2 * Math.PI * i) / ELLIPSE_POINTS;
      ring.push(place(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)));
    }
    return ring;
  }

  // The frame of a rectangle or of an oval: its centre, its turn and its box in that frame.
  function frameOf(ring, rotation) {
    const points = ring.map(toPoint);
    const center = L.point(points.reduce((sum, p) => sum + p.x, 0) / points.length, points.reduce((sum, p) => sum + p.y, 0) / points.length);
    const theta = -((rotation || 0) * Math.PI) / 180;
    const local = points.map((p) => turn(p.x - center.x, p.y - center.y, -theta));
    return {
      center, theta,
      box: {
        minX: Math.min(...local.map((p) => p.x)), maxX: Math.max(...local.map((p) => p.x)),
        minY: Math.min(...local.map((p) => p.y)), maxY: Math.max(...local.map((p) => p.y))
      }
    };
  }

  // The kind of resize cursor for a handle that sits in the direction (dx, dy) of the shape
  // (in the projection, y up), once the shape is turned by theta.
  function resizeCursor(dx, dy, theta) {
    const turned = turn(dx, dy, theta);
    const degrees = ((Math.atan2(-turned.y, turned.x) * 180) / Math.PI + 360) % 180;
    if (degrees < 22.5 || degrees >= 157.5) return `ew-resize`;
    if (degrees < 67.5) return `nwse-resize`;
    if (degrees < 112.5) return `ns-resize`;
    return `nesw-resize`;
  }

  // A box from two corners; with square, the box becomes a square (or a circle for an oval).
  function boxFromCorners(a, b, square) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (square) {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      dx = (dx < 0 ? -1 : 1) * side;
      dy = (dy < 0 ? -1 : 1) * side;
    }
    return { minX: Math.min(a.x, a.x + dx), maxX: Math.max(a.x, a.x + dx), minY: Math.min(a.y, a.y + dy), maxY: Math.max(a.y, a.y + dy) };
  }

  const isTyping = (target) => Boolean(target && target.closest && target.closest(`input, textarea, select, [contenteditable]`));

  class ShapeEditor {
    // store: { create({ name, shape, color }) -> id, update(id, shape), remove(id) } (promises).
    // hooks: onTool(tool), onHint(text), onMessage(text), askName(defaultName) -> promise of
    // a name or null, selectRow(id) moves the Grist cursor to a row.
    constructor(engine, store, hooks) {
      this.engine = engine;
      this.map = engine.map;
      this.store = store;
      this.hooks = hooks;
      this.active = false;
      this.tool = `select`;
      this.snap = true;
      this.selectedId = null;
      this.spaceDown = false;
      this.drawing = null;       // a box or an outline being drawn
      this.moving = null;        // a shape being dragged as a whole
      this.working = null;       // the shape whose points are being retouched
      this.handles = [];
      this.undoStack = [];
      this.idAlias = new Map();  // id of a row erased then restored -> its new id
      this.container = this.map.getContainer();
      this.layer = L.layerGroup().addTo(this.map);
      this.snapMarker = null;
      this.lastMouse = null;
      this.emptyRows = new Map(); // rows of the table that have no shape yet: id -> name
      this.fusion = false;       // the next shape drawn is added to, or taken from, the selected shape
      this.pending = null;       // a fusion waiting for its operation and its validation
      this.resultFrame = null;
      this.secondLayer = null;

      this.onMouseDown = (event) => this.pointerDown(event);
      this.onMouseMove = (event) => this.pointerMove(event);
      this.onMouseUp = (event) => this.pointerUp(event);
      this.onDoubleClick = (event) => this.doubleClick(event);
      this.onKeyDown = (event) => this.keyDown(event);
      this.onKeyUp = (event) => this.keyUp(event);
      // A click on the empty map only drops the handles: the row of the table stays selected,
      // so that the next shape drawn can still go to it.
      this.onMapClick = () => {
        if (this.pending) {
          if (this.pending.chosen) this.confirmFusion();
        } else if (this.tool === `select`) this.selectShape(null, false);
      };
      this.onContextMenu = (event) => this.contextMenu(event);
      this.onZoomEnd = () => this.refresh();
    }

    // ----------------------------------------------------------------- Modes

    setActive(on) {
      if (on === this.active) return;
      this.active = on;
      if (on) {
        this.engine.editHandler = this;
        this.map.closePopup();
        this.map.doubleClickZoom.disable();
        this.container.addEventListener(`mousedown`, this.onMouseDown, true);
        this.container.addEventListener(`dblclick`, this.onDoubleClick, true);
        this.container.addEventListener(`contextmenu`, this.onContextMenu, true);
        document.addEventListener(`mousemove`, this.onMouseMove);
        document.addEventListener(`mouseup`, this.onMouseUp);
        document.addEventListener(`keydown`, this.onKeyDown);
        document.addEventListener(`keyup`, this.onKeyUp);
        this.map.on(`click`, this.onMapClick);
        this.map.on(`zoomend`, this.onZoomEnd);
        this.setTool(`select`);
        if (this.engine.selectedId !== null) this.selectShape(this.engine.selectedId, false);
      } else {
        if (this.pending) this.cancelFusion();
        this.cancelWork();
        this.clearHandles();
        this.fusion = false;
        this.engine.editHandler = null;
        this.container.removeEventListener(`mousedown`, this.onMouseDown, true);
        this.container.removeEventListener(`dblclick`, this.onDoubleClick, true);
        this.container.removeEventListener(`contextmenu`, this.onContextMenu, true);
        document.removeEventListener(`mousemove`, this.onMouseMove);
        document.removeEventListener(`mouseup`, this.onMouseUp);
        document.removeEventListener(`keydown`, this.onKeyDown);
        document.removeEventListener(`keyup`, this.onKeyUp);
        this.map.off(`click`, this.onMapClick);
        this.map.off(`zoomend`, this.onZoomEnd);
        this.map.doubleClickZoom.enable();
        this.map.dragging.enable();
        this.container.classList.remove(`edit-draw`, `edit-erase`, `edit-move`);
        this.hooks.onHint(``);
      }
      this.hooks.onTool(on ? this.tool : null);
    }

    setTool(tool) {
      if (!TOOLS.includes(tool) || (this.pending && tool !== `select`)) return;
      this.cancelWork();
      this.tool = tool;
      if (tool !== `select`) this.clearHandles();
      else if (this.selectedId !== null) this.showHandles(this.selectedId);
      this.applyCursor();
      this.hooks.onTool(tool);
      this.refreshHint();
    }

    // The help line: what the active tool does, and which row will receive a new shape.
    refreshHint() {
      if (!this.active) return;
      const target = this.targetRow();
      const drawing = this.tool === `rectangle` || this.tool === `ellipse` || this.tool === `polygon`;
      if (this.fusion || this.pending) {
        this.hooks.onHint(t(this.pending ? `hint_fusion_pending` : `hint_fusion`));
        return;
      }
      this.hooks.onHint(t(`hint_${this.tool}`) + (drawing && target ? ` ${t(`hintTarget`, { name: target.name || `#${target.id}` })}` : ``));
    }

    // The selected row of the table, when it has no shape yet: the next shape drawn goes to it.
    targetRow() {
      const id = this.engine.selectedId;
      return id !== null && this.emptyRows.has(id) ? { id, name: this.emptyRows.get(id) } : null;
    }

    setEmptyRows(rows) {
      this.emptyRows = new Map(rows.map((row) => [row.id, row.name]));
      this.refreshHint();
    }

    // The fusion button: the next shape drawn is not a new row, it is combined with the selected one.
    setFusion(on) {
      if (this.pending) return;
      if (on && !this.engine.shapes.has(this.engine.selectedId)) {
        this.hooks.onMessage(t(`fusionNeedsShape`));
        return;
      }
      this.fusion = on;
      this.hooks.onTool(this.tool);
      this.refreshHint();
    }

    // Starts the fusion of the selected shape (1) with the shape just drawn (2). Shape 2 can still
    // be moved and reshaped like any shape; the three buttons choose the operation, and the
    // result is shown on the map at every change. Enter writes it, Esc gives up.
    beginFusion(polygons, kind, rotation) {
      const id = this.engine.selectedId;
      const entry = this.engine.shapes.get(id);
      if (!entry) return;
      this.clearHandles();
      const layer = L.polygon(polygons, {
        color: `#111111`, weight: 2, dashArray: `6 4`, fillColor: `#ffffff`, fillOpacity: 0.2,
        renderer: this.engine.renderer, bubblingMouseEvents: false
      }).addTo(this.map);
      layer.bringToFront();
      layer.on(`click`, L.DomEvent.stopPropagation);
      layer.on(`mousedown`, (event) => this.shapeDown(SECOND_ID, event));
      layer.on(`mouseover`, () => this.shapeOver(true));
      layer.on(`mouseout`, () => this.shapeOver(false));
      this.secondLayer = layer;
      this.pending = {
        id, kind: entry.shape.kind, rotation: entry.shape.rotation || 0, original: copyPolygons(entry.shape.polygons),
        second: { kind, rotation, polygons }, operation: `add`, chosen: false, result: []
      };
      this.fusion = false;
      this.selectedId = SECOND_ID;
      this.updateResult();
      this.showHandles(SECOND_ID);
      this.applyCursor();
      this.hooks.onTool(this.tool);
      this.refreshHint();
    }

    setFusionOperation(operation) {
      if (!this.pending) return;
      this.pending.operation = operation;
      // Once an operation is chosen, a click on the map outside the second shape confirms it.
      this.pending.chosen = true;
      this.updateResult();
      this.hooks.onTool(this.tool);
    }

    // Computes the result of the chosen operation and shows it in place of shape 1.
    updateResult() {
      const pending = this.pending;
      if (!pending) return;
      cancelAnimationFrame(this.resultFrame);
      this.resultFrame = null;
      const first = toClip(pending.original);
      const second = toClip(pending.second.polygons);
      let polygons = [];
      try {
        const clipped = pending.operation === `add` ? polygonClipping.union(first, second)
          : pending.operation === `first` ? polygonClipping.difference(first, second) : polygonClipping.difference(second, first);
        polygons = fromClip(clipped);
      } catch (error) {
        this.hooks.onMessage(t(`fusionFailed`));
      }
      const points = polygons.reduce((sum, polygon) => sum + polygon.reduce((inner, ring) => inner + ring.length, 0), 0);
      if (points > MAX_RESULT_POINTS) polygons = [];
      pending.result = polygons;
      if (polygons.length) this.engine.previewShape(pending.id, polygons, 0);
      else {
        this.engine.previewShape(pending.id, pending.original, pending.rotation);
        this.hooks.onMessage(t(`fusionEmpty`));
      }
    }

    // While shape 2 is moved or reshaped, the result is computed at most once per frame.
    scheduleResult() {
      if (this.resultFrame) return;
      this.resultFrame = requestAnimationFrame(() => {
        this.resultFrame = null;
        this.updateResult();
      });
    }

    // Enter: the result is written to the row of shape 1.
    async confirmFusion() {
      const pending = this.pending;
      if (!pending) return;
      this.updateResult();
      if (!pending.result.length) return;
      this.endFusion();
      await this.commit(pending.id, `polygon`, pending.result, pending.original, 0, pending.rotation, pending.kind);
    }

    // Esc: nothing is written, shape 1 is as it was.
    cancelFusion() {
      const pending = this.pending;
      if (!pending) return;
      this.endFusion();
      this.engine.previewShape(pending.id, pending.original, pending.rotation);
      this.refresh();
    }

    endFusion() {
      const pending = this.pending;
      cancelAnimationFrame(this.resultFrame);
      this.resultFrame = null;
      this.clearHandles();
      if (this.secondLayer) this.secondLayer.remove();
      this.secondLayer = null;
      this.pending = null;
      this.selectedId = pending.id;
      this.container.classList.remove(`edit-move`);
      this.applyCursor();
      this.hooks.onTool(this.tool);
      this.refreshHint();
    }

    // The data of a shape of the table, or of the second shape of a fusion.
    shapeOf(id) {
      if (id === SECOND_ID) return this.pending ? this.pending.second : null;
      const entry = this.engine.shapes.get(id);
      return entry ? entry.shape : null;
    }

    // Shows a shape at another place or form while it is being edited.
    preview(id, polygons, rotation) {
      if (id !== SECOND_ID) {
        this.engine.previewShape(id, polygons, rotation);
        return;
      }
      const pending = this.pending;
      if (!pending) return;
      pending.second = { ...pending.second, polygons, rotation: rotation === undefined ? pending.second.rotation : rotation };
      this.secondLayer.setLatLngs(polygons);
      this.scheduleResult();
    }

    toggleSnap() {
      this.snap = !this.snap;
      if (!this.snap) this.showSnap(null);
      return this.snap;
    }

    // The map can be dragged with the select tool, or with the space bar held down.
    applyCursor() {
      const drawing = this.tool !== `select` && !this.spaceDown;
      // While a fusion waits, the map is moved only with the space bar, so that the second shape
      // can be dragged like any shape.
      if (drawing || (this.pending && !this.spaceDown)) this.map.dragging.disable();
      else this.map.dragging.enable();
      this.container.classList.toggle(`edit-draw`, drawing && this.tool !== `erase`);
      this.container.classList.toggle(`edit-erase`, drawing && this.tool === `erase`);
    }

    // Forgets what is being drawn or moved, without writing anything.
    cancelWork() {
      this.layer.clearLayers();
      this.drawing = null;
      this.showSnap(null);
      if (this.moving) {
        const { id, original } = this.moving;
        this.moving = null;
        this.preview(id, original);
      }
      if (this.working) {
        const { id, original, originalRotation } = this.working;
        this.working = null;
        this.preview(id, original, originalRotation);
      }
    }

    // ------------------------------------------------------------- Selection

    // Selects a shape (or none): its points can then be retouched. Called by the map clicks
    // and when the selected row of the table changes.
    selectShape(id, fromMap) {
      if (this.pending) return;
      this.selectedId = id;
      this.clearHandles();
      if (fromMap) {
        this.engine.select(id, { pan: false });
        if (id !== null) this.hooks.selectRow(id);
      }
      if (id !== null && this.tool === `select`) this.showHandles(id);
      this.refreshHint();
    }

    // Called after the table sent new rows: handles follow the shapes.
    refresh() {
      if (!this.active || this.drawing || this.moving || this.working) return;
      if (this.pending) {
        this.clearHandles();
        this.showHandles(SECOND_ID);
        this.secondLayer.bringToFront();
        return;
      }
      if (this.selectedId !== null && !this.engine.shapes.has(this.selectedId) && !this.emptyRows.has(this.selectedId)) this.selectedId = null;
      this.clearHandles();
      if (this.selectedId !== null && this.tool === `select`) this.showHandles(this.selectedId);
    }

    // Clicks on a shape, forwarded by the map (see MapEngine.editHandler).
    shapeClick(id) {
      if (this.pending) {
        if (this.pending.chosen) this.confirmFusion();
        return;
      }
      if (this.tool === `erase`) this.erase(id);
      else if (this.tool === `select`) this.selectShape(id, true);
    }

    // A press on a shape with the select tool starts moving it.
    shapeDown(id, event) {
      if ((this.pending && id !== SECOND_ID) || this.tool !== `select` || this.spaceDown || event.originalEvent.button !== 0) return;
      L.DomEvent.stop(event.originalEvent);
      const shape = this.shapeOf(id);
      if (!shape) return;
      if (id !== SECOND_ID && this.selectedId !== id) this.selectShape(id, true);
      this.clearHandles();
      this.moving = {
        id, kind: shape.kind, rotation: shape.rotation || 0, original: copyPolygons(shape.polygons),
        start: toPoint([event.latlng.lat, event.latlng.lng]), startPixel: event.containerPoint, moved: false
      };
    }

    // A right click cancels the shape being drawn.
    contextMenu(event) {
      if (!this.active || (!this.drawing && !this.moving && !this.working)) return;
      event.preventDefault();
      this.cancelWork();
      this.pressed = null;
    }

    // The mouse is over a shape: with the select tool the shape can be dragged.
    shapeOver(over) {
      this.container.classList.toggle(`edit-move`, over && this.tool === `select` && !this.spaceDown);
    }

    // ------------------------------------------------------------- Pointer

    position(event) {
      return this.map.mouseEventToLatLng(event);
    }

    // The position under the mouse, attracted by a corner of another shape (when snapping is on).
    snapped(event, ignoreId) {
      return this.snapLatLng(this.position(event), event.altKey, ignoreId);
    }

    snapLatLng(latlng, altKey, ignoreId) {
      if (!this.snap || altKey) {
        this.showSnap(null);
        return latlng;
      }
      const center = this.map.latLngToContainerPoint(latlng);
      const box = L.latLngBounds(
        this.map.containerPointToLatLng(center.subtract([SNAP_PIXELS, SNAP_PIXELS])),
        this.map.containerPointToLatLng(center.add([SNAP_PIXELS, SNAP_PIXELS])));
      let best = null;
      let bestDistance = SNAP_PIXELS;
      for (const [id, entry] of this.engine.shapes) {
        if (id === ignoreId || !entry.layer.getBounds().intersects(box)) continue;
        for (const polygon of entry.shape.polygons) {
          for (const ring of polygon) {
            for (const [lat, lng] of ring) {
              const distance = this.map.latLngToContainerPoint([lat, lng]).distanceTo(center);
              if (distance < bestDistance) {
                bestDistance = distance;
                best = L.latLng(lat, lng);
              }
            }
          }
        }
      }
      this.showSnap(best);
      return best || latlng;
    }

    showSnap(latlng) {
      if (this.snapMarker) {
        this.snapMarker.remove();
        this.snapMarker = null;
      }
      if (!latlng) return;
      this.snapMarker = L.circleMarker(latlng, { radius: 8, color: `#d81b60`, weight: 2, fill: false, interactive: false }).addTo(this.map);
    }

    pointerDown(event) {
      if (!this.active || this.pending || this.spaceDown || event.button !== 0 || this.tool === `select` || this.tool === `erase`) return;
      if (event.target.closest(`.leaflet-popup, .leaflet-marker-icon`)) return;
      event.preventDefault();
      event.stopPropagation();
      // The keys (Esc, Enter, space...) go to the widget only when it has the focus.
      window.focus();
      this.container.focus({ preventScroll: true });
      const at = this.snapped(event);
      const pixel = this.map.latLngToContainerPoint(at);
      if (this.tool === `polygon`) {
        this.pressed = { pixel, moved: false };
        return;
      }
      this.drawing = { kind: this.tool, anchor: toPoint([at.lat, at.lng]), anchorPixel: pixel, current: null };
    }

    pointerMove(event) {
      if (!this.active) return;
      this.lastMouse = event;
      if (this.moving) return this.moveShape(event);
      if (this.pressed) {
        const pixel = this.map.mouseEventToContainerPoint(event);
        if (pixel.distanceTo(this.pressed.pixel) > CLICK_TOLERANCE) this.pressed.moved = true;
        return;
      }
      if (this.drawing && this.drawing.kind !== `polygon`) return this.dragBox(event);
      if (this.tool === `select` || this.spaceDown || !this.container.contains(event.target)) return;
      const at = this.snapped(event);
      if (this.tool === `polygon` && this.drawing) this.drawOutline(at);
    }

    pointerUp(event) {
      if (!this.active) return;
      if (this.moving) return this.endMove();
      if (this.pressed) {
        const pressed = this.pressed;
        this.pressed = null;
        if (!pressed.moved) this.addVertex(this.snapped(event));
        return;
      }
      if (this.drawing && this.drawing.kind !== `polygon`) this.endBox(event);
    }

    // ------------------------------------------------- Rectangle and oval

    dragBox(event) {
      const drawing = this.drawing;
      const at = this.snapped(event);
      drawing.current = toPoint([at.lat, at.lng]);
      const box = boxFromCorners(drawing.anchor, drawing.current, event.shiftKey);
      this.layer.clearLayers();
      L.polygon(boxRing(drawing.kind, box), this.previewStyle()).addTo(this.layer);
    }

    endBox(event) {
      const drawing = this.drawing;
      this.drawing = null;
      this.layer.clearLayers();
      this.showSnap(null);
      if (!drawing.current) return;
      const pixel = this.map.latLngToContainerPoint(crs.unproject(drawing.current));
      if (Math.abs(pixel.x - drawing.anchorPixel.x) < MIN_DRAG_PIXELS && Math.abs(pixel.y - drawing.anchorPixel.y) < MIN_DRAG_PIXELS) return;
      const box = boxFromCorners(drawing.anchor, drawing.current, event.shiftKey);
      this.create(drawing.kind, [[boxRing(drawing.kind, box)]], 0);
    }

    previewStyle() {
      return { color: `#111111`, weight: 2, dashArray: `6 4`, fillColor: DEFAULT_COLOR, fillOpacity: 0.25, interactive: false };
    }

    // ---------------------------------------------------------- Free outline

    addVertex(at) {
      if (!this.drawing) this.drawing = { kind: `polygon`, points: [] };
      const points = this.drawing.points;
      // A click on the first point closes the outline.
      if (points.length >= 3) {
        const first = this.map.latLngToContainerPoint(points[0]);
        if (first.distanceTo(this.map.latLngToContainerPoint(at)) <= CLOSE_PIXELS) return this.finishOutline();
      }
      points.push(at);
      this.drawOutline(at);
    }

    drawOutline(cursor) {
      const points = this.drawing.points;
      this.layer.clearLayers();
      L.polygon([...points, cursor], this.previewStyle()).addTo(this.layer);
      points.forEach((point, index) => {
        L.circleMarker(point, { radius: index === 0 ? 7 : 4, color: `#111111`, weight: 2, fillColor: `#ffffff`, fillOpacity: 1, interactive: false }).addTo(this.layer);
      });
    }

    doubleClick(event) {
      if (!this.active || this.tool !== `polygon` || !this.drawing) return;
      event.preventDefault();
      event.stopPropagation();
      // The two clicks of the double click added the same point twice.
      const points = this.drawing.points;
      if (points.length > 1 && this.map.latLngToContainerPoint(points[points.length - 1]).distanceTo(this.map.latLngToContainerPoint(points[points.length - 2])) <= CLICK_TOLERANCE) points.pop();
      this.finishOutline();
    }

    finishOutline() {
      const drawing = this.drawing;
      if (!drawing || drawing.points.length < 3) return;
      this.drawing = null;
      this.layer.clearLayers();
      this.showSnap(null);
      this.create(`polygon`, [[drawing.points.map((p) => [round(p.lat), round(p.lng)])]], 0);
    }

    // ------------------------------------------------------------- Create

    // Writes a new shape. When the selected row of the table has no shape yet, the shape goes to
    // that row; otherwise a new row is created, after asking for its name.
    async create(kind, polygons, rotation) {
      const text = serializeShape(kind, polygons, rotation);
      // Once a shape is drawn (or given up), the editor goes back to the select mode.
      this.setTool(`select`);
      if (this.fusion) {
        this.fusion = false;
        this.beginFusion(polygons, kind, rotation);
        return;
      }
      const target = this.targetRow();
      if (target) {
        await this.run(async () => {
          await this.store.update(target.id, text);
          this.push({ undo: () => this.store.update(this.resolve(target.id), ``) });
        });
        return;
      }
      const defaultName = t(`defaultShapeName`, { number: this.engine.shapes.size + 1 });
      const name = await this.hooks.askName(defaultName);
      if (name === null) return;
      await this.run(async () => {
        const id = await this.store.create({ name, shape: text, color: DEFAULT_COLOR });
        this.push({ undo: () => this.store.remove(this.resolve(id)) });
        this.hooks.selectRow(id);
      });
    }

    // -------------------------------------------------------------- Move

    moveShape(event) {
      const moving = this.moving;
      const pixel = this.map.mouseEventToContainerPoint(event);
      if (!moving.moved && pixel.distanceTo(moving.startPixel) <= CLICK_TOLERANCE) return;
      moving.moved = true;
      const here = this.snapped(event, moving.id);
      const delta = toPoint([here.lat, here.lng]).subtract(moving.start);
      moving.polygons = moving.original.map((polygon) => polygon.map((ring) => ring.map((p) => toPosition(toPoint(p).add(delta)))));
      this.preview(moving.id, moving.polygons);
    }

    endMove() {
      const moving = this.moving;
      this.moving = null;
      this.showSnap(null);
      if (!moving.moved) {
        this.showHandles(moving.id);
        return;
      }
      this.commit(moving.id, moving.kind, moving.polygons, moving.original, moving.rotation, moving.rotation);
    }

    // ----------------------------------------------------------- Retouching

    clearHandles() {
      for (const handle of this.handles) handle.remove();
      this.handles = [];
    }

    handleIcon(className) {
      return L.divIcon({ className: `handle ${className}`, iconSize: [14, 14] });
    }

    // The cursor of a handle is a class (see the stylesheet), which nothing else can override.
    setHandleCursor(handle, cursor) {
      const element = handle.getElement();
      element.className = element.className.replace(/\bcur-\S+/g, ``).trim();
      element.classList.add(`cur-${cursor}`);
    }

    makeHandle(latlng, className, title) {
      const handle = L.marker(latlng, { draggable: true, icon: this.handleIcon(className), keyboard: false, zIndexOffset: 2000, bubblingMouseEvents: false, title });
      // A listener is what keeps a click on a handle from reaching the map (which would deselect).
      handle.on(`click`, L.DomEvent.stopPropagation);
      handle.on(`dblclick`, L.DomEvent.stopPropagation);
      handle.addTo(this.map);
      this.handles.push(handle);
      return handle;
    }

    showHandles(id) {
      const shape = this.shapeOf(id);
      if (!shape) return;
      const { kind, polygons, rotation } = shape;
      const single = polygons.length === 1 && polygons[0].length === 1;
      if ((kind === `rectangle` && single && polygons[0][0].length === 4) || (kind === `ellipse` && single && polygons[0][0].length === ELLIPSE_POINTS)) {
        this.showBoxHandles(id, kind, polygons, rotation || 0);
        return;
      }
      const vertices = polygons.reduce((sum, polygon) => sum + polygon.reduce((inner, ring) => inner + ring.length, 0), 0);
      if (vertices > MAX_HANDLES) {
        this.hooks.onMessage(t(`tooManyPoints`, { count: vertices }));
        return;
      }
      this.showPointHandles(id, kind === `polygon` ? kind : `polygon`);
    }

    // Starts a retouch: a working copy of the shape that the handles change.
    beginWork(id, kind) {
      const shape = this.shapeOf(id);
      const rotation = shape.rotation || 0;
      this.working = {
        id, kind, originalRotation: rotation, rotation,
        original: copyPolygons(shape.polygons), polygons: copyPolygons(shape.polygons)
      };
      return this.working;
    }

    finishWork() {
      const work = this.working;
      this.working = null;
      this.showSnap(null);
      if (!work) return;
      this.commit(work.id, work.kind, work.polygons, work.original, work.rotation, work.originalRotation);
    }

    // One round handle per point, and a small one in the middle of each side to add a point.
    showPointHandles(id, kind) {
      this.shapeOf(id).polygons.forEach((polygon, polygonIndex) => polygon.forEach((ring, ringIndex) => {
        const rebuild = () => {
          this.clearHandles();
          this.showPointHandles(id, kind);
        };
        ring.forEach((position, index) => {
          const handle = this.makeHandle(position, `vertex`, t(`handleMove`));
          this.setHandleCursor(handle, `point`);
          handle.on(`dragstart`, () => { this.beginWork(id, kind); });
          handle.on(`drag`, (event) => {
            const at = this.snapLatLng(event.latlng, this.lastMouse && this.lastMouse.altKey, id);
            handle.setLatLng(at);
            this.working.polygons[polygonIndex][ringIndex][index] = [at.lat, at.lng];
            this.preview(id, this.working.polygons);
          });
          handle.on(`dragend`, () => { this.finishWork(); });
          // A double click on a point removes it (a shape keeps at least three points).
          handle.on(`dblclick`, (event) => {
            L.DomEvent.stop(event);
            if (ring.length <= 3) return;
            const work = this.beginWork(id, kind);
            work.polygons[polygonIndex][ringIndex].splice(index, 1);
            this.preview(id, work.polygons);
            this.finishWork();
          });
        });
        ring.forEach((position, index) => {
          const next = ring[(index + 1) % ring.length];
          const middle = [(position[0] + next[0]) / 2, (position[1] + next[1]) / 2];
          const handle = this.makeHandle(middle, `middle`, t(`handleAdd`));
          this.setHandleCursor(handle, `edge`);
          let newIndex = -1;
          handle.on(`dragstart`, () => {
            const work = this.beginWork(id, kind);
            newIndex = index + 1;
            work.polygons[polygonIndex][ringIndex].splice(newIndex, 0, middle);
          });
          handle.on(`drag`, (event) => {
            const at = this.snapLatLng(event.latlng, this.lastMouse && this.lastMouse.altKey, id);
            handle.setLatLng(at);
            this.working.polygons[polygonIndex][ringIndex][newIndex] = [at.lat, at.lng];
            this.preview(id, this.working.polygons);
          });
          handle.on(`dragend`, () => { this.finishWork(); rebuild(); });
        });
      }));
    }

    // Eight handles around a rectangle or an oval, to resize it (the box follows the turn of the
    // shape), and a ninth one above it to turn it. The kind of the shape is kept.
    showBoxHandles(id, kind, polygons, rotation) {
      const frame = frameOf(polygons[0][0], rotation);
      const state = { center: frame.center, theta: frame.theta, box: { ...frame.box } };
      const sides = [
        [`w`, `s`], [`e`, `s`], [`e`, `n`], [`w`, `n`], // corners: west or east, south or north
        [`w`, null], [`e`, null], [null, `s`], [null, `n`]
      ];
      const localPoint = (box, [x, y]) => L.point(
        x === `w` ? box.minX : x === `e` ? box.maxX : (box.minX + box.maxX) / 2,
        y === `s` ? box.minY : y === `n` ? box.maxY : (box.minY + box.maxY) / 2);
      const toWorld = (local) => {
        const turned = turn(local.x, local.y, state.theta);
        return toPosition(L.point(state.center.x + turned.x, state.center.y + turned.y));
      };
      const place = (box, side) => toWorld(localPoint(box, side));
      // The rotation handle sits a few pixels above the middle of the top side.
      const metresPerPixel = Math.abs(crs.project(this.map.containerPointToLatLng([1, 0])).x - crs.project(this.map.containerPointToLatLng([0, 0])).x);
      const rotateOffset = ROTATE_HANDLE_PIXELS * metresPerPixel;
      const rotatePlace = (box) => toWorld(L.point((box.minX + box.maxX) / 2, box.maxY + rotateOffset));

      const stem = L.polyline([place(state.box, [null, `n`]), rotatePlace(state.box)], { color: `#111111`, weight: 1, interactive: false }).addTo(this.map);
      this.handles.push(stem);
      const rotateHandle = this.makeHandle(rotatePlace(state.box), `rotate`, t(`handleRotate`));

      const reposition = (except) => {
        handles.forEach((other, index) => { if (other !== except) other.setLatLng(place(state.box, sides[index])); });
        if (except !== rotateHandle) rotateHandle.setLatLng(rotatePlace(state.box));
        stem.setLatLngs([place(state.box, [null, `n`]), rotatePlace(state.box)]);
      };
      const preview = (work) => {
        work.polygons = [[boxRing(kind, state.box, state.center, state.theta)]];
        work.rotation = normalizeAngle(-(state.theta * 180) / Math.PI);
        this.preview(id, work.polygons, work.rotation);
      };

      const handles = sides.map((side) => {
        const handle = this.makeHandle(place(state.box, side), side[0] && side[1] ? `corner` : `side`, t(`handleResize`));
        const dx = side[0] === `w` ? -1 : side[0] === `e` ? 1 : 0;
        const dy = side[1] === `s` ? -1 : side[1] === `n` ? 1 : 0;
        this.setHandleCursor(handle, resizeCursor(dx, dy, state.theta));
        handle.on(`dragstart`, () => { this.beginWork(id, kind); });
        handle.on(`drag`, (event) => {
          const mouse = this.lastMouse || {};
          const at = this.snapLatLng(event.latlng, mouse.altKey, id);
          const world = toPoint([at.lat, at.lng]);
          const pointer = turn(world.x - state.center.x, world.y - state.center.y, -state.theta);
          const start = this.working;
          const box = { ...frame.box };
          if (side[0] === `w`) box.minX = pointer.x;
          if (side[0] === `e`) box.maxX = pointer.x;
          if (side[1] === `s`) box.minY = pointer.y;
          if (side[1] === `n`) box.maxY = pointer.y;
          // With Shift, a corner keeps the proportions of the shape.
          if (mouse.shiftKey && side[0] && side[1]) {
            const fixed = L.point(side[0] === `w` ? frame.box.maxX : frame.box.minX, side[1] === `s` ? frame.box.maxY : frame.box.minY);
            const ratio = Math.max(Math.abs(pointer.x - fixed.x) / (frame.box.maxX - frame.box.minX), Math.abs(pointer.y - fixed.y) / (frame.box.maxY - frame.box.minY));
            const width = (frame.box.maxX - frame.box.minX) * ratio;
            const height = (frame.box.maxY - frame.box.minY) * ratio;
            Object.assign(box, boxFromCorners(fixed, L.point(side[0] === `w` ? fixed.x - width : fixed.x + width, side[1] === `s` ? fixed.y - height : fixed.y + height), false));
          }
          state.box = {
            minX: Math.min(box.minX, box.maxX), maxX: Math.max(box.minX, box.maxX),
            minY: Math.min(box.minY, box.maxY), maxY: Math.max(box.minY, box.maxY)
          };
          preview(start);
          reposition(handle);
        });
        handle.on(`dragend`, () => { this.finishWork(); });
        return handle;
      });

      this.setHandleCursor(rotateHandle, `rotate`);
      rotateHandle.on(`dragstart`, () => { this.beginWork(id, kind); });
      rotateHandle.on(`drag`, (event) => {
        const mouse = this.lastMouse || {};
        const world = toPoint([event.latlng.lat, event.latlng.lng]);
        // The handle is above the shape: its direction is the "up" of the shape, 90 degrees ahead.
        let theta = Math.atan2(world.y - state.center.y, world.x - state.center.x) - Math.PI / 2;
        if (mouse.shiftKey) {
          const step = (ROTATE_STEP_DEGREES * Math.PI) / 180;
          theta = Math.round(theta / step) * step;
        }
        state.theta = theta;
        preview(this.working);
        reposition(rotateHandle);
        handles.forEach((handle, index) => {
          const [x, y] = sides[index];
          this.setHandleCursor(handle, resizeCursor(x === `w` ? -1 : x === `e` ? 1 : 0, y === `s` ? -1 : y === `n` ? 1 : 0, state.theta));
        });
      });
      rotateHandle.on(`dragend`, () => { this.finishWork(); });
    }

    // Writes a changed shape to the table, once the gesture is over.
    async commit(id, kind, polygons, original, rotation, originalRotation, originalKind = kind) {
      const rounded = polygons.map((polygon) => polygon.map((ring) => ring.map(([lat, lng]) => [round(lat), round(lng)])));
      if (id === SECOND_ID) {
        this.preview(id, rounded, rotation);
        this.refresh();
        return;
      }
      this.preview(id, rounded, rotation);
      const before = serializeShape(originalKind, original, originalRotation);
      const saved = await this.run(async () => {
        await this.store.update(id, serializeShape(kind, rounded, rotation));
        this.push({ undo: () => this.store.update(this.resolve(id), before) });
      });
      // A refused write puts the shape back where the table has it.
      if (!saved) this.preview(id, original, originalRotation);
      this.refresh();
    }

    // ------------------------------------------------------------- Erase

    // Erasing empties the Shape cell: the row stays in the table (with its name, its colour and
    // its other columns) and can be drawn again.
    async erase(id) {
      const entry = this.engine.shapes.get(id);
      if (!entry) return;
      const { shape } = entry;
      const text = serializeShape(shape.kind, shape.polygons, shape.rotation);
      await this.run(async () => {
        await this.store.update(id, ``);
        if (this.selectedId === id) this.selectedId = null;
        this.push({ undo: () => this.store.update(this.resolve(id), text) });
        this.hooks.onMessage(t(`shapeErased`, { name: shape.name }));
      });
    }

    // -------------------------------------------------------------- Undo

    resolve(id) {
      return this.idAlias.has(id) ? this.idAlias.get(id) : id;
    }

    push(action) {
      this.undoStack.push(action);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    }

    // Ctrl+Z (Cmd+Z on a Mac) while the widget has the focus.
    async undo() {
      const action = this.undoStack.pop();
      if (!action) return;
      await this.run(() => action.undo());
    }

    // Runs a write to the table and reports a refusal in plain words.
    async run(job) {
      try {
        await job();
        return true;
      } catch (error) {
        this.hooks.onMessage(t(`writeFailed`, { error: String(error && error.message ? error.message : error).slice(0, 200) }));
        return false;
      }
    }

    // ------------------------------------------------------------ Keyboard

    keyDown(event) {
      if (!this.active || isTyping(event.target)) return;
      // While a fusion waits, Enter writes it and Esc gives up; nothing else is read.
      if (this.pending) {
        if (event.key === `Enter`) {
          event.preventDefault();
          this.confirmFusion();
        } else if (event.key === `Escape`) {
          this.cancelFusion();
        } else if (event.key === ` `) {
          event.preventDefault();
          if (!this.spaceDown) {
            this.spaceDown = true;
            this.applyCursor();
          }
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === `z`) {
        event.preventDefault();
        this.undo();
      } else if (event.key === ` `) {
        event.preventDefault();
        if (!this.spaceDown) {
          this.spaceDown = true;
          this.applyCursor();
        }
      } else if (event.key === `Escape`) {
        if (this.drawing || this.moving || this.working) this.cancelWork();
        else if (this.fusion) this.setFusion(false);
        else if (this.tool !== `select`) this.setTool(`select`);
        else this.selectShape(null, false);
      } else if (event.key === `Enter`) {
        if (this.tool === `polygon`) this.finishOutline();
      } else if (event.key === `Backspace`) {
        event.preventDefault();
        if (this.drawing && this.drawing.points && this.drawing.points.length) {
          this.drawing.points.pop();
          if (this.drawing.points.length) this.drawOutline(this.drawing.points[this.drawing.points.length - 1]);
          else {
            this.drawing = null;
            this.layer.clearLayers();
          }
        }
      } else if (event.key === `Delete`) {
        if (this.tool === `select` && this.selectedId !== null) this.erase(this.selectedId);
      }
    }

    keyUp(event) {
      if (event.key === ` ` && this.spaceDown) {
        this.spaceDown = false;
        this.applyCursor();
      }
    }
  }

  window.mapBuilderEditor = { ShapeEditor, DEFAULT_COLOR };
})();
