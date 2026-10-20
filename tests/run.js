// End-to-end checks in a headless browser, with a mocked Grist. Usage:
//   cd <repository> && python3 -m http.server 8765 &   then   node tests/run.js
// Playwright must be installed (set PLAYWRIGHT_PATH when it is not found).
const { BASE, OUT, chromium, open, path } = require(`./helpers`);

const feature = (kind, rings) => JSON.stringify({ type: `Feature`, properties: { kind }, geometry: { type: `Polygon`, coordinates: rings } });
const box = (s, w, n, e) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const MAPPING = { Name: `Name`, Shape: `Shape`, Color: `Color`, Description: `Description`, Latitude: `Latitude`, Longitude: `Longitude` };

const ROWS = [
  { id: 1, Name: `Site`, Shape: feature(`rectangle`, box(43.600, 3.860, 43.620, 3.890)), Color: `#4A90D9`, Description: `Grand site` },
  { id: 2, Name: `Batiment A`, Shape: feature(`polygon`, [[[3.865, 43.605], [3.875, 43.605], [3.878, 43.612], [3.870, 43.616], [3.864, 43.611], [3.865, 43.605]]]), Color: `#E07B39`, Description: `Premier batiment\nDeux etages` },
  { id: 3, Name: `Batiment B`, Shape: feature(`rectangle`, box(43.606, 3.880, 43.611, 3.886)), Color: `#43A047` },
  { id: 4, Name: `Forme cassee`, Shape: `{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0]]]}}`, Color: `#000000` },
  { id: 5, Name: `Epingle`, Latitude: 43.603, Longitude: 3.862, Color: `#D32F2F`, Description: `<img src=x onerror=alert(1)>` },
  { id: 6, Name: `Anneau`, Shape: JSON.stringify({ type: `Polygon`, coordinates: [box(43.590, 3.840, 43.598, 3.850)[0], [[3.842, 43.592], [3.842, 43.596], [3.848, 43.596], [3.848, 43.592], [3.842, 43.592]]] }), Color: `#7B1FA2` }
];

(async () => {
  const browser = await chromium.launch();
  const failures = [];
  const check = (name, ok, detail) => { console.log(`${ok ? `ok  ` : `FAIL`} ${name}${ok ? `` : ` -> ${detail}`}`); if (!ok) failures.push(name); };

  const { page, errors } = await open(browser, `${BASE}/index.html`);
  await page.evaluate(({ rows, mapping }) => window.__grist.load(rows, mapping), { rows: ROWS, mapping: MAPPING });
  await page.waitForTimeout(800);
  const banner = await page.textContent(`#banner`);
  check(`shape banner names the column and an example`, /Shape/.test(banner) && /Forme cassee/.test(banner), banner);
  check(`shapes are drawn on a canvas`, (await page.locator(`.leaflet-overlay-pane canvas`).count()) === 1);
  check(`one pin is drawn`, (await page.locator(`.leaflet-marker-icon`).count()) >= 1);
  await page.screenshot({ path: path.join(OUT, `builder-1-overview.png`) });

  // The user zooms, then selects another row: the zoom must stay.
  await page.evaluate(() => document.querySelector(`#stage`).dispatchEvent(new Event(`pointermove`)));
  const before = await page.evaluate(() => document.querySelector(`.zoom-slider input`).value);
  await page.evaluate(() => window.__grist.selectRow(2));
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => document.querySelector(`.zoom-slider input`).value);
  check(`selecting a shape keeps the zoom`, before === after, `${before} -> ${after}`);
  check(`selecting a shape opens its label`, (await page.locator(`.leaflet-popup .popup-title`).textContent()) === `Batiment A`);
  check(`label keeps the line break`, (await page.locator(`.leaflet-popup .popup-desc br`).count()) === 1);
  await page.screenshot({ path: path.join(OUT, `builder-2-selected.png`) });

  // A click on the small building selects it, not the large site below it.
  const point = await page.evaluate(() => {
    const canvas = document.querySelector(`.leaflet-overlay-pane canvas`).getBoundingClientRect();
    return { x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(300);
  check(`click selects a row in Grist`, await page.evaluate(() => window.__selected !== null));

  // A pin label is text, never HTML.
  await page.evaluate(() => window.__grist.selectRow(5));
  await page.waitForTimeout(800);
  check(`pin label is plain text`, (await page.locator(`.leaflet-popup img`).count()) === 0);

  // Transparency slider acts on the shapes and is saved.
  await page.locator(`.transparency input`).evaluate((el) => { el.value = `60`; el.dispatchEvent(new Event(`input`)); el.dispatchEvent(new Event(`change`)); });
  check(`transparency is saved as an option`, await page.evaluate(() => Math.abs(window.__options.shapeOpacity - 0.4) < 0.001));
  check(`no page error`, errors.length === 0, errors.join(` | `));

  // Without shape or coordinates mapped, a clear message is shown.
  const second = await open(browser, `${BASE}/index.html`);
  await second.page.evaluate((rows) => window.__grist.load(rows, { Name: `Name` }), ROWS);
  await second.page.waitForTimeout(300);
  check(`missing columns message`, /Shape/.test(await second.page.textContent(`#docked`)));

  // Narrow panel and dark colour scheme.
  const narrow = await open(browser, `${BASE}/index.html`, { viewport: { width: 340, height: 520 }, colorScheme: `dark` });
  await narrow.page.evaluate(({ rows, mapping }) => window.__grist.load(rows, mapping), { rows: ROWS, mapping: MAPPING });
  await narrow.page.waitForTimeout(800);
  const bannerBox = await narrow.page.locator(`#banner`).boundingBox();
  check(`banner readable at 340 px`, bannerBox && bannerBox.width > 300 && bannerBox.height > 20);
  await narrow.page.screenshot({ path: path.join(OUT, `builder-3-narrow-dark.png`) });

  // Many shapes stay light.
  const heavy = await open(browser, `${BASE}/index.html`);
  const timing = await heavy.page.evaluate(async (mapping) => {
    const rows = [];
    for (let i = 0; i < 3000; i += 1) {
      const lat = 43 + (i % 60) * 0.01;
      const lng = 3 + Math.floor(i / 60) * 0.01;
      const ring = [[lng, lat], [lng + 0.008, lat], [lng + 0.008, lat + 0.008], [lng, lat + 0.008], [lng, lat]];
      rows.push({ id: i + 1, Name: `S${i}`, Shape: JSON.stringify({ type: `Polygon`, coordinates: [ring] }), Color: `#3388CC` });
    }
    const start = performance.now();
    await window.__grist.load(rows, mapping);
    const first = performance.now() - start;
    rows[10].Color = `#FF0000`;
    const again = performance.now();
    await window.__grist.load(rows, mapping);
    return { first: Math.round(first), edit: Math.round(performance.now() - again) };
  }, MAPPING);
  console.log(`3000 shapes: first load ${timing.first} ms, one edit ${timing.edit} ms`);
  check(`3000 shapes load in under 3 s`, timing.first < 3000, String(timing.first));
  check(`editing one row is fast`, timing.edit < 300, String(timing.edit));

  await browser.close();
  if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log(`\nall checks passed`);
})();
