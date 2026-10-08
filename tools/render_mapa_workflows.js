// Captura los mapas locales generados; requiere Playwright y un navegador instalado.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
async function main() {
  const directory = path.resolve(__dirname, '..', 'preview', 'workflows');
  const browser = await chromium.launch({ channel: process.env.PREVIEW_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 2200, height: 1400 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(directory, 'index.html')).href);
    for (let stage = 0; stage <= 3; stage++) {
      await page.locator('section').nth(stage).screenshot({ path: path.join(directory, `flujo-${stage}.png`), timeout: 10000 });
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
