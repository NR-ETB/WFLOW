// Prueba de navegador con iframe aislado. Todas las solicitudes son simuladas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { fields } = require('./plantilla_segundo_nivel');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'Ningun Servicio Funciona - 3.json'), 'utf8'));
const form = workflow.nodes.find(node => node.name === 'Form Escalar Segundo Nivel');
const row = { workflow_session: 'f0-browser-template', usuario_asesor: 'asesor-ficticio', pqr: 'PQR-FICTICIA',
  contexto_etapa_1: { bloqueado: 'No' }, contexto_etapa_2: { suma_ok: 'PospagoConRecursos' } };
const html = new Function('$json', '$execution', '$', form.parameters.jsCode)({ query: {
  workflow_session: row.workflow_session, tipo_falla_equipo: 'SMS',
} }, { resumeUrl: 'https://n8n.test/webhook-waiting/template', id: 'browser-template' },
() => ({ first: () => ({ json: row }) }))[0].json.html_response;
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const errors = [], requests = [];
    await context.route('**/*', async route => {
      const request = route.request();
      if (request.url() !== 'https://n8n.test/webhook-waiting/template') return route.abort();
      requests.push(request);
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>POST recibido</h1>' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function mount() {
      await page.setContent('<iframe id="flow" sandbox="allow-forms allow-scripts" style="width:100%;height:2200px;border:0"></iframe>');
      await page.locator('#flow').evaluate((element, content) => { element.srcdoc = content; }, html);
      const frame = page.frameLocator('#flow');
      await frame.locator('#template-usuario').waitFor();
      await frame.locator('#f').evaluate(form => new Promise(resolve => {
        if (document.readyState !== 'loading') resolve();
        else document.addEventListener('DOMContentLoaded', resolve, { once: true });
      }));
      return frame;
    }
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      let frame = await mount();
      assert.equal(await frame.locator('#template-usuario').inputValue(), 'asesor-ficticio');
      assert.equal(await frame.locator('#template-tipo_falla').inputValue(), 'Falla en SMS');
      assert.equal(await frame.locator('#template-bloqueo').inputValue(), 'No está bloqueado');
      assert.equal(await frame.locator('#template-linea').inputValue(), '');
      assert.equal(await frame.locator('#template-charging').inputValue(), '');
      const before = requests.length;
      await frame.locator('#copyEscalationTemplate').click();
      assert.ok((await frame.locator('#copyTemplateStatus').innerText()).includes('pendientes'));
      await frame.locator('#submitBtn').click();
      assert.equal(requests.length, before);
      for (const [key] of fields) if (!(await frame.locator('#template-' + key).inputValue()).trim()) {
        await frame.locator('#template-' + key).fill(key === 'imei' ? '000000000000001' : 'Dato ficticio ' + key);
      }
      await frame.locator('#template-nombre').fill('Cliente ficticio <seguro>');
      assert.ok((await frame.locator('#escalationTemplateText').innerText()).includes('NOMBRE: Cliente ficticio <seguro>'));
      await frame.locator('#f').evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.copiedTemplate = text; return Promise.resolve(); } } });
      });
      await frame.locator('#copyEscalationTemplate').click();
      assert.ok((await frame.locator('#copyTemplateStatus').innerText()).includes('Plantilla copiada'));
      assert.equal(await frame.locator('#f').evaluate(() => window.copiedTemplate), await frame.locator('#escalationTemplateText').innerText());
      await frame.locator('#template-contacto').fill('000987');
      assert.equal(await frame.locator('#copyTemplateStatus').innerText(), '');
      await frame.locator('#copyEscalationTemplate').click();
      assert.ok((await frame.locator('#f').evaluate(() => window.copiedTemplate)).includes('CONTACTO: 000987'));
      await frame.locator('#f').evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Clipboard bloqueado')) } });
        document.execCommand = () => false;
      });
      await frame.locator('#copyEscalationTemplate').click();
      await frame.locator('#copyTemplateStatus').filter({ hasText: 'Copia manualmente' }).waitFor();
      assert.ok((await frame.locator('#f').evaluate(() => window.getSelection().toString())).includes('USUARIO: asesor-ficticio'));
      assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      fs.mkdirSync(path.join(root, 'preview', 'qa-plantilla'), { recursive: true });
      await frame.locator('input[name="escalamiento_segundo_nivel"]').evaluate(input => { input.checked = true; });
      await frame.locator('#submitBtn').click();
      try { await frame.locator('h1').filter({ hasText: 'POST recibido' }).waitFor({ timeout: 5000 }); }
      catch (error) {
        console.error({ errors, requests: requests.map(r => [r.url(), r.method()]), frames: page.frames().map(f => f.url()),
          body: await frame.locator('body').innerText().catch(() => null),
          state: await frame.locator('#f').evaluate(form => ({ action: form.action, method: form.method, fields: Array.from(new FormData(form)), error: document.getElementById('errBanner').textContent })).catch(() => null) });
        throw error;
      }
      const sent = requests.at(-1);
      assert.equal(sent.method(), 'POST');
      assert.equal(new URL(sent.url()).search, '');
      const payload = new URLSearchParams(sent.postData());
      assert.equal(payload.get('segundo_nivel_imei'), '000000000000001');
      assert.equal(payload.get('segundo_nivel_nombre'), 'Cliente ficticio <seguro>');
      assert.equal(payload.get('__workflow_session'), row.workflow_session);
      frame = await mount();
      await frame.locator('#template-nombre').fill('No debe viajar por GET');
      await frame.locator('button[name="__back"]').click();
      await frame.locator('h1').filter({ hasText: 'POST recibido' }).waitFor();
      const back = new URLSearchParams(requests.at(-1).postData());
      assert.equal(back.get('__back'), '1');
      assert.equal(back.get('segundo_nivel_nombre'), null);
    }
    // Capturas de la pantalla completa, sin el recorte del contenedor de prueba.
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(html);
      for (const [key] of fields) if (!(await page.locator('#template-' + key).inputValue()).trim()) {
        await page.locator('#template-' + key).fill(key === 'imei' ? '000000000000001' : 'Dato ficticio ' + key);
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(root, 'preview', 'qa-plantilla', 'plantilla-' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('INTERFAZ PLANTILLA OK: móvil/escritorio, iframe aislado, autocompletado, edición en vivo, copia, alternativa manual y POST.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
