// Checks of the drawing mode, with a mocked Grist that keeps the rows. Usage: see tests/run.js.
const { BASE, OUT, chromium, open, pixelOf, path } = require(`./helpers`);

const feature = (kind, rings) => JSON.stringify({ type: `Feature`, properties: { kind }, geometry: { type: `Polygon`, coordinates: rings } });
const MAPPING = { Name: `Name`, Shape: `Shape`, Color: `Color` };
const SITE = [[[3.860, 43.600], [3.890, 43.600], [3.890, 43.620], [3.860, 43.620], [3.860, 43.600]]];
const ROWS = [{ id: 1, Name: `Site`, Shape: feature(`rectangle`, SITE), Color: `#4A90D9` }];

const rows = (page) => page.evaluate(() => window.__table.rows.map((row) => ({ ...row, Shape: row.Shape && JSON.parse(row.Shape) })));
const ring = (row) => row.Shape.geometry.coordinates[0];
// Size of a ring in the projection of the map (metres), to tell a circle from an oval.
const sizeOf = (page, points) => page.evaluate((list) => {
  const projected = list.map(([lng, lat]) => L.CRS.EPSG3857.project(L.latLng(lat, lng)));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}, points);

(async () => {
  const browser = await chromium.launch();
  const failures = [];
  const check = (name, ok, detail) => { console.log(`${ok ? `ok  ` : `FAIL`} ${name}${ok ? `` : ` -> ${detail}`}`); if (!ok) failures.push(name); };

  const { page, errors } = await open(browser, `${BASE}/index.html`);
  await page.evaluate(({ data, mapping }) => window.__grist.load(data, mapping), { data: ROWS, mapping: MAPPING });
  await page.waitForTimeout(600);
  const at = (lat, lng) => pixelOf(page, lat, lng);

  // Enter the drawing mode.
  await page.evaluate(() => document.querySelector(`#stage`).dispatchEvent(new Event(`pointermove`)));
  await page.locator(`#tools button[aria-pressed]`).click();
  check(`the toolbar opens`, await page.locator(`#edit-bar`).isVisible());
  check(`the help line shows`, (await page.locator(`#edit-hint`).textContent()).length > 20);

  const tool = (index) => page.locator(`#edit-bar button`).nth(index);
  const dialogName = async (name) => {
    await page.locator(`#f-shape-name`).fill(name);
    await page.locator(`.dialog button[type=submit]`).click();
    await page.waitForTimeout(300);
  };
  const drag = async (from, to, { shift = false } = {}) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    if (shift) await page.keyboard.down(`Shift`);
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    if (shift) await page.keyboard.up(`Shift`);
  };

  // Rectangle with Shift: a square.
  await tool(1).click();
  const origin = await at(43.612, 3.866);
  await drag(origin, { x: origin.x + 90, y: origin.y + 40 }, { shift: true });
  await page.waitForTimeout(200);
  check(`a name is asked for a new shape`, await page.locator(`#f-shape-name`).isVisible());
  await dialogName(`Carre`);
  let all = await rows(page);
  const square = all.find((row) => row.Name === `Carre`);
  check(`the square is written to the table`, Boolean(square) && square.Shape.properties.kind === `rectangle` && square.Color === `#4A90D9`);
  if (square) {
    const size = await sizeOf(page, ring(square));
    check(`Shift gives a square`, Math.abs(size.width / size.height - 1) < 0.02, JSON.stringify(size));
  }

  // Oval without Shift, then with Shift (a circle).
  await tool(2).click();
  const base = await at(43.603, 3.866);
  await drag(base, { x: base.x + 120, y: base.y + 40 });
  await dialogName(`Ovale`);
  await drag({ x: base.x + 200, y: base.y }, { x: base.x + 280, y: base.y + 30 }, { shift: true });
  await dialogName(`Cercle`);
  all = await rows(page);
  const oval = all.find((row) => row.Name === `Ovale`);
  const circle = all.find((row) => row.Name === `Cercle`);
  const ovalSize = oval && await sizeOf(page, ring(oval));
  const circleSize = circle && await sizeOf(page, ring(circle));
  check(`an oval is wider than high`, Boolean(oval) && ovalSize.width / ovalSize.height > 2.2, JSON.stringify(ovalSize));
  check(`an oval has 64 points`, Boolean(oval) && ring(oval).length === 65);
  check(`Shift gives a circle`, Boolean(circle) && Math.abs(circleSize.width / circleSize.height - 1) < 0.03, JSON.stringify(circleSize));

  // Free shape: four clicks, then a click on the first point.
  await tool(3).click();
  const corner = await at(43.617, 3.880);
  const points = [[0, 0], [70, 0], [90, 60], [10, 80]].map(([dx, dy]) => ({ x: corner.x + dx, y: corner.y + dy }));
  for (const point of points) {
    await page.mouse.click(point.x, point.y);
  }
  await page.mouse.click(points[0].x, points[0].y);
  await dialogName(`Libre`);
  all = await rows(page);
  const free = all.find((row) => row.Name === `Libre`);
  check(`a free shape has four points`, Boolean(free) && ring(free).length === 5 && free.Shape.properties.kind === `polygon`);

  // Space + drag moves the map and draws nothing.
  const before = (await rows(page)).length;
  const centerBefore = await page.evaluate(() => window.__map.getCenter().lat);
  await tool(1).click();
  await page.keyboard.down(` `);
  await drag({ x: 500, y: 300 }, { x: 560, y: 380 });
  await page.keyboard.up(` `);
  check(`space and drag moves the map`, Math.abs((await page.evaluate(() => window.__map.getCenter().lat)) - centerBefore) > 0.0001);
  check(`space and drag draws nothing`, (await rows(page)).length === before && !(await page.locator(`#f-shape-name`).isVisible()));

  // Select and reshape: eight handles on a rectangle; dragging a corner resizes it.
  await tool(0).click();
  await page.evaluate(() => window.__grist.selectRow(2));
  await page.waitForTimeout(500);
  check(`a rectangle has eight handles`, (await page.locator(`.handle.corner, .handle.side`).count()) === 8);
  const sw = await at(ring(square)[0][1], ring(square)[0][0]);
  const widthBefore = (await sizeOf(page, ring(square))).width;
  await drag(sw, { x: sw.x - 30, y: sw.y + 30 });
  await page.waitForTimeout(400);
  const resized = (await rows(page)).find((row) => row.Name === `Carre`);
  check(`dragging a corner resizes the rectangle`, (await sizeOf(page, ring(resized))).width > widthBefore * 1.2);
  check(`the rectangle stays a rectangle`, resized.Shape.properties.kind === `rectangle` && ring(resized).length === 5);

  // Free shape: point handles; a middle handle adds a point; a double click removes one.
  await page.evaluate((id) => window.__grist.selectRow(id), free.id);
  await page.waitForTimeout(500);
  check(`a free shape has point and middle handles`, (await page.locator(`.handle.vertex`).count()) === 4 && (await page.locator(`.handle.middle`).count()) === 4);
  const middle = await page.locator(`.handle.middle`).first().boundingBox();
  await drag({ x: middle.x + 7, y: middle.y + 7 }, { x: middle.x + 7, y: middle.y - 30 });
  await page.waitForTimeout(400);
  check(`dragging a middle handle adds a point`, ring((await rows(page)).find((row) => row.Name === `Libre`)).length === 6);
  await page.locator(`.handle.vertex`).first().dblclick();
  await page.waitForTimeout(400);
  check(`a double click removes a point`, ring((await rows(page)).find((row) => row.Name === `Libre`)).length === 5);

  // Moving a whole shape.
  const oldRing = ring((await rows(page)).find((row) => row.Name === `Ovale`));
  const ovalCenter = await at(43.603, 3.866);
  const target = { x: ovalCenter.x + 60, y: ovalCenter.y + 20 };
  await drag(target, { x: target.x + 50, y: target.y + 25 });
  await page.waitForTimeout(400);
  const newRing = ring((await rows(page)).find((row) => row.Name === `Ovale`));
  check(`dragging a shape moves it`, newRing[0][0] > oldRing[0][0] + 0.0001 && newRing.length === oldRing.length);

  // Eraser and undo.
  await tool(4).click();
  const count = (await rows(page)).length;
  const victim = await at(...[ring((await rows(page)).find((row) => row.Name === `Cercle`))].map((r) => [(r[0][1] + r[32][1]) / 2, (r[0][0] + r[32][0]) / 2])[0]);
  await page.mouse.click(victim.x, victim.y);
  await page.waitForTimeout(400);
  check(`the eraser deletes a shape`, (await rows(page)).length === count - 1);
  check(`the erased shape is announced`, /Cercle/.test(await page.locator(`#toast`).textContent()));
  await page.locator(`#edit-bar button`).nth(6).click();
  await page.waitForTimeout(500);
  check(`undo brings the shape back`, (await rows(page)).length === count && (await rows(page)).some((row) => row.Name === `Cercle`));

  // Snapping: a rectangle started near a corner of the site takes that corner exactly.
  await tool(1).click();
  const siteCorner = await at(43.600, 3.860);
  await drag({ x: siteCorner.x + 4, y: siteCorner.y - 3 }, { x: siteCorner.x + 50, y: siteCorner.y - 50 });
  await dialogName(`Colle`);
  const snapped = (await rows(page)).find((row) => row.Name === `Colle`);
  check(`snapping joins two shapes at a corner`, Boolean(snapped) && ring(snapped).some(([lng, lat]) => Math.abs(lng - 3.860) < 1e-5 && Math.abs(lat - 43.600) < 1e-5));

  // Escape cancels a name dialog: nothing is written.
  const beforeCancel = (await rows(page)).length;
  await drag({ x: 600, y: 500 }, { x: 680, y: 560 });
  await page.keyboard.press(`Escape`);
  await page.waitForTimeout(300);
  check(`cancelling the name writes nothing`, (await rows(page)).length === beforeCancel);

  // A refused write is reported and the map goes back to the table.
  await page.evaluate(() => { window.__table.failWrites = true; });
  await drag({ x: 600, y: 500 }, { x: 680, y: 560 });
  await dialogName(`Refuse`);
  check(`a refused write is reported`, /could not be changed|n'a pas pu/.test(await page.locator(`#toast`).textContent()));
  await page.screenshot({ path: path.join(OUT, `builder-4-editing.png`) });

  // Leaving the drawing mode.
  await page.locator(`#edit-bar button`).nth(7).click();
  check(`the toolbar closes`, !(await page.locator(`#edit-bar`).isVisible()));
  check(`no page error`, errors.length === 0, errors.join(` | `));

  await browser.close();
  if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log(`\nall checks passed`);
})();
