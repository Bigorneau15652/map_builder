// Entry point of the separate map window. It knows nothing about Grist: the widget that
// opened it sends the data, and receives back the pin clicks and the setting changes.
(function () {
  const { t } = window.mapBuilderI18n;
  const { normalizeConfig } = window.mapBuilderConfig;

  const opener = window.opener;
  const origin = location.origin;
  let columns = { shape: `Shape`, lat: `Latitude`, lng: `Longitude` };

  function toWidget(type, payload) {
    if (opener && !opener.closed) opener.postMessage({ type, payload }, origin);
  }

  const app = new window.MapApp({
    onConfig: (patch) => toWidget(`mapbuilder:config`, { patch }),
    onSelect: (id) => toWidget(`mapbuilder:select`, { id }),
    onWindowButton: () => {
      toWidget(`mapbuilder:dock`, {});
      window.close();
    }
  }, `window`);

  app.setDataMessage(t(`windowWaiting`));

  // Only the widget that opened this window may send messages to it.
  window.addEventListener(`message`, (event) => {
    if (event.source !== opener || event.origin !== origin || !event.data) return;
    const { type, payload } = event.data;
    if (type === `mapbuilder:state` && payload) {
      columns = payload.columns || columns;
      app.setConfig(normalizeConfig(payload.config));
      app.setDataMessage(String(payload.message || ``));
      app.setEmptyMessage(String(payload.hint || ``));
      app.setData({ points: payload.points || [], shapes: payload.shapes || [], invalid: payload.invalid || [], columns });
      app.select(payload.selectedId === undefined ? null : payload.selectedId, true);
    } else if (type === `mapbuilder:select` && payload) {
      app.select(payload.id, true);
    }
  });

  window.addEventListener(`pagehide`, () => toWidget(`mapbuilder:closed`, {}));
  toWidget(`mapbuilder:window-ready`, {});
})();
