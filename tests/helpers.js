// Shared by the test files: a browser page with a mocked Grist, and a way to find where a
// position of the map is on the screen.
const fs = require(`fs`);
const path = require(`path`);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || `playwright`);

const BASE = process.env.BASE_URL || `http://localhost:8765`;
const OUT = process.env.OUT_DIR || `/tmp`;
const mock = fs.readFileSync(path.join(__dirname, `mock-grist.js`), `utf8`);

// Leaflet is wrapped so that the tests can ask the map where a position is on the screen.
const CAPTURE_MAP = () => {
  let leaflet;
  Object.defineProperty(window, `L`, {
    configurable: true,
    get: () => leaflet,
    set: (value) => {
      leaflet = value;
      const original = value.map;
      value.map = function (...args) {
        const map = original.apply(this, args);
        window.__map = map;
        return map;
      };
    }
  });
};

async function open(browser, url, extra = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, ...extra });
  const errors = [];
  page.on(`pageerror`, (e) => errors.push(String(e)));
  page.on(`dialog`, (d) => { errors.push(`dialog: ${d.message()}`); d.dismiss(); });
  await page.addInitScript(CAPTURE_MAP);
  await page.route(`**/*`, (route) => {
    const u = route.request().url();
    if (u.endsWith(`grist-plugin-api.js`)) return route.fulfill({ contentType: `text/javascript`, body: mock });
    if (u.startsWith(BASE)) return route.continue();
    return route.abort();
  });
  await page.goto(url);
  return { page, errors };
}


// Where a [lat, lng] is on the page, in pixels.
async function pixelOf(page, lat, lng) {
  return page.evaluate(([la, ln]) => {
    const box = window.__map.getContainer().getBoundingClientRect();
    const point = window.__map.latLngToContainerPoint([la, ln]);
    return { x: box.left + point.x, y: box.top + point.y };
  }, [lat, lng]);
}

module.exports = { BASE, OUT, chromium, open, pixelOf, path };
