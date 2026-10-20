// Entry point of the catalogue window: the map catalogue alone, on a full page. It is opened
// by the widget when the widget is too small to hold the catalogue. The widget sends the
// settings and saves every change it receives.
(function () {
  const { normalizeConfig } = window.mapBuilderConfig;
  const { CatalogMenu } = window.mapBuilderMenu;

  const opener = window.opener;
  const origin = location.origin;
  let config = normalizeConfig({});

  function toWidget(type, payload) {
    if (opener && !opener.closed) opener.postMessage({ type, payload }, origin);
  }

  const menu = new CatalogMenu(() => config, (patch) => {
    config = { ...config, ...patch };
    toWidget(`mapbuilder:config`, { patch });
  }, { embedded: true, onPreview: (draft) => toWidget(`mapbuilder:preview`, { draft }) });
  document.getElementById(`catalog-root`).append(menu.panel);
  menu.render();

  // Only the widget that opened this window may send messages to it.
  window.addEventListener(`message`, (event) => {
    if (event.source !== opener || event.origin !== origin || !event.data) return;
    const { type, payload } = event.data;
    if (type !== `mapbuilder:state` || !payload) return;
    const next = normalizeConfig(payload.config);
    // The widget sends back the change we just made: nothing to redraw.
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    menu.render();
  });

  toWidget(`mapbuilder:window-ready`, {});
})();
