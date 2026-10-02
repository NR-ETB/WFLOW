const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'Ningun Servicio Funciona - 2.json'), 'utf8'));
const nodes = new Map(workflow.nodes.map(node => [node.name, node]));
const execution = { id: 'prueba-local', mode: 'production', resumeUrl: 'https://n8n.example.test/base/webhook-waiting/consumido' };
const session = '1790712799332-cqs3hgrfcoj';
const prepare = json => new Function('$json', '$execution', nodes.get('Preparar Registro Etapa 2 SQL').parameters.jsCode)(json, execution)[0].json;
const decodeHtml = text => text.replace(/&(amp|quot|lt|gt|#39);/g, (_, entity) => ({ amp: '&', quot: '"', lt: '<', gt: '>', '#39': "'" })[entity]);
function render(name, query) {
  return new Function('$json', '$execution', nodes.get(name).parameters.jsCode)({
    query,
    webhookUrl: 'https://n8n.example.test/base/webhook/etb-form-parte-2-continuar',
  }, execution)[0].json.html_response;
}
function submitted(html, field, value) {
  const data = {};
  for (const match of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) {
    data[decodeHtml(match[1])] = decodeHtml(match[2]);
  }
  data[field] = value;
  return data;
}
const scenarios = [
  ['Form Confirmar Funcionalidad Post QR', 'servicio_post_qr', { qr_estado: 'Instalado' }, 'servicio_normalizado_qr'],
  ['Form Confirmar Funcionalidad Post QR', 'servicio_post_qr', { qr_estado: 'Menos24' }, 'servicio_normalizado_qr'],
  ['Form Escalar Gestor QR', 'gestor_qr_ok', { qr_estado: 'Cumplidas24' }, 'gestor_qr_vencido'],
  ['Form Escalar Gestor NIP', 'gestor_nip_ok', { nip_estado: 'Vencido' }, 'gestor_nip_vencido'],
  ['Form Escalar CRM BAM', 'crm_bam_ok', { nip_estado: 'Recibido' }, 'escalado_crm_bam'],
  ['Form Escalar CRM BAM', 'crm_bam_ok', { nip_estado: 'Pendiente' }, 'escalado_crm_bam'],
  ['Form Cierre Sin Recursos', 'cierre_sin_recursos_ok', { suma_ok: 'PrepagoSinRecursos' }, 'no_aplica_sin_recursos'],
];
for (const [name, field, answers, outcome] of scenarios) {
  const html = render(name, { workflow_session: session, tipo_sim: 'eSIM', ...answers });
  const query = submitted(html, field, 'Si');
  assert.equal(query.workflow_session, undefined, 'La prueba debe usar el contrato real del navegador');
  assert.equal(query.__workflow_session, session);
  const row = prepare({ query });
  assert.equal(row.workflow_session, session, `${name} pierde sesión`);
  assert.equal(row.resultado_etapa_2, outcome);
  assert.equal(row.next_step, 'fin_etapa_2');
  const paramsExpression = nodes.get('Guardar Etapa 2 MySQL').parameters.options.queryReplacement;
  const params = new Function('$json', 'return ' + paramsExpression.slice(3, -2).trim())(row);
  assert.equal(params.length, 14);
  assert.equal(params[0], session);
  assert.ok(params.every(value => value !== undefined && value !== ''), 'Parámetros obligatorios completos');
  assert.deepEqual(JSON.parse(params[12]), JSON.parse(row.respuestas_json));
  assert.deepEqual(JSON.parse(params[13]), JSON.parse(row.contexto_json));
}
for (const suma of ['PospagoConRecursos', 'PrepagoConRecursos']) {
  const row = prepare({ query: { __workflow_session: session, tipo_sim: 'Fisica', suma_ok: suma } });
  assert.equal(row.workflow_session, session);
  assert.equal(row.resultado_etapa_2, 'continuar_parte_3');
}

// Se ejecuta el JS del formulario: éxito, error HTTP, HTML inesperado y red.
async function testClient(status, body, rejects = false, selected = 'Si') {
  const html = render('Form Confirmar Funcionalidad Post QR', { workflow_session: session, tipo_sim: 'eSIM', qr_estado: 'Instalado' });
  const query = submitted(html, 'servicio_post_qr', selected);
  const listeners = {};
  const windowListeners = {};
  const card = { innerHTML: '' };
  const label = { textContent: '', innerHTML: '' };
  const button = { disabled: false, setAttribute() {}, querySelector() { return label; } };
  const error = { textContent: '', style: {}, classList: { add() {}, remove() {} } };
  const form = {
    action: execution.resumeUrl,
    dataset: { field: 'servicio_post_qr' },
    querySelectorAll(selector) {
      if (selector === 'input[type=radio]') return [{ name: 'servicio_post_qr', addEventListener() {} }];
      return [];
    },
    addEventListener(type, listener) { listeners[type] = listener; },
  };
  let requested = '';
  const context = {
    document: {
      getElementById(id) { return ({ f: form, errBanner: error, submitBtn: button })[id] || null; },
      querySelector() { return card; },
    },
    window: { location: { href: '' }, addEventListener(type, listener) { windowListeners[type] = listener; } },
    FormData: class { constructor() { return new Map(Object.entries(query)); } },
    URLSearchParams,
    fetch(url) {
      requested = url;
      return rejects ? Promise.reject(new Error('Network')) : Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(body) });
    },
  };
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInNewContext(match[1], context);
  button.disabled = true;
  label.textContent = 'Enviando';
  windowListeners.pageshow({ persisted: true });
  assert.equal(button.disabled, false, 'Volver no debe conservar el botón bloqueado');
  assert.equal(label.textContent, 'Continuar');
  let prevented = false;
  listeners.submit({ preventDefault() { prevented = true; }, submitter: { name: '' } });
  await new Promise(resolve => setImmediate(resolve));
  if (selected === 'No') {
    assert.equal(prevented, false);
    assert.equal(requested, '');
    assert.equal(form.action, execution.resumeUrl, 'La falla debe continuar soporte eSIM');
    return;
  }
  assert.ok(prevented);
  assert.ok(requested.startsWith('https://n8n.example.test/base/webhook/etb-form-parte-2-continuar?'));
  assert.equal(new URL(requested).searchParams.get('__workflow_session'), session);
  if (status === 200 && body === 'OK' && !rejects) {
    assert.ok(card.innerHTML.includes('Gestión finalizada'));
  } else {
    assert.equal(card.innerHTML, '', 'Nunca mostrar éxito sin guardar');
    assert.equal(button.disabled, false, 'Debe permitir reintentar');
    assert.ok(error.textContent.includes('Tus respuestas siguen'));
    assert.ok(!error.textContent.includes('n8n'));
  }
}

async function main() {
  await testClient(200, 'OK');
  await testClient(500, 'Error SQL');
  await testClient(200, '<html>Contexto no válido</html>');
  await testClient(200, '', true);
  await testClient(200, 'OK', false, 'No');
  const row = prepare({ query: { __workflow_session: session, tipo_sim: 'eSIM', servicio_post_qr: 'Si' } });
  const lookup = name => ({ first: () => ({ json: name === 'Preparar Registro Etapa 2 SQL' ? row : { workflow_session: session, public_base: 'https://n8n.example.test/base' } }) });
  const error = new Function('$json', '$execution', '$', nodes.get('HTML Error Persistencia Etapa 2').parameters.jsCode)({ message: 'ER_BAD_NULL_ERROR' }, execution, lookup)[0].json;
  assert.ok(!error.html_response.includes('MySQL'));
  assert.ok(!error.html_response.includes('CRM.GestionesFlujosLog'));
  assert.ok(!error.html_response.includes('n8n para'));
  assert.ok(error.html_response.includes('Reintentar guardado'));
  assert.ok(!error.html_response.includes('/webhook-waiting/'));
  const retryUrl = decodeHtml(error.html_response.match(/href="([^"]+)"/)[1]);
  assert.equal(new URL(retryUrl).searchParams.get('workflow_session'), session);
  assert.equal(new URL(retryUrl).searchParams.get('servicio_post_qr'), 'Si');
  assert.equal(error.persistence_diagnostic.message, 'ER_BAD_NULL_ERROR');
  console.log('OK: 7 cierres con campos HTML reales, 2 continuidades SUMA, 5 casos frontend y recuperación segura.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
