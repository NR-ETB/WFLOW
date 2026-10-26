const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'Ningun Servicio Funciona - 1.json'), 'utf8'));
const nodes = new Map(workflow.nodes.map(node => [node.name, node]));
const code = name => nodes.get(name).parameters.jsCode;
const renderClosure = (saved, ack) => new Function('$json', '$', code('HTML Cierre Etapa 1'))(ack,
  () => ({ first: () => ({ json: saved }) }))[0].json.html_response;
let cases = 0;
for (const mode of ['production', 'test']) for (const [name, field, outcome] of [
  ['Form Escalar GESTFAC', 'escalado_ok', 'gestfac'],
  ['Form Escalar Gestor', 'gestor_ok', 'gestor_sincronizacion'],
]) for (const answer of ['Si', 'No']) {
  const execution = { id: 'cierre-local', mode, resumeUrl: 'https://n8n.test/base/webhook-waiting/cierre' };
  const html = new Function('$json', '$execution', code(name))({
    query: { __workflow_session: 'f0-cierre-local' },
  }, execution)[0].json.html_response;
  assert.equal((html.match(new RegExp('type="radio"[^>]*name="' + field + '"', 'g')) || []).length, 1);
  assert.ok(html.includes('action="' + execution.resumeUrl + '"'));
  const query = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(m => [m[1], m[2]]));
  query[field] = answer;
  let listener;
  const button = { setAttribute() {}, querySelector: () => ({ innerHTML: '' }) };
  const error = { classList: { remove() {} }, style: {} };
  const form = { dataset: { field }, addEventListener(type, fn) { if (type === 'submit') listener = fn; },
    querySelectorAll(selector) { return selector === 'input[type=radio]' ? [{ name: field, addEventListener() {} }] : []; } };
  const context = { document: { getElementById: id => ({ f: form, submitBtn: button, errBanner: error })[id] },
    FormData: class { constructor() { return new Map(Object.entries(query)); } },
    fetch() { throw new Error('No debe usar fetch para estos cierres'); } };
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInNewContext(match[1], context);
  let prevented = false;
  listener({ preventDefault() { prevented = true; }, submitter: { name: '' } });
  assert.equal(prevented, false, 'Finalizar debe permitir la navegación normal');
  assert.equal(button.disabled, true);
  const saved = new Function('$json', '$execution', code('Preparar Registro SQL'))({ query }, execution)[0].json;
  assert.equal(saved.resultado_etapa_1, outcome);
  assert.equal(saved.estado_gestion, answer === 'Si' ? 'Escalada' : 'Pendiente');
  const response = renderClosure(saved, { workflow_session: saved.workflow_session, registro_confirmado: 1 });
  assert.ok(response.includes('Iniciar nueva gestión'));
  assert.ok(response.includes('href="https://n8n.test/base/webhook/etb-form-inicial"'));
  assert.ok(response.includes(answer === 'Si' ? 'registrado como enviado' : 'El envío queda pendiente'));
  assert.throws(() => renderClosure(saved, {}), /no confirmó/);
  assert.throws(() => renderClosure(saved, { workflow_session: 'f0-otra', registro_confirmado: 1 }), /no confirmó/);
  cases++;
}
assert.equal(renderClosure({ workflow_session: 'f0-otro', resultado_etapa_1: 'documentacion_bloqueo' },
  { workflow_session: 'f0-otro', registro_confirmado: 1 }), 'OK', 'Mantener los contratos AJAX de otras salidas');
assert.equal(workflow.connections['IF Continuar Etapa 2'].main[1][0].node, 'HTML Cierre Etapa 1');
assert.equal(workflow.connections['HTML Cierre Etapa 1'].main[0][0].node, 'Responder Cierre Etapa 1');
assert.equal(nodes.get('Responder Cierre Etapa 1').parameters.responseBody, '={{ $json.html_response }}');
console.log(`CIERRE ETAPA 1 OK: ${cases} casos GESTFAC/sincronización, navegación normal, confirmación y estado pendiente.`);
