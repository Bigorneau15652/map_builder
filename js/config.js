// The widget settings: defaults and a reader that always returns a complete, valid
// configuration, whatever was saved. Shared by the map screens and the catalogue window.
(function () {
  const catalog = window.mapBuilderCatalog;

  const DEFAULT_BASE_ID = `ign:GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`;
  const DEFAULT_SHAPE_OPACITY = 0.45;
  const MIN_SHAPE_OPACITY = 0.05;
  const MAX_CUSTOM_MAPS = 50;

  // Reads the saved options of the widget and returns a complete, valid configuration:
  // an unknown or damaged value falls back to its default instead of breaking the map.
  function normalizeConfig(options) {
    const source = options && typeof options === `object` ? options : {};
    const text = (value, max) => (typeof value === `string` ? value.slice(0, max) : ``);
    const customMaps = (Array.isArray(source.customMaps) ? source.customMaps : [])
      .filter((item) => item && typeof item.id === `string` && item.id.startsWith(`custom:`) &&
        typeof item.name === `string` && typeof item.url === `string` && !catalog.validateTileUrl(item.url))
      .slice(0, MAX_CUSTOM_MAPS)
      .map((item) => ({
        id: item.id.slice(0, 80), name: text(item.name, 80), url: item.url.slice(0, 500),
        copyright: text(item.copyright, 200), key: text(item.key, 200)
      }));
    const known = (id) => (typeof id === `string` && catalog.find(id, customMaps) ? id : null);
    const opacity = Number(source.shapeOpacity);
    return {
      baseId: known(source.baseId) || DEFAULT_BASE_ID,
      shapeOpacity: Number.isFinite(opacity) ? Math.min(1, Math.max(MIN_SHAPE_OPACITY, opacity)) : DEFAULT_SHAPE_OPACITY,
      customMaps
    };
  }

  // Checks a change received from another window: only the known settings are kept, each one
  // is cleaned like a saved option, and anything else is dropped. current is the configuration
  // in use, so that a change can refer to a map added in the same message.
  function sanitizePatch(current, patch) {
    if (!patch || typeof patch !== `object`) return {};
    const clean = normalizeConfig({ ...current, ...patch });
    const result = {};
    for (const name of Object.keys(clean)) {
      if (Object.prototype.hasOwnProperty.call(patch, name)) result[name] = clean[name];
    }
    return result;
  }

  window.mapBuilderConfig = { normalizeConfig, sanitizePatch };
})();
