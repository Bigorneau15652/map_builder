// The map screen shared by the Grist widget and the separate map window: the map, the
// catalogue menu, the transparency slider, the banner and the message shown in place of the map.
(function () {
  const { t } = window.mapBuilderI18n;
  const catalog = window.mapBuilderCatalog;
  const { normalizeConfig } = window.mapBuilderConfig;
  const {
    CatalogMenu, TransparencyControl, h, icon, ICON_EXPAND, ICON_DOCK, ICON_EDIT, ICON_RECTANGLE,
    ICON_ELLIPSE, ICON_POLYGON, ICON_ERASE, ICON_FUSION, ICON_SNAP
  } = window.mapBuilderMenu;
  // With no tool pressed, the editor is in its normal mode: select a shape, reshape it, move it.
  const SHAPE_BUTTONS = [
    [`rectangle`, ICON_RECTANGLE, `toolRectangle`], [`ellipse`, ICON_ELLIPSE, `toolEllipse`], [`polygon`, ICON_POLYGON, `toolPolygon`]
  ];
  // The version of the widget, read from the address of this script (?v=...), for the tooltip.
  const VERSION = (() => {
    try { return new URL(document.currentScript.src).searchParams.get(`v`) || ``; } catch { return ``; }
  })();
  const TOAST_MS = 7000;
  // The row that Grist sends back after a click on the map is recognised for this long.
  const MAP_SELECTION_MS = 3000;

  // Below this size of the map area, the catalogue opens in a separate window.
  const SMALL_STAGE_HEIGHT = 560;
  const SMALL_STAGE_WIDTH = 460;
  const MIN_SLIDER_ZOOM = 3;
  const MAX_SLIDER_ZOOM = 20;
  // The buttons and sliders fade after this long without any movement over the map.
  const IDLE_DELAY_MS = 3000;

  class MapApp {
    // host.onConfig(patch): a setting changed. host.onSelect(id): a pin was clicked.
    // host.onWindowButton(): the expand (Grist) or dock (window) button was clicked.
    // host.store (optional, Grist widget only): { canEdit(), create, update, remove } to write the
    // shapes drawn on the map to the table; without it there is no drawing mode.
    constructor(host, mode) {
      this.host = host;
      this.mode = mode;
      this.config = normalizeConfig({});
      this.dataMessage = ``;
      this.invalidMessage = ``;
      this.wanted = { id: null, pending: false };
      this.docked = false;

      this.banner = document.getElementById(`banner`);
      this.status = document.getElementById(`docked`);
      const stage = document.getElementById(`stage`);
      const tools = document.getElementById(`tools`);

      this.engine = new window.MapEngine(document.getElementById(`map`), {
        onSelect: (id) => this.selectFromMap(id),
        onViewChange: (view) => { if (host.onViewChange) host.onViewChange(view); },
        onZoom: (zoom) => { this.zoomInput.value = String(zoom); },
        onShapesChanged: () => { if (this.editor) this.editor.refresh(); }
      });
      // In a small widget the catalogue opens in its own window; otherwise it opens in place.
      this.menu = new CatalogMenu(() => this.config, (patch) => this.change(patch), {
        onPreview: (draft) => this.preview(draft),
        onButton: () => {
          const small = stage.clientHeight < SMALL_STAGE_HEIGHT || stage.clientWidth < SMALL_STAGE_WIDTH;
          if (small && host.onCatalogWindow && host.onCatalogWindow()) return;
          this.menu.toggle();
        }
      });
      // The slider acts on the fill of the shapes.
      this.slider = new TransparencyControl(
        (opacity) => this.engine.setShapeOpacity(opacity),
        (opacity) => this.change({ shapeOpacity: opacity })
      );

      const windowButton = h(`button`, {
        type: `button`, class: `tool`,
        title: t(mode === `window` ? `dockWindow` : `openWindow`),
        [`aria-label`]: t(mode === `window` ? `dockWindow` : `openWindow`),
        onclick: () => host.onWindowButton()
      }, icon(mode === `window` ? ICON_DOCK : ICON_EXPAND));
      this.tools = tools;
      tools.append(this.menu.button);
      if (mode === `grist` && host.store) this.setupEditing(stage, tools);
      tools.append(windowButton);

      // Vertical zoom slider under the buttons.
      this.zoomInput = h(`input`, {
        type: `range`, min: MIN_SLIDER_ZOOM, max: MAX_SLIDER_ZOOM, step: 1, value: this.engine.map.getZoom(),
        title: t(`zoomSlider`), [`aria-label`]: t(`zoomSlider`)
      });
      this.zoomInput.addEventListener(`input`, () => this.engine.setZoom(Number(this.zoomInput.value)));
      tools.append(h(`div`, { class: `zoom-slider` }, this.zoomInput));
      stage.append(this.menu.panel, this.slider.element, this.toastElement());
      this.watchActivity(stage);
      this.applyConfig();
    }

    // ------------------------------------------------------------ Drawing mode

    // The button that starts the drawing mode, its toolbar and its help line.
    setupEditing(stage, tools) {
      this.editor = new window.mapBuilderEditor.ShapeEditor(this.engine, this.host.store, {
        onTool: (tool) => this.renderEditBar(tool),
        onHint: (text) => { this.hint.textContent = text; this.hint.hidden = !text; },
        onMessage: (text) => this.toast(text),
        askName: (defaultName) => this.askName(defaultName),
        askFusion: (preview) => this.askFusion(preview),
        selectRow: (id) => this.selectFromMap(id)
      });
      this.editButton = h(`button`, {
        type: `button`, class: `tool`, title: `${t(`editMode`)}${VERSION ? ` (version ${VERSION})` : ``}`, [`aria-label`]: t(`editMode`), [`aria-pressed`]: `false`,
        onclick: () => this.toggleEditing()
      }, icon(ICON_EDIT));
      tools.append(this.editButton);
      this.editBar = h(`div`, { id: `edit-bar`, role: `toolbar`, [`aria-label`]: t(`editMode`), hidden: true });
      this.hint = h(`p`, { id: `edit-hint`, role: `status`, hidden: true });
      stage.append(this.editBar, this.hint);
    }

    toggleEditing(force) {
      const on = force === undefined ? !this.editor.active : force;
      if (on && !this.host.store.canEdit()) {
        this.toast(t(`editNeedsShape`));
        return;
      }
      this.menu.toggle(false);
      this.editor.setActive(on);
      this.editButton.setAttribute(`aria-pressed`, String(on));
      this.editBar.hidden = !on;
      this.stage.classList.toggle(`editing`, on);
      if (!on) this.hint.hidden = true;
    }

    renderEditBar(tool) {
      if (!this.editBar) return;
      const button = (key, paths, pressed, onclick, disabled) => h(`button`, {
        type: `button`, class: `tool`, title: t(key), [`aria-label`]: t(key),
        [`aria-pressed`]: pressed === null ? null : String(pressed), disabled, onclick
      }, icon(paths));
      this.editBar.textContent = ``;
      const gap = () => h(`span`, { class: `bar-gap`, [`aria-hidden`]: `true` });
      this.editBar.append(
        // A second click on the active tool goes back to the normal mode.
        ...SHAPE_BUTTONS.map(([id, paths, key]) => button(key, paths, tool === id, () => this.editor.setTool(tool === id ? `select` : id), false)),
        gap(),
        button(`toolErase`, ICON_ERASE, tool === `erase`, () => this.editor.setTool(tool === `erase` ? `select` : `erase`), false),
        gap(),
        button(`toolFusion`, ICON_FUSION, this.editor.fusion, () => this.editor.setFusion(!this.editor.fusion), false),
        gap(),
        button(`toolSnap`, ICON_SNAP, this.editor.snap, () => { this.editor.toggleSnap(); this.renderEditBar(tool); }, false)
      );
    }

    // The choice offered after the second shape of a fusion is drawn: the result of 1 + 2, 1 - 2
    // or 2 - 1 is shown on the map as the choice changes. Resolves to `add`, `first`, `second`, or
    // null when the person gives up. preview(operation) returns false when that result is empty.
    askFusion(preview) {
      return new Promise((resolve) => {
        const choices = [[`add`, `fusionAdd`], [`first`, `fusionFirstMinus`], [`second`, `fusionSecondMinus`]];
        const message = h(`p`, { class: `error`, role: `alert` });
        const ok = h(`button`, { type: `submit`, class: `action`, text: t(`ok`) });
        let current = `add`;
        const show = () => {
          const fine = preview(current);
          message.textContent = fine ? `` : t(`fusionEmpty`);
          ok.disabled = !fine;
        };
        const close = (value) => { panel.remove(); document.removeEventListener(`keydown`, onKey, true); resolve(value); };
        const onKey = (event) => { if (event.key === `Escape`) { event.stopPropagation(); close(null); } };
        const panel = h(`form`, { id: `fusion-panel`, role: `dialog`, [`aria-label`]: t(`fusionTitle`), onsubmit: (event) => { event.preventDefault(); if (!ok.disabled) close(current); } },
          h(`strong`, { text: t(`fusionTitle`) }),
          ...choices.map(([value, key]) => h(`label`, { class: `choice` },
            h(`input`, { type: `radio`, name: `fusion-choice`, value, checked: value === current, onchange: () => { current = value; show(); } }),
            ` ${t(key)}`)),
          message,
          h(`div`, { class: `buttons` },
            h(`button`, { type: `button`, class: `outline`, text: t(`cancel`), onclick: () => close(null) }),
            ok));
        document.addEventListener(`keydown`, onKey, true);
        this.stage.append(panel);
        show();
        ok.focus();
      });
    }

    // A short message at the bottom of the map (a refused write, an erased shape...).
    toastElement() {
      this.toastNode = h(`p`, { id: `toast`, role: `status`, hidden: true });
      return this.toastNode;
    }

    toast(text) {
      this.toastNode.textContent = text;
      this.toastNode.hidden = !text;
      clearTimeout(this.toastTimer);
      if (text) this.toastTimer = setTimeout(() => { this.toastNode.hidden = true; }, TOAST_MS);
    }

    // Small dialog asking the name of a new shape. Resolves to the name, or null when cancelled.
    askName(defaultName) {
      return new Promise((resolve) => {
        const input = h(`input`, { type: `text`, id: `f-shape-name`, maxlength: 80, autocomplete: `off`, value: defaultName });
        const close = (value) => { dialog.remove(); resolve(value); };
        const submit = () => close(input.value.trim() || defaultName);
        const dialog = h(`div`, { class: `dialog-back`, onclick: (event) => { if (event.target === dialog) close(null); } },
          h(`form`, { class: `dialog`, role: `dialog`, [`aria-label`]: t(`shapeNameTitle`), onsubmit: (event) => { event.preventDefault(); submit(); } },
            h(`strong`, { text: t(`shapeNameTitle`) }),
            h(`div`, { class: `field` }, h(`label`, { for: `f-shape-name`, text: t(`shapeNameField`) }), input),
            h(`div`, { class: `buttons` },
              h(`button`, { type: `button`, class: `outline`, text: t(`cancel`), onclick: () => close(null) }),
              h(`button`, { type: `submit`, class: `action`, text: t(`ok`) }))));
        dialog.addEventListener(`keydown`, (event) => { if (event.key === `Escape`) { event.stopPropagation(); close(null); } });
        this.stage.append(dialog);
        input.focus();
        input.select();
      });
    }

    // Hides the buttons and sliders after a few seconds without movement over the map, and
    // shows them again at the next movement. They stay while the catalogue is open.
    watchActivity(stage) {
      this.stage = stage;
      const wake = () => {
        stage.classList.remove(`idle`);
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.sleep(), IDLE_DELAY_MS);
      };
      for (const name of [`pointermove`, `pointerdown`, `wheel`, `keydown`]) {
        stage.addEventListener(name, wake, { passive: true });
      }
      stage.addEventListener(`pointerleave`, () => this.sleep());
      this.wake = wake;
      wake();
    }

    sleep() {
      clearTimeout(this.idleTimer);
      if (this.menu.isOpen) return;
      this.stage.classList.add(`idle`);
    }

    // The view saved at the last visit (centre and zoom).
    restoreView(view) {
      this.engine.restoreView(view);
    }

    // Shows a pending choice of map (before OK) without saving it; null puts back the saved
    // map. It does nothing when no preview is on, so a confirmed choice is not loaded twice.
    preview(draft) {
      if (!draft) {
        if (!this.previewing) return;
        this.previewing = false;
        this.applyConfig(false);
        return;
      }
      this.previewing = true;
      this.engine.setBase(catalog.find(draft.baseId, this.config.customMaps));
    }

    // A setting was changed by the user: apply it and tell the host to save it.
    // The menu already shows the choice, so it is not drawn again.
    change(patch) {
      this.previewing = false;
      Object.assign(this.config, patch);
      this.applyConfig(false);
      this.host.onConfig(patch);
    }

    // Applies a configuration received from outside (saved options, or the Grist widget).
    setConfig(config) {
      this.config = config;
      this.applyConfig();
    }

    applyConfig(redrawMenu = true) {
      const { baseId, shapeOpacity, customMaps } = this.config;
      const base = catalog.find(baseId, customMaps);
      this.engine.setBase(base);
      this.engine.setShapeOpacity(shapeOpacity);
      this.slider.update(shapeOpacity);
      this.keyMessage = base && base.needsKey && !base.apiKey ? t(`needsApiKey`, { name: base.title }) : ``;
      if (redrawMenu) this.menu.render();
      this.showBanner();
    }

    showBanner() {
      const text = [this.keyMessage, this.invalidMessage].filter(Boolean).join(` `);
      this.banner.textContent = text;
      this.banner.hidden = !text;
      this.engine.invalidateSize();
    }

    // points/shapes/invalid come from records.js; columns names the mapped Shape, Latitude and
    // Longitude columns.
    setData(data) {
      this.invalidMessage = window.mapBuilderRecords.describeInvalid(data.invalid, data.columns, t);
      this.showBanner();
      if (!this.docked) this.engine.setContent(data.points, data.shapes);
      this.latest = data;
      if (this.editor) this.editor.setEmptyRows(data.empty || []);
      // A selection that arrived before its pin existed is applied now.
      if (this.wanted.pending) this.select(this.wanted.id, true);
    }

    // A click on a shape or a pin of the map: Grist moves its cursor, then sends the row back.
    selectFromMap(id) {
      this.wanted = { id, pending: false };
      this.mapSelection = { id, at: Date.now() };
      this.host.onSelect(id);
    }

    // Highlights the pin of a row; with pan, the map moves to it and opens its label.
    select(id, pan) {
      // While drawing, a click on the map must not move the map under the pencil.
      const fromMap = this.mapSelection && this.mapSelection.id === id && Date.now() - this.mapSelection.at < MAP_SELECTION_MS;
      if (fromMap && this.editor && this.editor.active) pan = false;
      this.wanted = { id, pending: false };
      if (id === null || id === undefined) {
        this.engine.clearSelection();
        if (this.editor && this.editor.active) this.editor.selectShape(null, false);
        return;
      }
      this.engine.select(id, { pan });
      if (this.editor && this.editor.active) this.editor.selectShape(id, false);
      if (pan && !this.engine.entries.has(id) && !this.engine.shapes.has(id)) this.wanted = { id, pending: true };
    }

    // Replaces the map by a message (no data, missing columns, map in another window).
    // dockButton adds the "put the map back" button under the message.
    showMessage(text, dockButton) {
      this.status.textContent = ``;
      this.status.hidden = !text;
      if (!text) return;
      this.status.append(h(`p`, { text }));
      if (dockButton) {
        this.status.append(h(`button`, { type: `button`, class: `action`, text: t(`dockButton`), onclick: () => this.host.onWindowButton() }));
      }
    }

    // The Grist widget hides its map while the separate window shows it.
    setDocked(docked) {
      this.docked = docked;
      this.tools.hidden = docked;
      if (docked) {
        if (this.editor) this.toggleEditing(false);
        this.preview(null);
        this.menu.toggle(false);
        this.showMessage(t(`dockedMessage`), true);
        return;
      }
      this.showMessage(this.dataMessage, false);
      this.engine.invalidateSize();
      if (this.latest) this.engine.setContent(this.latest.points, this.latest.shapes);
      if (this.wanted.id !== null) this.select(this.wanted.id, true);
    }

    // Message that replaces the map when there is nothing to draw (empty string to clear it).
    setDataMessage(text) {
      this.dataMessage = text;
      if (!this.docked) this.showMessage(text, false);
    }
  }

  window.MapApp = MapApp;
})();
