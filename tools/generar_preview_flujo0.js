const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'Flujo 0 - Registro Inicial.json'), 'utf8'));
const node = workflow.nodes.find(node => node.name === 'Formulario Inicial');
const html = new Function('$json', '$execution', node.parameters.jsCode)(
  { webhookUrl: 'https://n8n.example.test/webhook/etb-form-inicial' },
  { id: 'preview-flujo0' },
)[0].json.html_response;
const output = path.join(root, 'preview', 'flujo0');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'registro-inicial.html'), html);
async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PREVIEW_BROWSER_CHANNEL ? { channel: process.env.PREVIEW_BROWSER_CHANNEL } : {}) });
  try {
    for (const [name, width, height] of [['escritorio', 1366, 768], ['movil', 375, 812]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.setContent(html);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error('Desbordamiento horizontal en ' + name);
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('Vista previa generada en preview/flujo0 para escritorio y móvil.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
