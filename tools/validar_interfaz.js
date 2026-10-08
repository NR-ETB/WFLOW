// Pruebas del navegador local. Toda solicitud de red se bloquea.
// Requiere Playwright y Edge; no interactúa con n8n publicado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const workflows = [0, 1, 2, 3].map(stage => JSON.parse(fs.readFileSync(path.join(root,
  stage ? `Ningun Servicio Funciona - ${stage}.json` : 'Flujo 0 - Registro Inicial.json'), 'utf8')));
const execution = { id: 'interfaz-local', mode: 'production', resumeUrl: 'https://n8n.test/webhook-waiting/local' };
function render(stage, name, input) {
  const node = workflows[stage].nodes.find(item => item.name === name);
  return new Function('$json', '$execution', '$', node.parameters.jsCode)(input, execution,
    () => ({ first: () => ({ json: input }) }))[0].json.html_response;
}
async function main() {
  const browser = await chromium.launch({ channel: process.env.PREVIEW_BROWSER_CHANNEL || 'msedge', headless: true });
  let forms = 0;
  const errors = [];
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const input = { query: { workflow_session: 'f0-interfaz-local', tipo_sim: 'eSIM' },
      workflow_session: 'f0-interfaz-local', webhookUrl: 'https://n8n.test/webhook/etb-form-inicial' };
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      for (let stage = 0; stage <= 3; stage++) {
        for (const form of workflows[stage].nodes.filter(node => node.name.startsWith('Form ') || node.name === 'Formulario Inicial')) {
          await page.setContent(render(stage, form.name, input));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false,
            `${form.name}: desbordamiento horizontal a ${width}px`);
          forms++;
        }
      }
    }
    for (const [stage, name, link, hidden] of [
      [1, 'Form Validar Cobertura y Viaje', 'coverageMapLink', 'mapa_cobertura_abierto'],
      [1, 'Form Consultar Registro IMEI', 'imeiPublicLink', 'consulta_imei_abierta'],
      [3, 'Form Configurar Equipo Plataforma', 'configurationGuideLink', 'guia_configuracion_abierta'],
    ]) {
      await page.setContent(render(stage, name, input));
      await page.locator('input[type=radio]').first().evaluate(element => {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert.notEqual(await page.locator(`input[name="${hidden}"]`).inputValue(), 'Si');
      assert.equal(await page.locator('#f').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))), false,
        name + ': no permite enviar antes de abrir el enlace');
      assert.ok((await page.locator('#errBanner').innerText()).length > 0);
      if (link === 'coverageMapLink') {
        assert.equal(await page.locator('#submitBtn').isDisabled(), true);
        assert.ok((await page.locator('#coverageRequirementNotice').innerText()).includes('Debes abrir'));
      }
      await page.locator('#' + link).evaluate(element => element.click());
      assert.equal(await page.locator(`input[name="${hidden}"]`).inputValue(), 'Si');
      assert.equal(await page.locator('#submitBtn').isDisabled(), false);
    }
    await page.setContent(render(2, 'Form Escalar Gestor NIP', input));
    assert.equal(await page.locator('input[type=radio]').count(), 1);
    assert.ok((await page.locator('body').innerText()).includes('Se escaló el caso'));
    assert.ok(!(await page.locator('body').innerText()).includes('Caso escalado al gestor'));
    await page.setContent(render(2, 'Form Cierre Sin Recursos', input));
    assert.ok((await page.locator('body').innerText()).includes('No aplica falla'));
    assert.equal(await page.locator('#backButton').count(), 1);
    assert.equal(errors.length, 0, 'JavaScript del navegador sin errores: ' + errors.join('; '));
    console.log(`INTERFAZ OK: ${forms} renders en móvil/escritorio, 3 enlaces obligatorios y NIP/sin recursos. Red bloqueada.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
