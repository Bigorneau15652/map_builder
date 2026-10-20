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
  check(`the coloured frame shows while editing`, await page.evaluate(() => getComputedStyle(document.querySelector(`#stage`), `::after`).borderTopWidth === `4px`));
  check(`the toolbar has three shapes, the eraser, the fusion and the snapping`, (await page.locator(`#edit-bar button`).count()) === 6);
  check(`the toolbar is split in groups`, (await page.locator(`#edit-bar .bar-gap`).count()) === 3);
  check(`the help line shows`, (await page.locator(`#edit-hint`).textContent()).length > 20);

  // The tool buttons are, in this order: rectangle, oval, free shape, eraser (then snapping).
  const tool = (index) => page.locator(`#edit-bar button`).nth(index);
  const use = async (index) => {
    if ((await tool(index).getAttribute(`aria-pressed`)) !== `true`) await tool(index).click();
  };
  const normalMode = async () => {
    for (let index = 0; index < 4; index += 1) if ((await tool(index).getAttribute(`aria-pressed`)) === `true`) await tool(index).click();
  };
  const pressedTools = () => page.evaluate(() => [...document.querySelectorAll(`#edit-bar button`)].slice(0, 4).filter((b) => b.getAttribute(`aria-pressed`) === `true`).length);
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
  await use(0);
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
  await use(1);
  const base = await at(43.603, 3.866);
  await drag(base, { x: base.x + 120, y: base.y + 40 });
  await dialogName(`Ovale`);
  await use(1);
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
  await use(2);
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
  await use(0);
  await page.keyboard.down(` `);
  await drag({ x: 500, y: 300 }, { x: 560, y: 380 });
  await page.keyboard.up(` `);
  check(`space and drag moves the map`, Math.abs((await page.evaluate(() => window.__map.getCenter().lat)) - centerBefore) > 0.0001);
  check(`space and drag draws nothing`, (await rows(page)).length === before && !(await page.locator(`#f-shape-name`).isVisible()));

  // Select and reshape: eight handles on a rectangle; dragging a corner resizes it.
  await normalMode();
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
  const pictogram = (selector) => page.locator(selector).first().evaluate((el) => /^url\(.*svg\+xml/.test(getComputedStyle(el).cursor));
  check(`the points of a free shape have their own cursor`, await pictogram(`.handle.vertex`));
  check(`the middle handles of a free shape have their own cursor`, await pictogram(`.handle.middle`));
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

  // Eraser and undo: the row stays, only its Shape is emptied.
  await use(3);
  const count = (await rows(page)).length;
  const circleRing = ring((await rows(page)).find((row) => row.Name === `Cercle`));
  const victim = await at((circleRing[0][1] + circleRing[32][1]) / 2, (circleRing[0][0] + circleRing[32][0]) / 2);
  await page.mouse.click(victim.x, victim.y);
  await page.waitForTimeout(400);
  const erased = (await rows(page)).find((row) => row.Name === `Cercle`);
  check(`the eraser empties the Shape and keeps the row`, (await rows(page)).length === count && Boolean(erased) && !erased.Shape && erased.Color === `#4A90D9`);
  check(`the erased shape is announced`, /Cercle/.test(await page.locator(`#toast`).textContent()));
  await page.keyboard.press(`Control+z`);
  await page.waitForTimeout(500);
  check(`Ctrl+Z brings the shape back`, Boolean((await rows(page)).find((row) => row.Name === `Cercle`).Shape));

  // Snapping: a rectangle started near a corner of the site takes that corner exactly.
  await use(0);
  const siteCorner = await at(43.600, 3.860);
  await drag({ x: siteCorner.x + 4, y: siteCorner.y - 3 }, { x: siteCorner.x + 50, y: siteCorner.y - 50 });
  await dialogName(`Colle`);
  const snapped = (await rows(page)).find((row) => row.Name === `Colle`);
  check(`snapping joins two shapes at a corner`, Boolean(snapped) && ring(snapped).some(([lng, lat]) => Math.abs(lng - 3.860) < 1e-5 && Math.abs(lat - 43.600) < 1e-5));

  // Cursors on the handles tell what they do, and follow the turn of the shape.
  await normalMode();
  await page.evaluate((id) => window.__grist.selectRow(id), square.id);
  await page.waitForTimeout(500);
  const cursors = () => page.evaluate(() => [...document.querySelectorAll(`.handle.corner, .handle.side`)].map((el) => getComputedStyle(el).cursor));
  check(`handles have resize cursors`, JSON.stringify(await cursors()) === JSON.stringify([`nesw-resize`, `nwse-resize`, `nesw-resize`, `nwse-resize`, `ew-resize`, `ew-resize`, `ns-resize`, `ns-resize`]), JSON.stringify(await cursors()));
  // The effective cursor over a handle of a shape of the table, the mouse coming from the shape.
  const ringOfSquare = ring((await rows(page)).find((row) => row.id === square.id));
  const bodyPoint = await at((ringOfSquare[0][1] + ringOfSquare[2][1]) / 2, (ringOfSquare[0][0] + ringOfSquare[2][0]) / 2);
  await page.mouse.move(bodyPoint.x, bodyPoint.y);
  await page.waitForTimeout(150);
  check(`the move cursor shows over a shape of the table`, await page.evaluate(() => window.__map.getContainer().classList.contains(`edit-move`)));
  const cornerHandle = await page.locator(`.handle.corner`).nth(2).boundingBox();
  await page.mouse.move(cornerHandle.x + 7, cornerHandle.y + 7);
  check(`a handle keeps its resize cursor over the shape`, (await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [cornerHandle.x + 7, cornerHandle.y + 7])) === `nesw-resize`);
  check(`every handle says what it does in a tooltip`, await page.evaluate(() => [...document.querySelectorAll(`.handle`)].every((el) => el.title.length > 5)));
  check(`the rotation handle has its own cursor`, /^url\(.*svg\+xml/.test(await page.locator(`.handle.rotate`).evaluate((el) => getComputedStyle(el).cursor)));

  // Turning a rectangle with the top handle (Shift: steps of 15 degrees).
  const squareRing = ring((await rows(page)).find((row) => row.Name === `Carre`));
  const sizeBefore = await sizeOf(page, squareRing);
  const handleBox = await page.locator(`.handle.rotate`).boundingBox();
  const handle = { x: handleBox.x + 7, y: handleBox.y + 7 };
  const centre = await at(...squareRing.slice(0, 4).reduce((sum, [lng, lat]) => [sum[0] + lat / 4, sum[1] + lng / 4], [0, 0]));
  const radius = Math.hypot(handle.x - centre.x, handle.y - centre.y);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 10, handle.y + 10, { steps: 3 });
  await page.keyboard.down(`Shift`);
  await page.mouse.move(centre.x + radius, centre.y + 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up(`Shift`);
  await page.waitForTimeout(500);
  const turned = (await rows(page)).find((row) => row.Name === `Carre`);
  check(`the top handle turns a rectangle by steps`, Math.abs(turned.Shape.properties.rotation - 90) < 0.01, String(turned.Shape.properties.rotation));
  check(`the turned rectangle is still a rectangle`, turned.Shape.properties.kind === `rectangle` && ring(turned).length === 5);
  check(`the east handle now resizes up and down`, (await cursors())[5] === `ns-resize`, JSON.stringify(await cursors()));
  const turnedSize = await sizeOf(page, ring(turned));
  check(`turning keeps the size`, Math.abs(turnedSize.width - sizeBefore.height) < sizeBefore.height * 0.02, JSON.stringify({ sizeBefore, turnedSize }));

  // A row of the table without shape receives the next shape drawn.
  await page.evaluate(({ data, mapping }) => window.__grist.load(data, mapping), {
    data: [...(await rows(page)).map((row) => ({ ...row, Shape: JSON.stringify(row.Shape) })), { id: 99, Name: `Vide`, Shape: ``, Color: `#222222` }], mapping: MAPPING
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__grist.selectRow(99));
  await page.waitForTimeout(300);
  await use(0);
  check(`the help line names the row that will receive the shape`, /Vide/.test(await page.locator(`#edit-hint`).textContent()));
  const countBefore = (await rows(page)).length;
  const free1 = await at(43.5985, 3.8700);
  await drag(free1, { x: free1.x + 60, y: free1.y + 40 });
  await page.waitForTimeout(500);
  const filled = (await rows(page)).find((row) => row.id === 99);
  check(`the shape fills the selected row`, Boolean(filled.Shape) && filled.Color === `#222222` && (await rows(page)).length === countBefore, JSON.stringify({ filled, count: (await rows(page)).length, countBefore }));
  check(`no name is asked for`, !(await page.locator(`#f-shape-name`).isVisible()));

  // Escape (or a right click) leaves a shape being drawn.
  await use(2);
  const baseline = await page.evaluate(() => document.querySelectorAll(`#map svg path`).length);
  const startAt = await at(43.5985, 3.8850);
  await page.mouse.click(startAt.x, startAt.y);
  await page.mouse.click(startAt.x + 60, startAt.y);
  await page.mouse.move(startAt.x + 60, startAt.y + 50);
  const paths = () => page.evaluate(() => document.querySelectorAll(`#map svg path`).length);
  const preview = async () => (await paths()) - baseline;
  check(`a drawing in progress shows a preview`, (await preview()) > 0);
  await page.keyboard.press(`Escape`);
  await page.waitForTimeout(200);
  check(`Escape cancels a drawing in progress`, (await preview()) === 0);
  check(`Escape stays on the same tool when something was cancelled`, (await tool(2).getAttribute(`aria-pressed`)) === `true`);
  await page.mouse.click(startAt.x, startAt.y);
  await page.mouse.click(startAt.x + 60, startAt.y);
  await page.mouse.click(startAt.x + 30, startAt.y + 40, { button: `right` });
  await page.waitForTimeout(200);
  check(`a right click cancels a drawing in progress`, (await preview()) === 0);
  await page.keyboard.press(`Escape`);
  check(`Escape then leaves the tool`, (await pressedTools()) === 0);

  // A row with a pin (name, comment, coordinates) and no shape receives the building drawn on it.
  const pinRow = { id: 120, Name: `Mairie`, Description: `Un commentaire`, Latitude: 43.6065, Longitude: 3.8625, Color: `#D32F2F`, Shape: `` };
  await page.evaluate(({ data, mapping }) => window.__grist.load(data, mapping), {
    data: [...(await rows(page)).map((row) => ({ ...row, Shape: row.Shape ? JSON.stringify(row.Shape) : `` })), pinRow], mapping: { ...MAPPING, Description: `Description`, Latitude: `Latitude`, Longitude: `Longitude` }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__grist.selectRow(120));
  await page.waitForTimeout(500);
  // A click on the empty map must not make the row forget its selection.
  const emptyPlace = await at(43.5905, 3.9000);
  await page.mouse.click(emptyPlace.x, emptyPlace.y);
  await page.waitForTimeout(300);
  const centreBefore = await page.evaluate(() => { const c = window.__map.getCenter(); return [c.lat, c.lng, window.__map.getZoom()]; });
  await use(0);
  check(`the help line names the row that has a pin`, /Mairie/.test(await page.locator(`#edit-hint`).textContent()));
  const pinCount = (await rows(page)).length;
  const building = await at(43.6065, 3.8625);
  await drag({ x: building.x - 20, y: building.y - 20 }, { x: building.x + 40, y: building.y + 25 });
  await page.waitForTimeout(600);
  const mairie = (await rows(page)).find((row) => row.id === 120);
  check(`the building is drawn on the row of the pin`, Boolean(mairie.Shape) && (await rows(page)).length === pinCount && mairie.Latitude === 43.6065 && mairie.Description === `Un commentaire`);
  const centreAfter = await page.evaluate(() => { const c = window.__map.getCenter(); return [c.lat, c.lng, window.__map.getZoom()]; });
  check(`drawing does not recentre the map`, JSON.stringify(centreBefore) === JSON.stringify(centreAfter), JSON.stringify({ centreBefore, centreAfter }));

  // In the drawing mode, a click on a shape does not move the map.
  await normalMode();
  const siteCentre = await at(43.612, 3.866);
  const mapBefore = await page.evaluate(() => { const c = window.__map.getCenter(); return [c.lat, c.lng]; });
  await page.mouse.click(siteCentre.x, siteCentre.y);
  await page.waitForTimeout(900);
  const mapAfter = await page.evaluate(() => { const c = window.__map.getCenter(); return [c.lat, c.lng]; });
  check(`a click on a shape does not recentre the map while drawing`, JSON.stringify(mapBefore) === JSON.stringify(mapAfter), JSON.stringify({ mapBefore, mapAfter }));

  // Fusion: the second shape is drawn, then moved and resized, the operation is chosen with the
  // three buttons and Enter writes the result.
  await normalMode();
  await page.evaluate(() => window.__grist.selectRow(1));
  await page.waitForTimeout(500);
  await tool(4).click();
  check(`the fusion button is pressed`, (await tool(4).getAttribute(`aria-pressed`)) === `true`);
  check(`the help line explains the fusion`, /1 \+ 2/.test(await page.locator(`#edit-hint`).textContent()));
  const rowsBeforeFusion = (await rows(page)).length;
  const choices = page.locator(`.fusion-choices button`);
  check(`the three operation buttons wait for the second shape`, (await choices.count()) === 0);
  await use(0);
  const holeFrom = await at(43.6135, 3.8715);
  await drag(holeFrom, { x: holeFrom.x + 40, y: holeFrom.y + 30 });
  await page.waitForTimeout(400);
  check(`three operation buttons appear next to the fusion button`, (await choices.count()) === 3);
  check(`no name is asked for and no row is created`, !(await page.locator(`#f-shape-name`).isVisible()) && (await rows(page)).length === rowsBeforeFusion);
  const outside = await at(43.5905, 3.9000);
  await page.mouse.click(outside.x, outside.y);
  await page.waitForTimeout(300);
  check(`a click on the map does not confirm before an operation is chosen`, (await choices.count()) === 3 && (await rows(page)).find((row) => row.id === 1).Shape.geometry.coordinates.length === 1);
  check(`the second shape has its handles`, (await page.locator(`.handle.corner, .handle.side`).count()) === 8);
  check(`1 + 2 is shown first`, (await choices.nth(0).getAttribute(`aria-pressed`)) === `true`);
  await choices.nth(1).click();
  await page.waitForTimeout(200);
  check(`the chosen operation is pressed`, (await choices.nth(1).getAttribute(`aria-pressed`)) === `true` && (await choices.nth(0).getAttribute(`aria-pressed`)) === `false`);
  check(`nothing is written before Enter`, (await rows(page)).find((row) => row.id === 1).Shape.geometry.coordinates.length === 1);

  // The second shape is moved by dragging it, then resized with a corner handle.
  const centreOfSecond = { x: holeFrom.x + 20, y: holeFrom.y + 15 };
  const mapCentre = () => page.evaluate(() => { const c = window.__map.getCenter(); return [c.lat, c.lng]; });
  const centreBeforeMove = await mapCentre();
  await drag(centreOfSecond, { x: centreOfSecond.x + 25, y: centreOfSecond.y });
  await page.waitForTimeout(300);
  check(`dragging the second shape moves the shape, not the map`, JSON.stringify(centreBeforeMove) === JSON.stringify(await mapCentre()), JSON.stringify({ centreBeforeMove, after: await mapCentre() }));
  // The cursors of the handles are the effective ones, also when the mouse comes from the shape.
  await page.mouse.move(centreOfSecond.x + 25, centreOfSecond.y);
  await page.waitForTimeout(150);
  check(`the move cursor shows over the shape`, await page.evaluate(() => window.__map.getContainer().classList.contains(`edit-move`)));
  const handleCursors = [];
  for (const index of [0, 2, 4, 6]) {
    const box = await page.locator(`.handle.corner, .handle.side`).nth(index).boundingBox();
    await page.mouse.move(box.x + 7, box.y + 7);
    handleCursors.push(await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [box.x + 7, box.y + 7]));
  }
  check(`the handles show resize cursors`, JSON.stringify(handleCursors) === JSON.stringify([`nesw-resize`, `nesw-resize`, `ew-resize`, `ns-resize`]), JSON.stringify(handleCursors));
  const rotateBox = await page.locator(`.handle.rotate`).boundingBox();
  await page.mouse.move(rotateBox.x + 7, rotateBox.y + 7);
  check(`the rotation handle shows its own pictogram`, /^url\(.*svg\+xml/.test(await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [rotateBox.x + 7, rotateBox.y + 7])));
  const cornerBox = await page.locator(`.handle.corner`).nth(2).boundingBox();
  await drag({ x: cornerBox.x + 7, y: cornerBox.y + 7 }, { x: cornerBox.x + 22, y: cornerBox.y - 8 });
  await page.waitForTimeout(300);
  check(`nothing is written while the second shape is adjusted`, (await rows(page)).find((row) => row.id === 1).Shape.geometry.coordinates.length === 1 && (await rows(page)).length === rowsBeforeFusion);
  await page.screenshot({ path: path.join(OUT, `builder-7-fusion.png`) });
  // A click on the map, outside the second shape, confirms the chosen operation.
  const outsidePlace = await at(43.5905, 3.9000);
  await page.mouse.click(outsidePlace.x, outsidePlace.y);
  await page.waitForTimeout(500);
  const withHole = (await rows(page)).find((row) => row.id === 1);
  check(`a click outside writes 1 - 2: a hole in the shape`, withHole.Shape.geometry.type === `Polygon` && withHole.Shape.geometry.coordinates.length === 2, String(withHole.Shape.geometry.coordinates.length));
  const holeLngs = withHole.Shape.geometry.coordinates[1].map((point) => point[0]);
  const movedLng = await page.evaluate((x) => window.__map.containerPointToLatLng([x, 100]).lng, holeFrom.x + 25 - (await page.evaluate(() => window.__map.getContainer().getBoundingClientRect().left)));
  check(`the hole is where the second shape was moved`, Math.abs(Math.min(...holeLngs) - movedLng) < 0.0015, `${Math.min(...holeLngs)} / ${movedLng}`);
  check(`the other columns of the row are kept`, withHole.Name === `Site` && withHole.Color === `#4A90D9` && (await rows(page)).length === rowsBeforeFusion);
  check(`the operation buttons are gone`, (await choices.count()) === 0);
  await page.keyboard.press(`Control+z`);
  await page.waitForTimeout(500);
  check(`Ctrl+Z gives the shape back`, (await rows(page)).find((row) => row.id === 1).Shape.geometry.coordinates.length === 1);

  // Esc gives up and writes nothing.
  await tool(4).click();
  await use(0);
  await drag(holeFrom, { x: holeFrom.x + 40, y: holeFrom.y + 30 });
  await page.waitForTimeout(300);
  await page.keyboard.press(`Escape`);
  await page.waitForTimeout(300);
  check(`Esc removes the buttons and writes nothing`, (await choices.count()) === 0 && (await rows(page)).find((row) => row.id === 1).Shape.geometry.coordinates.length === 1 && (await page.locator(`.handle`).count()) === 8 + 1);

  // An empty result cannot be validated: 2 - 1 of a second shape inside the first one.
  await tool(4).click();
  await use(0);
  await drag(holeFrom, { x: holeFrom.x + 40, y: holeFrom.y + 30 });
  await choices.nth(2).click();
  await page.waitForTimeout(300);
  check(`an empty result is announced`, /vide|empty/.test(await page.locator(`#toast`).textContent()));
  await page.keyboard.press(`Enter`);
  await page.waitForTimeout(300);
  check(`Enter does nothing on an empty result`, (await choices.count()) === 3 && (await rows(page)).find((row) => row.id === 1).Shape.geometry.coordinates.length === 1);
  await page.keyboard.press(`Escape`);
  await page.waitForTimeout(200);

  // 1 + 2 of two overlapping shapes joins them in one outline.
  await tool(4).click();
  await use(0);
  const cornerNE = await at(43.620, 3.890);
  await drag({ x: cornerNE.x - 30, y: cornerNE.y + 30 }, { x: cornerNE.x + 40, y: cornerNE.y - 40 });
  await page.waitForTimeout(300);
  await page.keyboard.press(`Enter`);
  await page.waitForTimeout(500);
  const joined = (await rows(page)).find((row) => row.id === 1);
  const joinedLng = ring(joined).map((point) => point[0]);
  check(`1 + 2 joins the two shapes in one outline`, joined.Shape.geometry.type === `Polygon` && Math.max(...joinedLng) > 3.8905, String(Math.max(...joinedLng)));
  await page.keyboard.press(`Control+z`);
  await page.waitForTimeout(400);

  // Escape cancels a name dialog: nothing is written.
  await use(0);
  const beforeCancel = (await rows(page)).length;
  await drag({ x: 600, y: 500 }, { x: 680, y: 560 });
  await page.keyboard.press(`Escape`);
  await page.waitForTimeout(300);
  check(`cancelling the name writes nothing`, (await rows(page)).length === beforeCancel);

  // A refused write is reported and the map goes back to the table.
  await page.evaluate(() => { window.__table.failWrites = true; });
  await use(0);
  await drag({ x: 600, y: 500 }, { x: 680, y: 560 });
  await dialogName(`Refuse`);
  check(`a refused write is reported`, /could not be changed|n'a pas pu/.test(await page.locator(`#toast`).textContent()));
  await page.screenshot({ path: path.join(OUT, `builder-4-editing.png`) });

  // Leaving the drawing mode.
  await page.locator(`#tools button[aria-pressed]`).click();
  check(`the coloured frame goes away`, !(await page.evaluate(() => document.querySelector(`#stage`).classList.contains(`editing`))));
  check(`the toolbar closes`, !(await page.locator(`#edit-bar`).isVisible()));
  check(`no page error`, errors.length === 0, errors.join(` | `));

  await browser.close();
  if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log(`\nall checks passed`);
})();
