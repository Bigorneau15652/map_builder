// Colours: a value from the table (HEX code or colour name) becomes a pin icon or a shape colour.
(function () {
  // French and English colour names accepted in the Color column.
  const COLOR_NAMES = {
    jaune: `#F5C300`, yellow: `#F5C300`,
    orange: `#FF7A00`,
    rouge: `#D32F2F`, red: `#D32F2F`,
    vert: `#43A047`, green: `#43A047`, [`vert clair`]: `#43A047`,
    [`vert foncé`]: `#1B5E20`, [`dark green`]: `#1B5E20`,
    bleu: `#039BE5`, blue: `#039BE5`, [`bleu ciel`]: `#039BE5`, [`sky blue`]: `#039BE5`,
    [`bleu marine`]: `#1565C0`, navy: `#1565C0`, [`navy blue`]: `#1565C0`,
    violet: `#7B1FA2`, purple: `#7B1FA2`,
    rose: `#E91E63`, pink: `#E91E63`,
    gris: `#757575`, grey: `#757575`, gray: `#757575`,
    blanc: `#FFFFFF`, white: `#FFFFFF`,
    noir: `#111111`, black: `#111111`,
    marron: `#795548`, brown: `#795548`,
    turquoise: `#00BCD4`, teal: `#00BCD4`
  };
  const DEFAULT_HEX = `#43A047`;
  const BORDER_FACTOR = 0.6;
  const PIN_WIDTH = 25;
  const PIN_HEIGHT = 41;
  const SELECTED_SCALE = 1.25;

  // Returns the same colour, darker, for the border of a pin or a shape.
  function darken(hex) {
    const value = hex.replace(`#`, ``);
    const channel = (start) => Math.round(parseInt(value.slice(start, start + 2), 16) * BORDER_FACTOR);
    return `#${[0, 2, 4].map((i) => channel(i).toString(16).padStart(2, `0`)).join(``)}`;
  }

  // Resolves a table value to a six-digit HEX colour; anything unknown gives the default green.
  function resolve(value) {
    const raw = String(value === null || value === undefined ? `` : value).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      return `#${raw.slice(1).split(``).map((c) => c + c).join(``)}`.toUpperCase();
    }
    return COLOR_NAMES[raw.toLowerCase()] || DEFAULT_HEX;
  }

  // One icon per (colour, selected) pair: they are created once and shared by all markers.
  const iconCache = new Map();
  function pinIcon(hex, selected) {
    const key = `${hex}|${selected}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const scale = selected ? SELECTED_SCALE : 1;
    const width = Math.round(PIN_WIDTH * scale);
    const height = Math.round(PIN_HEIGHT * scale);
    const border = selected ? `#ffffff` : darken(hex);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 25 41">` +
      `<path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 8.344 12.5 28.5 12.5 28.5S25 20.844 25 12.5` +
      `C25 5.596 19.404 0 12.5 0z" fill="${hex}" stroke="${border}" stroke-width="1.5"/>` +
      `<circle cx="12.5" cy="12.5" r="4.5" fill="white" opacity="0.9"/></svg>`;
    const icon = L.divIcon({
      html: svg, className: ``,
      iconSize: [width, height], iconAnchor: [width / 2, height], popupAnchor: [0, -height + 4]
    });
    iconCache.set(key, icon);
    return icon;
  }

  window.mapBuilderColors = { resolve, pinIcon, darken };
})();
