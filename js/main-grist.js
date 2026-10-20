// Entry point of the Grist widget: connects Grist (columns, rows, options, selection) to the
// map, and optionally to the separate map window.
(function () {
  const { t } = window.mapBuilderI18n;
  const { normalize } = window.mapBuilderRecords;
  const { normalizeConfig, sanitizePatch } = window.mapBuilderConfig;

  // What the separate window needs to draw the same map.
  const shared = {
    points: [], shapes: [], invalid: [], columns: { shape: `Shape`, lat: `Latitude`, lng: `Longitude` },
    selectedId: null, config: normalizeConfig({}), message: ``
  };

  // The separate map window.
  const link = new window.WindowLink(
    { page: `window.html`, name: `map-view-window`, width: 1200, height: 860 },
    () => ({ ...shared }),
    {
      onSelect: (id) => selectRow(id),
      onConfig: (patch) => applyWindowPatch(patch),
      onClosed: () => app.setDocked(false)
    }
  );

  // The catalogue window, used when the widget is too small to hold the catalogue.
  const catalogLink = new window.WindowLink(
    { page: `catalog.html`, name: `map-view-catalogue`, width: 520, height: 820 },
    () => ({ config: shared.config }),
    {
      onConfig: (patch) => applyWindowPatch(patch),
      onPreview: (draft) => app.preview(draft),
      // Whatever way the window closes, a choice that was not confirmed is dropped.
      onClosed: () => app.preview(null)
    }
  );

  // A setting changed in another window is checked before it is applied and saved.
  function applyWindowPatch(patch) {
    const clean = sanitizePatch(app.config, patch);
    if (Object.keys(clean).length) app.change(clean);
  }

  // Sends the settings to the catalogue window after any change.
  function pushConfig() {
    catalogLink.send(`mapbuilder:state`, { config: shared.config });
  }

  // ------------------------------------------------ View remembered in this browser

  // The view (centre and zoom) is kept in the browser of each user, not in the document, so
  // that people working on the same document do not change each other's view.
  let viewKey = null;
  let viewLoaded = false;

  function readView() {
    try {
      const saved = JSON.parse(localStorage.getItem(viewKey) || `null`);
      const valid = saved && [saved.lat, saved.lng, saved.zoom].every(Number.isFinite);
      return valid ? saved : null;
    } catch {
      return null;
    }
  }

  function writeView(view) {
    try {
      if (view) localStorage.setItem(viewKey, JSON.stringify(view));
      else localStorage.removeItem(viewKey);
    } catch {
      // Storage can be blocked (private window, site data blocked): the map just opens fitted.
    }
  }

  // Builds the storage key from the document and table names, then restores the saved view
  // once, before the first pins are drawn.
  async function loadViewOnce() {
    if (viewLoaded) return;
    viewLoaded = true;
    const ask = async (fn) => { try { return String(await fn()); } catch { return ``; } };
    const table = await ask(() => grist.selectedTable.getTableId());
    const doc = await ask(() => grist.docApi.getDocName());
    viewKey = `mapbuilder:view:${doc}:${table}`;
    const saved = readView();
    if (saved) app.restoreView(saved);
  }

  // Moves the Grist cursor to a row (when a pin is clicked, in the widget or in the window).
  function selectRow(id) {
    shared.selectedId = id;
    if (grist.setCursorPos) grist.setCursorPos({ rowId: id }).catch(() => {});
  }

  // ------------------------------------------------ Writing the shapes to the table

  // Where the widget writes: only the table of this widget, only the mapped columns.
  let currentMapping = null;
  const store = {
    canEdit: () => Boolean(currentMapping && currentMapping.Shape),
    async create({ name, shape, color, description }) {
      const fields = {};
      const set = (key, value) => {
        if (value !== undefined && currentMapping && currentMapping[key]) fields[currentMapping[key]] = value;
      };
      set(`Name`, name);
      set(`Shape`, shape);
      set(`Color`, color);
      set(`Description`, description);
      const created = await grist.selectedTable.create({ fields });
      const first = Array.isArray(created) ? created[0] : created;
      return first && typeof first === `object` ? first.id : first;
    },
    update: (id, shape) => grist.selectedTable.update({ id, fields: { [currentMapping.Shape]: shape } }),
    remove: (id) => grist.selectedTable.destroy(id)
  };

  const app = new window.MapApp({
    store,
    onConfig: (patch) => {
      shared.config = { ...app.config };
      // Each setting is saved as its own widget option.
      for (const [name, value] of Object.entries(patch)) grist.setOption(name, value);
      link.send(`mapbuilder:state`, { ...shared });
      pushConfig();
    },
    onSelect: (id) => selectRow(id),
    onCatalogWindow: () => catalogLink.open(),
    onViewChange: (view) => { if (viewKey !== null) writeView(view); },
    // The same button opens the window, and puts the map back when it is already open.
    onWindowButton: () => {
      if (link.isOpen) {
        link.close();
        app.setDocked(false);
      } else if (link.open()) {
        app.setDocked(true);
      } else {
        app.setDataMessage(t(`windowBlocked`));
      }
    }
  }, `grist`);

  // ------------------------------------------------------------------- Grist

  const optional = true;
  grist.ready({
    requiredAccess: `full`,
    columns: [
      `Name`,
      { name: `Shape`, title: t(`columnShape`), type: `Text`, optional },
      { name: `Longitude`, title: t(`columnLongitude`), type: `Numeric`, optional },
      { name: `Latitude`, title: t(`columnLatitude`), type: `Numeric`, optional },
      { name: `Description`, title: t(`columnDescription`), type: `Text`, optional },
      { name: `Color`, title: t(`columnColor`), type: `Text`, optional }
    ],
    allowSelectBy: true
  });

  grist.onOptions((options) => {
    shared.config = normalizeConfig(options);
    app.setConfig(shared.config);
    link.send(`mapbuilder:state`, { ...shared });
    pushConfig();
  });

  grist.onRecords(async (rows, mapping) => {
    await loadViewOnce();
    currentMapping = mapping;
    const mapped = grist.mapColumnNames(rows);
    // The table needs a name column and either a shape column or both coordinate columns.
    const usable = mapped && (mapping.Shape || (mapping.Latitude && mapping.Longitude));
    if (!usable) {
      shared.message = t(`needColumns`);
      app.setDataMessage(shared.message);
      app.setData({ points: [], shapes: [], invalid: [], columns: shared.columns });
      link.send(`mapbuilder:state`, { ...shared, points: [], shapes: [], invalid: [] });
      return;
    }
    const { points, shapes, invalid } = normalize(mapped);
    shared.points = points;
    shared.shapes = shapes;
    shared.invalid = invalid;
    shared.columns = { shape: mapping.Shape, lat: mapping.Latitude, lng: mapping.Longitude };
    shared.message = points.length || shapes.length || invalid.length ? `` : t(`noData`);
    app.setDataMessage(shared.message);
    app.setData({ points, shapes, invalid, columns: shared.columns });
    link.send(`mapbuilder:state`, { ...shared });
  });

  // The selected row of the table: highlight its pin, here and in the window.
  grist.onRecord((record) => {
    shared.selectedId = record.id;
    app.select(record.id, true);
    link.send(`mapbuilder:select`, { id: record.id });
  });

  grist.onNewRecord(() => {
    shared.selectedId = null;
    app.select(null);
    link.send(`mapbuilder:select`, { id: null });
  });
})();
