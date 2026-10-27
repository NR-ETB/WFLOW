// Navegador local con iframe aislado y respuestas simuladas. Nunca llama a SUMA/n8n.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'Ningun Servicio Funciona - 2.json'), 'utf8'));
const initial = JSON.parse(fs.readFileSync(path.join(root, 'Flujo 0 - Registro Inicial.json'), 'utf8'));
const nodes = new Map(workflow.nodes.map(n => [n.name, n]));
const output = path.join(root, 'preview', 'qa-qr');
fs.mkdirSync(output, { recursive: true });
const steps = { post: 'Form Confirmar Funcionalidad Post QR', premisas: 'Form Premisas SIM Virtual',
  reenvio: 'Form Reenvio QR SUMA', renovacion: 'Form Escalar Gestor QR', soporte: 'Form Linea Portada', suma: 'Form Validar SUMA' };
function render(step, query) {
  return new Function('$json', '$execution', nodes.get(steps[step]).parameters.jsCode)({ query,
    webhookUrl: 'https://n8n.test/prefix/webhook/etb-form-parte-2-continuar' }, {
    id: 'qa-qr', mode: 'production', resumeUrl: 'https://n8n.test/prefix/webhook-waiting/' + step,
  })[0].json.html_response;
}
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const errors = [];
    let requests = 0;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://n8n.test') return route.abort();
      requests++;
      const query = Object.fromEntries(url.searchParams);
      const step = url.pathname.split('/').at(-1);
      let html;
      if (step === 'post') html = render('premisas', query);
      else if (step === 'premisas') html = render(query.qr_premisas_ok === 'Si' ? 'soporte' : 'reenvio', query);
      else if (step === 'reenvio') html = render(query.qr_reenvio_ok === 'Si' ? 'soporte' : 'renovacion', query);
      else if (step === 'etb-form-parte-2-continuar') {
        if (query.gestor_qr_ok === 'Si') return route.fulfill({ status: 200, contentType: 'text/plain',
          headers: { 'Access-Control-Allow-Origin': '*' }, body: 'OK' });
        html = new Function('$json', '$execution', nodes.get('Form Cierre Sin Recursos').parameters.jsCode)({ query, webhookUrl: url.origin + url.pathname },
          { id: 'qa-cierre', resumeUrl: url.origin + url.pathname })[0].json.html_response;
      } else if (step === 'etb-form-inicial') {
        assert.equal(url.search, '');
        html = new Function('$json', '$execution', initial.nodes.find(n => n.name === 'Formulario Inicial').parameters.jsCode)(
          { webhookUrl: url.href }, { id: 'qr-nueva' })[0].json.html_response;
      } else return route.abort();
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const base = { __workflow_session: 'f0-qa-qr', tipo_sim: 'eSIM', qr_estado: 'Menos24', servicio_post_qr: 'No' };
    async function mount(step, query = base) {
      await page.setContent('<main id="host"></main>');
      await page.evaluate(html => {
        const iframe = document.createElement('iframe');
        iframe.id = 'workflow';
        iframe.style = 'width:100%;height:1500px;border:0';
        iframe.setAttribute('sandbox', 'allow-forms allow-scripts allow-top-navigation-by-user-activation');
        iframe.srcdoc = html;
        document.getElementById('host').appendChild(iframe);
      }, render(step, query));
      const frame = page.frameLocator('#workflow');
      await frame.locator('#f').waitFor();
      await frame.locator('#f').evaluate(() => new Promise(resolve => {
        if (document.readyState !== 'loading') resolve();
        else document.addEventListener('DOMContentLoaded', resolve, { once: true });
      }));
      return frame;
    }
    async function answer(frame, field, value) {
      await frame.locator(`input[name="${field}"][value="${value}"]`).evaluate(element => { element.checked = true; });
      await frame.locator('#submitBtn').click();
    }
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      let frame = await mount('post');
      await answer(frame, 'servicio_post_qr', 'No');
      try { await frame.locator('.premisas h2').waitFor({ timeout: 5000 }); }
      catch (error) {
        console.error('Diagnóstico local:', JSON.stringify({ requests, errors,
          frames: page.frames().map(f => f.url()),
          form: await frame.locator('#f').evaluate(f => ({ action: f.action, selected: new FormData(f).get('servicio_post_qr'), disabled: document.getElementById('submitBtn').disabled, url: location.href })).catch(() => null),
          content: await frame.locator('body').innerText().catch(() => '') }));
        throw error;
      }
      assert.ok((await frame.locator('.premisas').innerText()).includes('Premisas para la instalación'));
      await frame.locator('.premisas summary').first().click();
      assert.ok((await frame.locator('.premisas').innerText()).includes('Administrador de tarjetas SIM'));
      assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, 'premisas-' + width + '.png'), fullPage: true });
      await answer(frame, 'qr_premisas_ok', 'No');
      await frame.locator('#qrReenvioConfirmado').waitFor();
      const count = requests;
      await answer(frame, 'qr_reenvio_ok', 'No');
      assert.equal(requests, count, 'No navegar sin confirmar el reenvío');
      assert.ok((await frame.locator('#errBanner').innerText()).includes('reenvío manual'));
      assert.equal(await frame.locator('#submitBtn').isDisabled(), false);
      await frame.locator('#qrReenvioConfirmado').check();
      await page.screenshot({ path: path.join(output, 'reenvio-' + width + '.png'), fullPage: true });
      await frame.locator('#submitBtn').click();
      await frame.locator('#copyEscalationTemplate').waitFor({ state: 'attached' });
      await frame.locator('details').first().evaluate(element => { element.open = true; });
      assert.ok((await frame.locator('.card-title').innerText()).includes('Crear trámite de renovación'));
      assert.ok(!(await frame.locator('.card-sub').innerText()).includes('superó las 24'));
      assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, 'renovacion-' + width + '.png'), fullPage: true });
      await answer(frame, 'gestor_qr_ok', 'Si');
      await frame.locator('#newManagementLink').waitFor();
      await frame.locator('#newManagementLink').click();
      await frame.locator('#initialForm').waitFor();
      assert.equal(await frame.locator('input[name="workflow_session"]').inputValue(), 'f0-qr-nueva');
      frame = await mount('premisas');
      await answer(frame, 'qr_premisas_ok', 'Si');
      await frame.locator('input[name="linea_portada"]').first().waitFor();
      frame = await mount('reenvio', { ...base, qr_premisas_ok: 'No' });
      await frame.locator('#qrReenvioConfirmado').check();
      await answer(frame, 'qr_reenvio_ok', 'Si');
      await frame.locator('input[name="linea_portada"]').first().waitFor();
      frame = await mount('suma');
      assert.equal(await frame.locator('input[name="suma_ok"]').count(), 4);
      await page.screenshot({ path: path.join(output, 'suma-' + width + '.png'), fullPage: true });
      await answer(frame, 'suma_ok', 'PospagoSinRecursos');
      await frame.locator('input[name="cierre_sin_recursos_ok"]').waitFor();
      assert.ok((await frame.locator('.card-sub').innerText()).includes('No aplica falla'));
      assert.equal(await frame.locator('input[name="suma_ok"]').inputValue(), 'PospagoSinRecursos');
    }
    assert.deepEqual(errors, []);
    const preview = await context.newPage();
    for (const width of [360, 1366]) {
      await preview.setViewportSize({ width, height: 900 });
      for (const [step, data] of [['premisas', base], ['reenvio', { ...base, qr_premisas_ok: 'No' }],
        ['renovacion', { ...base, qr_premisas_ok: 'No', qr_reenvio_confirmado: 'Si', qr_reenvio_ok: 'No' }], ['suma', base]]) {
        await preview.setContent(render(step, data));
        if (step === 'premisas' || step === 'renovacion') await preview.locator('details').first().evaluate(element => { element.open = true; });
        assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await preview.screenshot({ path: path.join(output, step + '-' + width + '.png'), fullPage: true });
      }
    }
    await preview.close();
    console.log('INTERFAZ QR OK: móvil/escritorio, iframe aislado, premisas, confirmación SUMA, renovación, retorno al flujo 0 y pospago sin recursos. Red simulada.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
