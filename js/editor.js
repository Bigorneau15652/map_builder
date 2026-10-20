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
  const TOOLS = [`select`, `rectangle`, `ellipse`, `polygon`, `erase`];

  // Positions are kept as [lat, lng] pairs. Sizes are computed in the projection of the map
  // (metres), so that a circle looks like a circle and a square like a square on the screen.
  const toPoint = ([lat, lng]) => crs.project(L.latLng(lat, lng));
  const toPosition = (point) => {
    const latlng = crs.unproject(point);
    return [round(latlng.lat), round(latlng.lng)];
  };
  const copyPolygons = (polygons) => polygons.map((polygon) => polygon.map((ring) => ring.map((p) => [p[0], p[1]])));

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

      this.onMouseDown = (event) => this.pointerDown(event);
      this.onMouseMove = (event) => this.pointerMove(event);
      this.onMouseUp = (event) => this.pointerUp(event);
      this.onDoubleClick = (event) => this.doubleClick(event);
      this.onKeyDown = (event) => this.keyDown(event);
      this.onKeyUp = (event) => this.keyUp(event);
      this.onMapClick = () => { if (this.tool === `select`) this.selectShape(null, true); };
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
        this.cancelWork();
        this.clearHandles();
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
      if (!TOOLS.includes(tool)) return;
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

    toggleSnap() {
      this.snap = !this.snap;
      if (!this.snap) this.showSnap(null);
      return this.snap;
    }

    // The map can be dragged with the select tool, or with the space bar held down.
    applyCursor() {
      const drawing = this.tool !== `select` && !this.spaceDown;
      if (drawing) this.map.dragging.disable();
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
        this.engine.previewShape(id, original);
      }
      if (this.working) {
        const { id, original, originalRotation } = this.working;
        this.working = null;
        this.engine.previewShape(id, original, originalRotation);
      }
    }

    // ------------------------------------------------------------- Selection

    // Selects a shape (or none): its points can then be retouched. Called by the map clicks
    // and when the selected row of the table changes.
    selectShape(id, fromMap) {
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
      if (this.selectedId !== null && !this.engine.shapes.has(this.selectedId) && !this.emptyRows.has(this.selectedId)) this.selectedId = null;
      this.clearHandles();
      if (this.selectedId !== null && this.tool === `select`) this.showHandles(this.selectedId);
    }

    // Clicks on a shape, forwarded by the map (see MapEngine.editHandler).
    shapeClick(id) {
      if (this.tool === `erase`) this.erase(id);
      else if (this.tool === `select`) this.selectShape(id, true);
    }

    // A press on a shape with the select tool starts moving it.
    shapeDown(id, event) {
      if (this.tool !== `select` || this.spaceDown || event.originalEvent.button !== 0) return;
      L.DomEvent.stop(event.originalEvent);
      const entry = this.engine.shapes.get(id);
      if (!entry) return;
      if (this.selectedId !== id) this.selectShape(id, true);
      this.clearHandles();
      this.moving = {
        id, kind: entry.shape.kind, rotation: entry.shape.rotation || 0, original: copyPolygons(entry.shape.polygons),
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
      if (!this.active || this.spaceDown || event.button !== 0 || this.tool === `select` || this.tool === `erase`) return;
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
      this.engine.previewShape(moving.id, moving.polygons);
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

    makeHandle(latlng, className) {
      const handle = L.marker(latlng, { draggable: true, icon: this.handleIcon(className), keyboard: false, zIndexOffset: 2000, bubblingMouseEvents: false });
      // A listener is what keeps a click on a handle from reaching the map (which would deselect).
      handle.on(`click`, L.DomEvent.stopPropagation);
      handle.on(`dblclick`, L.DomEvent.stopPropagation);
      handle.addTo(this.map);
      this.handles.push(handle);
      return handle;
    }

    showHandles(id) {
      const entry = this.engine.shapes.get(id);
      if (!entry) return;
      const { kind, polygons, rotation } = entry.shape;
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
      const entry = this.engine.shapes.get(id);
      const rotation = entry.shape.rotation || 0;
      this.working = {
        id, kind, originalRotation: rotation, rotation,
        original: copyPolygons(entry.shape.polygons), polygons: copyPolygons(entry.shape.polygons)
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
      const entry = this.engine.shapes.get(id);
      entry.shape.polygons.forEach((polygon, polygonIndex) => polygon.forEach((ring, ringIndex) => {
        const rebuild = () => {
          this.clearHandles();
          this.showPointHandles(id, kind);
        };
        ring.forEach((position, index) => {
          const handle = this.makeHandle(position, `vertex`);
          handle.on(`dragstart`, () => { this.beginWork(id, kind); });
          handle.on(`drag`, (event) => {
            const at = this.snapLatLng(event.latlng, this.lastMouse && this.lastMouse.altKey, id);
            handle.setLatLng(at);
            this.working.polygons[polygonIndex][ringIndex][index] = [at.lat, at.lng];
            this.engine.previewShape(id, this.working.polygons);
          });
          handle.on(`dragend`, () => { this.finishWork(); });
          // A double click on a point removes it (a shape keeps at least three points).
          handle.on(`dblclick`, (event) => {
            L.DomEvent.stop(event);
            if (ring.length <= 3) return;
            const work = this.beginWork(id, kind);
            work.polygons[polygonIndex][ringIndex].splice(index, 1);
            this.engine.previewShape(id, work.polygons);
            this.finishWork();
          });
        });
        ring.forEach((position, index) => {
          const next = ring[(index + 1) % ring.length];
          const middle = [(position[0] + next[0]) / 2, (position[1] + next[1]) / 2];
          const handle = this.makeHandle(middle, `middle`);
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
            this.engine.previewShape(id, this.working.polygons);
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
      const rotateHandle = this.makeHandle(rotatePlace(state.box), `rotate`);

      const reposition = (except) => {
        handles.forEach((other, index) => { if (other !== except) other.setLatLng(place(state.box, sides[index])); });
        if (except !== rotateHandle) rotateHandle.setLatLng(rotatePlace(state.box));
        stem.setLatLngs([place(state.box, [null, `n`]), rotatePlace(state.box)]);
      };
      const preview = (work) => {
        work.polygons = [[boxRing(kind, state.box, state.center, state.theta)]];
        work.rotation = normalizeAngle(-(state.theta * 180) / Math.PI);
        this.engine.previewShape(id, work.polygons, work.rotation);
      };

      const handles = sides.map((side) => {
        const handle = this.makeHandle(place(state.box, side), side[0] && side[1] ? `corner` : `side`);
        const dx = side[0] === `w` ? -1 : side[0] === `e` ? 1 : 0;
        const dy = side[1] === `s` ? -1 : side[1] === `n` ? 1 : 0;
        handle.getElement().style.cursor = resizeCursor(dx, dy, state.theta);
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

      rotateHandle.getElement().style.cursor = `grab`;
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
          handle.getElement().style.cursor = resizeCursor(x === `w` ? -1 : x === `e` ? 1 : 0, y === `s` ? -1 : y === `n` ? 1 : 0, state.theta);
        });
      });
      rotateHandle.on(`dragend`, () => { this.finishWork(); });
    }

    // Writes a changed shape to the table, once the gesture is over.
    async commit(id, kind, polygons, original, rotation, originalRotation) {
      const rounded = polygons.map((polygon) => polygon.map((ring) => ring.map(([lat, lng]) => [round(lat), round(lng)])));
      this.engine.previewShape(id, rounded, rotation);
      const before = serializeShape(kind, original, originalRotation);
      const saved = await this.run(async () => {
        await this.store.update(id, serializeShape(kind, rounded, rotation));
        this.push({ undo: () => this.store.update(this.resolve(id), before) });
      });
      // A refused write puts the shape back where the table has it.
      if (!saved) this.engine.previewShape(id, original, originalRotation);
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
      this.hooks.onTool(this.tool);
    }

    get canUndo() {
      return this.undoStack.length > 0;
    }

    async undo() {
      const action = this.undoStack.pop();
      this.hooks.onTool(this.tool);
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
