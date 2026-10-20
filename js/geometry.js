// Shapes stored in the table: reading and checking the text of the Shape column.
// The format is GeoJSON, so a shape can be exchanged with QGIS without conversion:
//   {"type":"Feature","properties":{"kind":"rectangle"},"geometry":{"type":"Polygon","coordinates":[[[lng,lat],...]]}}
// A bare Polygon or MultiPolygon geometry is accepted too. Nothing here touches the page.
(function () {
  const KINDS = [`rectangle`, `ellipse`, `polygon`];
  const MAX_TEXT_LENGTH = 2000000;
  const MAX_POLYGONS = 500;
  const MAX_RINGS = 100;
  const MAX_VERTICES = 50000;

  // Reads one position [lng, lat] and returns [lat, lng], or null when it is not valid.
  function readPosition(position) {
    if (!Array.isArray(position) || position.length < 2) return null;
    const lng = position[0];
    const lat = position[1];
    if (typeof lng !== `number` || typeof lat !== `number`) return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
    return [lat, lng];
  }

  // Reads a ring and drops the closing position (the same as the first). Returns null if the
  // ring has fewer than three different positions or a bad one.
  function readRing(ring, budget) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    budget.vertices += ring.length;
    if (budget.vertices > MAX_VERTICES) return null;
    const points = [];
    for (const position of ring) {
      const point = readPosition(position);
      if (!point) return null;
      points.push(point);
    }
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) points.pop();
    return points.length >= 3 ? points : null;
  }

  function readPolygon(rings, budget) {
    if (!Array.isArray(rings) || !rings.length || rings.length > MAX_RINGS) return null;
    const result = [];
    for (const ring of rings) {
      const points = readRing(ring, budget);
      if (!points) return null;
      result.push(points);
    }
    return result;
  }

  // Returns { kind, polygons } where polygons is a list of polygons, a polygon is a list of
  // rings (the first one is the outline, the others are holes) and a ring is a list of
  // [lat, lng]. When the text is not a valid shape, returns { error: `...` }.
  function parseShape(text) {
    if (typeof text !== `string`) return { error: `type` };
    if (text.length > MAX_TEXT_LENGTH) return { error: `size` };
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `json` };
    }
    if (!data || typeof data !== `object`) return { error: `json` };
    let kind = `polygon`;
    let geometry = data;
    if (data.type === `Feature`) {
      geometry = data.geometry;
      const wanted = data.properties && data.properties.kind;
      if (KINDS.includes(wanted)) kind = wanted;
    }
    if (!geometry || typeof geometry !== `object`) return { error: `type` };

    const budget = { vertices: 0 };
    let polygons;
    if (geometry.type === `Polygon`) {
      const polygon = readPolygon(geometry.coordinates, budget);
      polygons = polygon ? [polygon] : null;
    } else if (geometry.type === `MultiPolygon`) {
      const list = geometry.coordinates;
      if (!Array.isArray(list) || !list.length || list.length > MAX_POLYGONS) return { error: `type` };
      polygons = [];
      for (const rings of list) {
        const polygon = readPolygon(rings, budget);
        if (!polygon) {
          polygons = null;
          break;
        }
        polygons.push(polygon);
      }
    } else {
      return { error: `type` };
    }
    if (!polygons) return { error: `coordinates` };
    // Rectangles and ovals are single outlines; anything else is a plain polygon.
    if (kind !== `polygon` && (polygons.length !== 1 || polygons[0].length !== 1)) kind = `polygon`;
    return { kind, polygons };
  }

  // Rough size of a shape (square degrees of its outline's bounding box), used to draw large
  // shapes under small ones. Only the order matters, not the value.
  function sizeOf(polygons) {
    let total = 0;
    for (const polygon of polygons) {
      let south = 90;
      let north = -90;
      let west = 180;
      let east = -180;
      for (const [lat, lng] of polygon[0]) {
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
      }
      total += (north - south) * (east - west) * Math.cos(((north + south) / 2) * Math.PI / 180);
    }
    return total;
  }

  // Six decimals are about ten centimetres: enough for a building, and short in the cell.
  function round(value) {
    return Math.round(value * 1e6) / 1e6;
  }

  // Writes the text of a shape: the opposite of parseShape (the outlines are closed again).
  function serializeShape(kind, polygons) {
    const close = (ring) => [...ring.map(([lat, lng]) => [round(lng), round(lat)]), [round(ring[0][1]), round(ring[0][0])]];
    const rings = (polygon) => polygon.map(close);
    const geometry = polygons.length === 1
      ? { type: `Polygon`, coordinates: rings(polygons[0]) }
      : { type: `MultiPolygon`, coordinates: polygons.map(rings) };
    return JSON.stringify({ type: `Feature`, properties: { kind }, geometry });
  }

  window.mapBuilderGeometry = { parseShape, serializeShape, sizeOf, round };
})();
