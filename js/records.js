// Turns the rows given by Grist into clean shapes and pins for the map.
// Nothing here touches the page: invalid rows are reported, never thrown.
(function () {
  const { parseShape, sizeOf } = window.mapBuilderGeometry;
  const MAX_NAME_LENGTH = 300;
  const MAX_DESCRIPTION_LENGTH = 5000;
  const MAX_EXAMPLES = 3;

  // Grist sometimes wraps a value as V(...) for reference columns; this reads it safely.
  function parseValue(value) {
    if (value && typeof value === `object` && typeof value.value === `string` && value.value.startsWith(`V(`)) {
      try {
        const parsed = JSON.parse(value.value.slice(2, -1));
        return parsed.remote || parsed.local || parsed.parent || parsed;
      } catch {
        return ``;
      }
    }
    return value;
  }

  function toText(value, maxLength) {
    const parsed = parseValue(value);
    if (parsed === null || parsed === undefined) return ``;
    return String(typeof parsed === `object` ? `` : parsed).slice(0, maxLength);
  }

  // A number inside the valid range, or null.
  function toCoordinate(value, limit) {
    const parsed = parseValue(value);
    if (parsed === null || parsed === undefined || parsed === ``) return null;
    const number = typeof parsed === `number` ? parsed : Number(parsed);
    return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
  }

  const isEmpty = (value) => value === null || value === undefined || value === `` || value === 0;

  // rows: records with the mapped column names Name, Shape, Color, Description, Latitude and
  // Longitude (the last four may be missing). A row is a shape when its Shape column holds a
  // valid shape, and a pin when it has valid coordinates; it can be both.
  // Returns { shapes, points, invalid } where invalid lists { id, label, column } of the
  // ignored rows, column being `shape` or `coordinates`.
  function normalize(rows) {
    const shapes = [];
    const points = [];
    const invalid = [];
    for (const row of rows) {
      const name = toText(row.Name, MAX_NAME_LENGTH);
      const description = toText(row.Description, MAX_DESCRIPTION_LENGTH);
      const color = toText(row.Color, 40);
      const label = name || `#${row.id}`;
      const rawShape = parseValue(row.Shape);
      if (typeof rawShape === `string` && rawShape.trim()) {
        const parsed = parseShape(rawShape);
        if (parsed.error) {
          invalid.push({ id: row.id, label, column: `shape` });
        } else {
          shapes.push({ id: row.id, name, description, color, kind: parsed.kind, polygons: parsed.polygons, size: sizeOf(parsed.polygons) });
        }
      }

      const rawLat = parseValue(row.Latitude);
      const rawLng = parseValue(row.Longitude);
      // Empty coordinates (or 0 / 0) mean a blank row: nothing to report.
      if (!(isEmpty(rawLat) && isEmpty(rawLng))) {
        const lat = toCoordinate(row.Latitude, 90);
        const lng = toCoordinate(row.Longitude, 180);
        if (lat === null || lng === null) invalid.push({ id: row.id, label, column: `coordinates` });
        else points.push({ id: row.id, name, lat, lng, description, color });
      }
    }
    return { shapes, points, invalid };
  }

  // Text of the data-quality banner: which columns to check, how many rows, a few examples.
  // columns names the mapped columns: { shape, lat, lng }.
  function describeInvalid(invalid, columns, t) {
    const parts = [];
    for (const [column, key, names] of [
      [`shape`, `shapesIgnored`, { shape: columns.shape }],
      [`coordinates`, `rowsIgnored`, { lat: columns.lat, lng: columns.lng }]
    ]) {
      const list = invalid.filter((item) => item.column === column);
      if (!list.length) continue;
      const shown = list.slice(0, MAX_EXAMPLES).map((item) => item.label).join(` ; `);
      const rest = list.length - MAX_EXAMPLES;
      parts.push(t(key, {
        ...names, count: list.length,
        examples: rest > 0 ? t(`andOthers`, { examples: shown, rest }) : shown
      }));
    }
    return parts.join(` `);
  }

  window.mapBuilderRecords = { normalize, describeInvalid };
})();
