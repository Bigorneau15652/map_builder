// Checks that the department and region file (data/departements-regions.csv) is read and
// drawn by the widget without any ignored row. Usage: see tests/run.js.
const fs = require(`fs`);
const path = require(`path`);
const { BASE, OUT, chromium, open } = require(`./helpers`);

// A small reader for a CSV file with quoted cells (RFC 4180).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = ``;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === `"` && text[i + 1] === `"`) { cell += `"`; i += 1; } else if (c === `"`) quoted = false; else cell += c;
    } else if (c === `"`) quoted = true;
    else if (c === `,`) { row.push(cell); cell = ``; } else if (c === `\n` || c === `\r`) {
      if (c === `\r` && text[i + 1] === `\n`) i += 1;
      row.push(cell); rows.push(row); row = []; cell = ``;
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

(async () => {
  const [header, ...body] = parseCsv(fs.readFileSync(path.join(__dirname, `..`, `data`, `departements-regions.csv`), `utf8`));
  const records = body.filter((cells) => cells.length === header.length).map((cells, index) => {
    const record = { id: index + 1 };
    header.forEach((name, column) => { record[name] = cells[column]; });
    return record;
  });
  const browser = await chromium.launch();
  const failures = [];
  const check = (name, ok, detail) => { console.log(`${ok ? `ok  ` : `FAIL`} ${name}${ok ? `` : ` -> ${detail}`}`); if (!ok) failures.push(name); };

  const { page, errors } = await open(browser, `${BASE}/index.html`);
  const mapping = { Name: `Name`, Shape: `Shape`, Color: `Color`, Description: `Description` };
  const started = Date.now();
  await page.evaluate(({ rows, mapped }) => window.__grist.load(rows, mapped), { rows: records, mapped: mapping });
  await page.waitForTimeout(1500);
  console.log(`${records.length} rows loaded and drawn in ${Date.now() - started} ms`);

  check(`119 rows: 18 regions and 101 departments`, records.length === 119 && records.filter((r) => r.Type === `Région`).length === 18 && records.filter((r) => r.Type === `Département`).length === 101);
  check(`every cell is under the Excel limit`, records.every((r) => r.Shape.length <= 32000), String(Math.max(...records.map((r) => r.Shape.length))));
  check(`codes keep their leading zero and letters`, records.some((r) => r.Code === `01`) && records.some((r) => r.Code === `2A`));
  check(`every outline is read by the widget`, await page.locator(`#banner`).isHidden(), await page.textContent(`#banner`));
  check(`the outlines are drawn`, (await page.locator(`.leaflet-overlay-pane canvas`).count()) === 1);
  await page.screenshot({ path: path.join(OUT, `builder-5-france.png`) });

  // Mainland departments only, as a Grist filter would show them (a fresh widget fits its view).
  const mainland = await open(browser, `${BASE}/index.html`);
  await mainland.page.evaluate(({ rows, mapped }) => window.__grist.load(rows, mapped), {
    rows: records.filter((r) => r.Type === `Département` && !r.Code.startsWith(`97`)).map((r, i) => ({ ...r, id: i + 1 })), mapped: mapping
  });
  await mainland.page.waitForTimeout(1200);
  await mainland.page.screenshot({ path: path.join(OUT, `builder-6-departements.png`) });

  // Only the departments of one region, as a Grist filter would do.
  const occitanie = records.filter((r) => r.Type === `Département` && r.Region === `Occitanie`);
  await page.evaluate(({ rows, mapped }) => window.__grist.load(rows, mapped), { rows: occitanie.map((r, i) => ({ ...r, id: i + 1 })), mapped: mapping });
  await page.waitForTimeout(500);
  check(`Occitanie has 13 departments`, occitanie.length === 13, String(occitanie.length));
  check(`no page error`, errors.length === 0, errors.join(` | `));
  await browser.close();
  if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log(`\nall checks passed`);
})();
