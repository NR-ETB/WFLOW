// Regresión del CRM: dos orígenes, iframe contenedor y sandbox HTML de n8n.
// Todas las respuestas son locales; no se llama a n8n ni a PostgreSQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const workflows = [0, 1, 2, 3].map(stage => JSON.parse(fs.readFileSync(path.join(root,
  stage ? `Ningun Servicio Funciona - ${stage}.json` : 'Flujo 0 - Registro Inicial.json'), 'utf8')));
const execution = { id: 'iframe-anterior', mode: 'production',
  resumeUrl: 'https://n8n.test/base/webhook-waiting/anterior' };
const session = 'f0-iframe-anterior';
const description = 'Si la línea se encuentra suspendida o cortada por falta de pago, pero el cliente confirma que ya realizó el pago correspondiente, se debe escalar el caso a través de GESTFAC para validar y gestionar la reconexión del servicio.';
function render(stage, name, input, lookup, runtime = execution) {
  const code = workflows[stage].nodes.find(node => node.name === name).parameters.jsCode;
  return new Function('$json', '$execution', '$', code)(input, runtime, lookup)[0].json.html_response;
}
const escAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function wrap(html) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0"><iframe id="n8n-content" ' +
    'style="width:100%;height:95vh;border:0" sandbox="allow-scripts allow-forms allow-popups ' +
    'allow-modals allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" srcdoc="' +
    escAttribute(html) + '"></iframe></body></html>';
}
async function main() {
  const browser = await chromium.launch({ channel: process.env.PREVIEW_BROWSER_CHANNEL || 'msedge', headless: true });
  let restarts = 0;
  let popups = 0;
  const errors = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    page.on('popup', () => { popups++; });
    page.on('pageerror', error => errors.push(error.message));
    let screen;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.href === 'https://crm.test/flujos') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><body><h1 id="crm">CRM</h1>' +
          '<iframe id="workflowPanel" style="width:100%;height:90vh" sandbox="allow-scripts allow-forms allow-popups" ' +
          'src="https://n8n.test/base/webhook/qa-cierre"></iframe></body></html>' });
      }
      if (url.href === 'https://n8n.test/base/webhook/qa-cierre') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: wrap(screen) });
      }
      if (url.pathname === '/base/webhook/etb-form-inicial') {
        assert.equal(url.origin, 'https://n8n.test');
        assert.equal(url.search, '', 'No reenviar los datos ni la sesión anterior');
        assert.equal(url.hash, '');
        restarts++;
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: wrap(render(0, 'Formulario Inicial',
          { webhookUrl: url.href }, undefined, { id: 'nueva-' + restarts })) });
      }
      if (url.pathname === '/base/webhook/etb-form-parte-2-continuar' || url.pathname.includes('/webhook-waiting/')) {
        return route.fulfill({ contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'OK' });
      }
      return route.abort();
    });
    const input = { query: { workflow_session: session, tipo_sim: 'eSIM', qr_estado: 'Instalado' },
      webhookUrl: 'https://n8n.test/base/webhook/etb-form-parte-2-continuar' };
    const saved = { workflow_session: session, handoff_url: 'https://n8n.test/base/webhook/etb-form-parte-2' };
    const screens = [
      ...[[1, 'Form Enviar Doc'], [2, 'Form Confirmar Funcionalidad Post QR'], [2, 'Form Cierre Sin Recursos']]
        .map(([stage, name]) => ({ name, html: render(stage, name, input), submit: true })),
      ...['gestfac', 'gestor_sincronizacion', 'pago_pendiente'].map(outcome => ({ name: outcome,
        html: render(1, 'HTML Cierre Etapa 1', { workflow_session: session, registro_confirmado: 1 },
          () => ({ first: () => ({ json: { ...saved, resultado_etapa_1: outcome, escalado_ok: 'Si', gestor_ok: 'Si' } }) })) })),
      { name: 'Cierre con observaciones', html: render(3, 'HTML Cierre Definitivo', {},
        name => ({ item: { json: name === 'Consultar Resumen Gestion Actual' ? { resultado_etapa_3: 'escalado_segundo_nivel' } :
          { workflow_session: session, observaciones_asesor: 'Se escaló para revisión técnica.' } } })) },
    ];
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      for (const item of screens) {
        screen = item.html;
        await page.goto('https://crm.test/flujos');
        const content = page.frameLocator('#workflowPanel').frameLocator('#n8n-content');
        if (item.submit) {
          const optionId = await content.locator('input[type=radio]').first().getAttribute('id');
          await content.locator(`label[for="${optionId}"]`).click();
          await content.locator('#submitBtn').click();
        }
        await content.locator('#newManagementLink').waitFor();
        const before = restarts;
        await content.locator('#newManagementLink').click();
        const initial = content.frameLocator('#n8n-content');
        await initial.locator('#initialForm').waitFor({ timeout: 3000 });
        assert.equal(restarts, before + 1, item.name + ': un clic crea una sola gestión');
        assert.equal(page.url(), 'https://crm.test/flujos', 'Conservar el CRM');
        assert.equal(await page.locator('#crm').innerText(), 'CRM');
        assert.equal(await initial.locator('input[name="workflow_session"]').inputValue(), 'f0-nueva-' + restarts);
        for (const field of ['usuario_asesor', 'numero_conexion', 'pqr']) {
          assert.equal(await initial.locator('#' + field).inputValue(), '');
        }
      }
      screen = render(1, 'Form Escalar GESTFAC', input);
      await page.goto('https://crm.test/flujos');
      const content = page.frameLocator('#workflowPanel').frameLocator('#n8n-content');
      assert.equal(await content.locator('.card-sub').innerText(), description);
      assert.equal(await content.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const output = path.join(root, 'preview', 'qa-reinicio-iframe');
      fs.mkdirSync(output, { recursive: true });
      await page.screenshot({ path: path.join(output, 'gestfac-' + width + '.png'), fullPage: true });
    }
    assert.equal(popups, 0, 'Conservar una sola pestaña');
    assert.deepEqual(errors, []);
    console.log(`REINICIO IFRAME OK: ${restarts} reinicios desde cierres reales, CRM conservado, sesiones nuevas, campos vacíos y descripción GESTFAC en móvil/escritorio.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
