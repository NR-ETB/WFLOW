const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const load = stage => JSON.parse(fs.readFileSync(path.join(__dirname, '..', `Ningun Servicio Funciona - ${stage}.json`), 'utf8'));
const w1 = load(1), w2 = load(2);
const get = (w, name) => w.nodes.find(n => n.name === name);
const runtime = { id: 'unificado-local', mode: 'production', resumeUrl: 'https://n8n.test/base/webhook-waiting/unificado' };
const run = (w, name, query) => new Function('$json', '$execution', get(w, name).parameters.jsCode)({ query }, runtime)[0].json;
function advance(w, start, data) {
  let query = { ...data }, current = start;
  const visited = [];
  for (let i = 0; i < 25; i++) {
    visited.push(current);
    if (current.startsWith('Form ') || current.startsWith('Preparar Registro')) return { current, query, visited };
    const node = get(w, current);
    let branch = 0;
    if (node.type === 'n8n-nodes-base.if') {
      const conditions = node.parameters.conditions;
      const results = conditions.conditions.map(c => new Function('$json', 'return ' + c.leftValue.slice(3, -2).trim())({ query }) === c.rightValue);
      branch = (conditions.combinator === 'or' ? results.some(Boolean) : results.every(Boolean)) ? 0 : 1;
    } else if (node.type === 'n8n-nodes-base.code') query = run(w, current, query).query;
    current = w.connections[current].main[branch][0].node;
  }
  throw new Error('Posible bucle');
}
const html = run(w1, 'Form Verificar Linea', { __workflow_session: 'f0-unificado', pago_al_dia: 'No' }).html_response;
assert.equal((html.match(/type="radio"[^>]*name="linea_activa"/g) || []).length, 2);
assert.equal((html.match(/type="radio"[^>]*name="pago_al_dia"/g) || []).length, 2);
assert.ok(!html.includes('type="hidden" name="pago_al_dia"'));
for (const missing of ['linea_activa', 'pago_al_dia']) {
  let listener, prevented = false;
  const selected = { linea_activa: 'Si', pago_al_dia: 'Si' }; delete selected[missing];
  const form = { dataset: {}, addEventListener(type, fn) { if (type === 'submit') listener = fn; },
    querySelectorAll(selector) { return selector === 'input[type=radio]' ? ['linea_activa','pago_al_dia'].map(name => ({ name, addEventListener() {} })) : []; } };
  const error = { style: {}, classList: { add() {}, remove() {} } };
  const context = { document: { getElementById: id => ({ f: form, submitBtn: {}, errBanner: error })[id] },
    FormData: class { constructor() { return new Map(Object.entries(selected)); } } };
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInNewContext(script[1], context);
  listener({ preventDefault() { prevented = true; }, submitter: {} });
  assert.equal(prevented, true, 'No enviar sin completar ' + missing);
}
for (const [line, payment, target] of [['Si','Si','Form Validar Cobertura y Viaje'], ['Si','No','Form Saldo Pendiente'],
  ['No','Si','Form Escalar GESTFAC'], ['No','No','Form Saldo Pendiente']]) {
  const result = advance(w1, 'Espera Verificar Linea', { __workflow_session: 'f0-unificado', linea_activa: line, pago_al_dia: payment });
  assert.equal(result.current, target);
  if (target === 'Form Escalar GESTFAC') assert.equal(result.query.pago_confirmado_cliente, 'Si');
}
const paid = advance(w1, 'IF Volver Saldo Pendiente', { __workflow_session: 'f0-unificado', linea_activa: 'No', pago_al_dia: 'No',
  pago_pendiente_informado: 'PagoRealizado', __outcome: 'pago_pendiente', __next_step: 'fin_etapa_1' });
assert.equal(paid.current, 'Form Escalar GESTFAC');
assert.equal(paid.query.__outcome, undefined);
assert.equal(paid.query.pago_confirmado_cliente, 'Si');
const pending = advance(w1, 'IF Volver Saldo Pendiente', { pago_pendiente_informado: 'Si' });
assert.equal(pending.current, 'Preparar Registro SQL');
assert.equal(advance(w1, 'IF Volver Saldo Pendiente', { __back: '1' }).current, 'Form Verificar Linea');
assert.equal(advance(w1, 'IF Volver Validar Cobertura y Viaje', {}).current, 'Form Validar ICCID');
for (const name of ['Form Confirmar Pago','Enviar Confirmar Pago','Espera Confirmar Pago','IF Volver Confirmar Pago']) assert.ok(!get(w1, name));
const installed = advance(w2, 'IF Volver Gestionar QR', { qr_estado: 'Instalado' });
assert.equal(installed.current, 'Form Linea Portada');
assert.ok(!installed.visited.includes('Form Confirmar Funcionalidad Post QR'));
assert.ok(!installed.visited.includes('Form Premisas SIM Virtual'));
assert.equal(advance(w2, 'IF Volver Gestionar QR', { qr_estado: 'Menos24' }).current, 'Form Confirmar Funcionalidad Post QR');
assert.equal(advance(w2, 'IF Volver Gestionar QR', { qr_estado: 'Cumplidas24' }).current, 'Form Escalar Gestor QR');
console.log('LÍNEA/PAGOS/QR OK: campos obligatorios, cuatro combinaciones, pago reportado a GESTFAC, retornos y eSIM instalada directa a soporte.');
