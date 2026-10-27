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
    for (const [name, field] of [['Form Escalar GESTFAC', 'escalado_ok'], ['Form Escalar Gestor', 'gestor_ok']]) {
      await page.setContent(render(1, name, input));
      assert.equal(await page.locator(`input[name="${field}"]`).count(), 1);
      assert.equal(await page.locator(`input[name="${field}"][value="No"]`).count(), 0);
    }
    await page.setContent(render(1, 'Form Consultar Registro IMEI', input));
    assert.equal(await page.locator('#imeiPublicLink').getAttribute('href'), 'https://www.imeicolombia.com.co/');
    // Respuestas simuladas: ninguna solicitud sale al servidor real.
    let newExecutions = 0;
    let popups = 0;
    page.on('popup', () => { popups++; });
    await page.route('https://n8n.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/webhook/etb-form-inicial') {
        assert.equal(url.search, '', 'No transmitir la sesión cerrada');
        newExecutions++;
        const html = new Function('$json', '$execution', workflows[0].nodes.find(n => n.name === 'Formulario Inicial').parameters.jsCode)(
          { webhookUrl: url.href }, { id: 'nueva-' + newExecutions })[0].json.html_response;
        await route.fulfill({ status: 200, contentType: 'text/html', body: html });
      } else if (url.pathname.includes('/webhook-waiting/') || url.pathname === '/webhook/etb-form-parte-2-continuar') {
        if (url.searchParams.get('qr_estado') === 'Instalado' && !url.searchParams.has('servicio_post_qr') && !url.searchParams.has('__outcome')) {
          await route.fulfill({ status: 200, contentType: 'text/html', body: render(2, 'Form Linea Portada', { ...input, query: Object.fromEntries(url.searchParams) }) });
        } else if (url.searchParams.get('pago_pendiente_informado') === 'PagoRealizado' && !url.searchParams.has('escalado_ok')) {
          const marked = new Function('$json', workflows[1].nodes.find(n => n.name === 'Marcar Pago Reportado Cliente').parameters.jsCode)(
            { query: Object.fromEntries(url.searchParams) })[0].json;
          await route.fulfill({ status: 200, contentType: 'text/html', body: render(1, 'Form Escalar GESTFAC', marked) });
        } else if (url.searchParams.get('pago_al_dia') === 'No' && !url.searchParams.has('pago_pendiente_informado')) {
          await route.fulfill({ status: 200, contentType: 'text/html', body: render(1, 'Form Saldo Pendiente', {
            ...input, query: Object.fromEntries(url.searchParams),
          }) });
        } else if (url.searchParams.has('escalado_ok') || url.searchParams.has('gestor_ok') || url.searchParams.has('pago_pendiente_informado')) {
          const saved = new Function('$json', '$execution', workflows[1].nodes.find(n => n.name === 'Preparar Registro SQL').parameters.jsCode)(
            { query: Object.fromEntries(url.searchParams) }, execution)[0].json;
          const html = new Function('$json', '$', workflows[1].nodes.find(n => n.name === 'HTML Cierre Etapa 1').parameters.jsCode)(
            { workflow_session: saved.workflow_session, registro_confirmado: 1 },
            () => ({ first: () => ({ json: saved }) }))[0].json.html_response;
          await route.fulfill({ status: 200, contentType: 'text/html', body: html });
        } else await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'OK' });
      } else await route.abort();
    });
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      for (const [stage, name] of [[1, 'Form Escalar GESTFAC'], [1, 'Form Escalar Gestor'], [1, 'Form Enviar Doc'],
        [2, 'Form Escalar Gestor NIP'], [2, 'Form Cierre Sin Recursos']]) {
        await page.setContent(render(stage, name, { ...input,
          webhookUrl: 'https://n8n.test/webhook/etb-form-parte-2-continuar' }));
        await page.locator('input[type=radio]').first().evaluate(element => { element.checked = true; });
        await page.locator('#submitBtn').click();
        await page.locator('#newManagementLink').waitFor();
        assert.ok(!(await page.locator('body').innerText()).includes('Test workflow'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('#newManagementForm').getAttribute('target'), '_self');
        const count = newExecutions;
        await page.locator('#newManagementLink').click();
        await page.locator('#initialForm').waitFor();
        assert.equal(newExecutions, count + 1);
        assert.equal(await page.locator('input[name="workflow_session"]').inputValue(), 'f0-nueva-' + newExecutions);
        for (const field of ['usuario_asesor', 'numero_conexion', 'pqr']) {
          assert.equal(await page.locator('#' + field).inputValue(), '');
        }
      }
      await page.setContent(render(1, 'Form Verificar Linea', input));
      await page.locator('input[name="linea_activa"][value="No"]').evaluate(element => { element.checked = true; });
      await page.locator('input[name="pago_al_dia"][value="No"]').evaluate(element => {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert.ok(!(await page.locator('#submitBtn').innerText()).includes('reconectar'));
      await page.locator('#submitBtn').click();
      await page.locator('input[name="pago_pendiente_informado"][value="Si"]').waitFor();
      assert.ok((await page.locator('.card-sub').innerText()).includes('deberá realizar el pago correspondiente'));
      await page.locator('input[name="pago_pendiente_informado"][value="Si"]').evaluate(element => { element.checked = true; });
      await page.locator('#submitBtn').click();
      await page.locator('#newManagementLink').waitFor();
      assert.ok((await page.locator('.copy').innerText()).includes('deberá realizar el pago correspondiente'));
      await page.locator('#newManagementLink').click();
      await page.locator('#initialForm').waitFor();
      await page.setContent(render(1, 'Form Saldo Pendiente', { ...input,
        query: { ...input.query, linea_activa: 'No', pago_al_dia: 'No' } }));
      await page.locator('input[value="PagoRealizado"]').evaluate(element => { element.checked = true; });
      await page.locator('#submitBtn').click();
      await page.locator('input[name="escalado_ok"]').waitFor();
      assert.ok((await page.locator('.card-sub').innerText()).includes('el cliente confirma que ya realizó el pago'));
      await page.locator('input[name="escalado_ok"]').evaluate(element => { element.checked = true; });
      await page.locator('#submitBtn').click();
      await page.locator('#newManagementLink').waitFor();
      assert.ok((await page.locator('.copy').innerText()).includes('registrado como enviado a GESTFAC'));
      await page.locator('#newManagementLink').click();
      await page.locator('#initialForm').waitFor();
      await page.setContent(render(2, 'Form Gestionar QR', input));
      await page.locator('input[value="Instalado"]').evaluate(element => { element.checked = true; });
      await page.locator('#submitBtn').click();
      await page.locator('input[name="linea_portada"]').first().waitFor();
      assert.equal(await page.locator('input[name="servicio_post_qr"], input[name="qr_premisas_ok"]').count(), 0);
    }
    assert.equal(popups, 0, 'El reinicio no abre otra pestaña');
    assert.equal(errors.length, 0, 'JavaScript del navegador sin errores: ' + errors.join('; '));
    const output = path.join(root, 'preview', 'qa-pago-imei');
    fs.mkdirSync(output, { recursive: true });
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, file] of [['Form Verificar Linea', 'linea-pagos'], ['Form Saldo Pendiente', 'saldo'], ['Form Escalar GESTFAC', 'gestfac'],
        ['Form Escalar Gestor', 'sincronizacion'], ['Form Consultar Registro IMEI', 'imei']]) {
        await page.setContent(render(1, name, input));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, file + '-' + width + '.png'), fullPage: true });
      }
    }
    console.log(`INTERFAZ OK: ${forms} renders, 3 enlaces obligatorios y ${newExecutions} reinicios reales en la misma pestaña. Red simulada/bloqueada.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
