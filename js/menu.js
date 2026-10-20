// The map catalogue menu (button with a map icon), its "Other" dialog
// and the transparency slider of the shapes. All text from the data or from the user is written with
// textContent, never as HTML.
(function () {
  const { t } = window.mapBuilderI18n;
  const catalog = window.mapBuilderCatalog;

  const MAX_NAME_LENGTH = 80;
  const MAX_TRANSPARENCY = 0.9;
  const SVG_NS = `http://www.w3.org/2000/svg`;

  // Small helper that builds an element: h(`div`, { class: `x`, text: `hello` }, child, child).
  function h(tag, props, ...children) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (name === `text`) element.textContent = value;
      else if (name === `class`) element.className = value;
      else if (name.startsWith(`on`)) element.addEventListener(name.slice(2), value);
      else if (value === true) element.setAttribute(name, ``);
      else element.setAttribute(name, String(value));
    }
    for (const child of children.flat()) {
      if (child !== undefined && child !== null && child !== false) element.append(child);
    }
    return element;
  }

  // Inline SVG icon made of stroked paths (the paths are fixed texts written here).
  function icon(paths) {
    const svg = document.createElementNS(SVG_NS, `svg`);
    for (const [name, value] of Object.entries({
      width: 20, height: 20, viewBox: `0 0 24 24`, fill: `none`, stroke: `currentColor`,
      [`stroke-width`]: 2, [`stroke-linecap`]: `round`, [`stroke-linejoin`]: `round`, [`aria-hidden`]: `true`
    })) svg.setAttribute(name, String(value));
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, `path`);
      path.setAttribute(`d`, d);
      svg.appendChild(path);
    }
    return svg;
  }

  const ICON_MAP = [`M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z`, `M9 4v14`, `M15 6v14`];
  const ICON_EXPAND = [`M15 3h6v6`, `M9 21H3v-6`, `M21 3l-7 7`, `M3 21l7-7`];
  const ICON_DOCK = [`M14 10h6V4`, `M10 14H4v6`, `M20 4l-7 7`, `M4 20l7-7`];
  const ICON_EDIT = [`M12 20h9`, `M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z`];
  const ICON_RECTANGLE = [`M4 6h16v12H4z`];
  const ICON_ELLIPSE = [`M3 12a9 6 0 1 0 18 0a9 6 0 1 0-18 0`];
  const ICON_POLYGON = [`M5 18l3-12 9 3 3 9z`];
  const ICON_ERASE = [`M20 20H8l-4-4a1.5 1.5 0 0 1 0-2l9-9a1.5 1.5 0 0 1 2 0l5 5a1.5 1.5 0 0 1 0 2l-6 6`, `M7 11l6 6`];
  const ICON_SNAP = [`M12 3v4`, `M12 17v4`, `M3 12h4`, `M17 12h4`, `M12 10a2 2 0 1 0 .01 0z`];

  function newId() {
    return `custom:${window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
  }

  // ------------------------------------------------------------ Catalogue menu

  // The catalogue panel. The user picks a base map, then confirms with OK or throws the choice
  // away with Cancel: nothing changes on the map before OK.
  class CatalogMenu {
    // getConfig(): current settings. onChange(patch): called with the settings that changed.
    // options.onButton(): replaces the default behaviour of the button (open the panel here).
    // options.embedded: the panel fills its page (catalogue window): no button, always open.
    // options.onPreview(draft): shows the pending choice on the map before OK; null cancels it.
    constructor(getConfig, onChange, options) {
      this.getConfig = getConfig;
      this.onChange = onChange;
      this.options = options || {};
      this.draft = null;     // the choice being made: { baseId }

      this.button = h(`button`, {
        type: `button`, class: `tool`, title: t(`openCatalog`), [`aria-label`]: t(`openCatalog`),
        [`aria-expanded`]: `false`,
        onclick: () => (this.options.onButton ? this.options.onButton() : this.toggle())
      }, icon(ICON_MAP));
      this.panel = h(`div`, {
        class: this.options.embedded ? `panel full` : `panel`, role: `dialog`,
        [`aria-label`]: t(`menuTitle`), hidden: !this.options.embedded
      });
      document.addEventListener(`keydown`, (event) => {
        if (event.key !== `Escape`) return;
        if (this.dialog) this.closeDialog();
        else if (!this.panel.hidden) this.cancel();
      });
      if (this.options.embedded) this.startDraft();
    }

    get isOpen() {
      return !this.panel.hidden;
    }

    startDraft() {
      this.draft = { baseId: this.getConfig().baseId };
    }

    toggle(open) {
      const show = open === undefined ? this.panel.hidden : open;
      this.panel.hidden = !show;
      this.button.setAttribute(`aria-expanded`, String(show));
      if (show) {
        this.startDraft();
        this.render();
      } else {
        this.closeDialog();
      }
    }

    // OK: apply the choice, then close.
    confirm() {
      if (this.draft.baseId !== this.getConfig().baseId) this.onChange({ baseId: this.draft.baseId });
      this.finish();
    }

    // Cancel: forget the choice (the map goes back to the saved one), then close.
    cancel() {
      if (this.options.onPreview) this.options.onPreview(null);
      this.finish();
    }

    // Shows the pending choice on the map at once; nothing is saved before OK.
    preview() {
      if (this.options.onPreview) this.options.onPreview({ ...this.draft });
    }

    finish() {
      if (this.options.embedded) window.close();
      else this.toggle(false);
    }

    // Draws the whole panel again, keeping the scroll position of the list.
    render() {
      if (this.panel.hidden) return;
      const list = this.panel.querySelector(`.list`);
      const scroll = list ? list.scrollTop : 0;
      const dialog = this.dialog;
      this.panel.textContent = ``;
      this.panel.append(
        h(`div`, { class: `panel-head` },
          h(`strong`, { text: t(`menuTitle`) }),
          h(`button`, { type: `button`, class: `plain`, title: t(`cancel`), [`aria-label`]: t(`cancel`), text: `×`, onclick: () => this.cancel() })),
        h(`div`, { class: `list` }, this.listBody()),
        h(`div`, { class: `panel-foot` },
          h(`button`, { type: `button`, class: `outline`, text: t(`other`), onclick: () => this.openDialog() }),
          h(`span`, { class: `spacer` }),
          h(`button`, { type: `button`, class: `outline`, text: t(`cancel`), onclick: () => this.cancel() }),
          h(`button`, { type: `button`, class: `action`, text: t(`ok`), onclick: () => this.confirm() }))
      );
      const newList = this.panel.querySelector(`.list`);
      newList.scrollTop = scroll;
      if (dialog) this.panel.append(dialog);
    }

    // ---------------------------------------------------------------- List

    listBody() {
      const fragment = document.createDocumentFragment();
      const custom = this.getConfig().customMaps.map((item) => catalog.customEntry(item));
      if (custom.length) {
        fragment.append(this.heading(t(`sectionCustom`)));
        custom.forEach((entry) => fragment.append(this.row(entry)));
      }
      fragment.append(this.heading(t(`sectionReference`)));
      catalog.ign.forEach((entry) => fragment.append(this.row(entry)));
      fragment.append(this.heading(t(`sectionBase`)));
      catalog.builtIn.forEach((entry) => fragment.append(this.row(entry)));
      return fragment;
    }

    heading(text) {
      return h(`h3`, { class: `section`, text });
    }

    // One catalogue entry: radio, preview image, title and source. A map added by the user
    // also has a pencil (edit) and a cross (delete).
    row(entry) {
      const radio = h(`input`, {
        type: `radio`, name: `pick-base`, checked: this.draft.baseId === entry.id,
        onchange: () => { this.draft.baseId = entry.id; this.preview(); }
      });

      let thumb = h(`span`, { class: `thumb`, [`aria-hidden`]: `true` });
      // Only the IGN layers have a preview image, loaded when the menu is shown.
      if (entry.isIgn) {
        const image = h(`img`, { class: `thumb`, alt: ``, width: 56, height: 56, loading: `lazy`, src: catalog.thumbnailUrl(entry) });
        image.addEventListener(`error`, () => image.replaceWith(thumb));
        thumb = image;
      }

      const source = entry.isIgn ? t(`sourceIgn`) : (entry.custom ? `${t(`sourceCustom`)} · ${entry.source}` : entry.source);
      const needsKey = entry.needsKey && !entry.apiKey;
      const text = h(`span`, { class: `row-text` },
        h(`span`, { class: `row-title`, text: entry.title }),
        h(`span`, { class: `row-source`, text: source }),
        needsKey && h(`span`, { class: `row-badge`, text: t(`needsKeyBadge`) }));

      return h(`div`, { class: `row-wrap` },
        h(`label`, { class: `row` }, radio, thumb, text),
        entry.custom && h(`button`, {
          type: `button`, class: `plain`, title: t(`editMap`), [`aria-label`]: t(`editMap`), text: `✎`,
          onclick: () => this.openDialog(entry.id)
        }),
        entry.custom && h(`button`, {
          type: `button`, class: `plain`, title: t(`deleteMap`), [`aria-label`]: t(`deleteMap`), text: `×`,
          onclick: () => this.deleteCustom(entry.id)
        }));
    }

    // Deleting a map of the user is applied at once; the pending choice forgets it too.
    deleteCustom(id) {
      const config = this.getConfig();
      const patch = { customMaps: config.customMaps.filter((item) => item.id !== id) };
      if (config.baseId === id) patch.baseId = null;
      if (this.draft.baseId === id) this.draft.baseId = null;
      this.onChange(patch);
      this.render();
    }

    // ------------------------------------------------------------ Map dialog

    // Opens the "Other" dialog: empty to add a map, filled with the map `editId` to change it.
    openDialog(editId) {
      const existing = editId ? this.getConfig().customMaps.find((item) => item.id === editId) : null;
      const name = h(`input`, { type: `text`, maxlength: MAX_NAME_LENGTH, autocomplete: `off`, id: `f-name`, value: existing ? existing.name : `` });
      const url = h(`input`, { type: `text`, autocomplete: `off`, id: `f-url`, value: existing ? existing.url : ``, placeholder: `https://…/{z}/{x}/{y}.png` });
      const copyright = h(`input`, { type: `text`, autocomplete: `off`, id: `f-copyright`, value: existing ? existing.copyright : `` });
      const key = h(`input`, { type: `text`, autocomplete: `off`, id: `f-key`, value: existing ? existing.key : `` });
      const errors = { name: h(`p`, { class: `error`, role: `alert` }), url: h(`p`, { class: `error`, role: `alert` }), key: h(`p`, { class: `error`, role: `alert` }) };

      const submit = () => {
        const problems = { name: ``, url: ``, key: `` };
        const nameText = name.value.trim();
        const urlText = url.value.trim();
        const keyText = key.value.trim();
        if (!nameText) problems.name = t(`errName`);
        const urlProblem = catalog.validateTileUrl(urlText);
        if (urlProblem) {
          problems.url = urlProblem.code === `placeholders` ? t(`errUrlPlaceholders`)
            : urlProblem.code === `other` ? t(`errUrlOther`, { name: urlProblem.name }) : t(`errUrl`);
        } else if (urlText.includes(`{apikey}`) && !keyText) {
          problems.key = t(`errKeyMissing`);
        } else if (keyText && !urlText.includes(`{apikey}`)) {
          problems.key = t(`errKeyUnused`);
        }
        for (const field of Object.keys(errors)) errors[field].textContent = problems[field];
        if (problems.name || problems.url || problems.key) return;

        const item = {
          id: existing ? existing.id : newId(), name: nameText, url: urlText,
          copyright: copyright.value.trim(), key: keyText
        };
        const maps = this.getConfig().customMaps;
        this.onChange({ customMaps: existing ? maps.map((m) => (m.id === existing.id ? item : m)) : [...maps, item] });
        this.closeDialog();
        this.render();
      };

      const field = (labelKey, input, help, error) => h(`div`, { class: `field` },
        h(`label`, { for: input.id, text: t(labelKey) }), input,
        help && h(`p`, { class: `note`, text: t(help) }), error);

      this.dialog = h(`div`, { class: `dialog-back`, onclick: (event) => { if (event.target === this.dialog) this.closeDialog(); } },
        h(`form`, { class: `dialog`, role: `dialog`, [`aria-label`]: t(`dialogTitle`), novalidate: true,
          onsubmit: (event) => { event.preventDefault(); submit(); } },
          h(`strong`, { text: t(existing ? `dialogTitleEdit` : `dialogTitle`) }),
          field(`fieldName`, name, null, errors.name),
          field(`fieldUrl`, url, `fieldUrlHelp`, errors.url),
          field(`fieldCopyright`, copyright, null, null),
          field(`fieldKey`, key, `fieldKeyHelp`, errors.key),
          h(`div`, { class: `buttons` },
            h(`button`, { type: `button`, class: `outline`, text: t(`cancel`), onclick: () => this.closeDialog() }),
            h(`button`, { type: `submit`, class: `action`, text: t(existing ? `save` : `create`) }))));
      this.panel.append(this.dialog);
      name.focus();
    }

    closeDialog() {
      if (this.dialog) this.dialog.remove();
      this.dialog = null;
    }
  }

  // -------------------------------------------------------- Transparency slider

  // Slider in the bottom-left corner. It sets how transparent the fill of the shapes is.
  class TransparencyControl {
    // onLive(opacity): called while dragging. onCommit(opacity): called when released.
    constructor(onLive, onCommit) {
      this.value = h(`span`, { class: `value` });
      this.input = h(`input`, { type: `range`, min: 0, max: Math.round(MAX_TRANSPARENCY * 100), step: 5, value: 0 });
      this.input.addEventListener(`input`, () => {
        this.showValue();
        onLive(this.opacity());
      });
      this.input.addEventListener(`change`, () => onCommit(this.opacity()));
      this.element = h(`div`, { class: `transparency` }, h(`span`, { text: t(`transparency`) }), this.input, this.value);
    }

    opacity() {
      return Math.round((1 - Number(this.input.value) / 100) * 100) / 100;
    }

    showValue() {
      this.value.textContent = `${this.input.value} %`;
    }

    // opacity: the current opacity of the fill of the shapes (0 to 1).
    update(opacity) {
      const title = t(`transparencyTitle`);
      this.input.title = title;
      this.input.setAttribute(`aria-label`, title);
      this.input.value = String(Math.round((1 - opacity) * 100));
      this.showValue();
    }
  }

  window.mapBuilderMenu = {
    CatalogMenu, TransparencyControl, h, icon, ICON_EXPAND, ICON_DOCK, ICON_EDIT, ICON_RECTANGLE,
    ICON_ELLIPSE, ICON_POLYGON, ICON_ERASE, ICON_SNAP
  };
})();
