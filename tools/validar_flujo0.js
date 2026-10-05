const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'Flujo 0 - Registro Inicial.json'), 'utf8'));
const nodes = new Map(workflow.nodes.map(node => [node.name, node]));
const execution = { id: 'prueba-001' };
const run = (name, json, reference = () => { throw new Error('Referencia inesperada'); }) => new Function('$json', '$execution', '$', nodes.get(name).parameters.jsCode)(json, execution, reference)[0].json;
assert.equal(nodes.size, workflow.nodes.length);
assert.equal(new Set(workflow.nodes.map(node => node.id)).size, workflow.nodes.length);
assert.equal(workflow.active, false);
for (const node of workflow.nodes) {
  assert.equal(node.credentials, undefined);
  assert.notEqual(node.type, 'n8n-nodes-base.wait');
  if (node.type === 'n8n-nodes-base.code') new Function('$json', '$execution', '$', node.parameters.jsCode);
}
const roots = ['Abrir Flujo 0', 'Recibir Datos Iniciales'];
const reached = new Set();
function visit(name) {
  if (reached.has(name)) return;
  assert.ok(nodes.has(name));
  reached.add(name);
  for (const branch of workflow.connections[name]?.main || []) for (const edge of branch) visit(edge.node);
}
roots.forEach(visit);
assert.equal(reached.size, nodes.size, 'Todos los nodos deben ser alcanzables');
const existingPaths = [1, 2, 3].flatMap(stage => JSON.parse(fs.readFileSync(path.join(root, 'Ningun Servicio Funciona - ' + stage + '.json'), 'utf8')).nodes.filter(node => node.type === 'n8n-nodes-base.webhook').map(node => node.parameters.path));
for (const node of workflow.nodes.filter(node => node.type === 'n8n-nodes-base.webhook')) {
  assert.ok(!existingPaths.includes(node.parameters.path));
  assert.equal(node.parameters.responseMode, 'responseNode');
}
assert.equal(nodes.get('Recibir Datos Iniciales').parameters.httpMethod, 'POST');
const render = webhookUrl => run('Formulario Inicial', { webhookUrl }).html_response;
const html = render('https://n8n.example.test/base/webhook/etb-form-inicial');
assert.ok(html.includes('method="POST"'));
assert.ok(html.includes('action="https://n8n.example.test/base/webhook/etb-form-inicial-guardar"'));
assert.ok(render('https://n8n.example.test/webhook-test/etb-form-inicial').includes('action="https://n8n.example.test/webhook-test/etb-form-inicial-guardar"'));
assert.ok(render('https://n8n.example.test/webhook/etb-form-inicial?usuario_asesor=ignored').includes('value=""'));
const visibleFields = [...html.matchAll(/<input id="([^"]+)"[^>]+>/g)];
assert.deepEqual(visibleFields.map(match => match[1]), ['usuario_asesor', 'numero_conexion', 'pqr']);
visibleFields.forEach(match => assert.ok(match[0].includes(' required')));
const session = html.match(/name="workflow_session" value="([^"]+)"/)[1];
assert.equal(session, 'f0-prueba-001');
const body = { workflow_session: session, usuario_asesor: '  asesor.test  ', numero_conexion: ' 0000123 ', pqr: ' 0000456 ' };
const validate = body => run('Validar Datos Iniciales', { body, webhookUrl: 'https://n8n.example.test/base/webhook/etb-form-inicial-guardar' });
const valid = validate(body);
assert.equal(valid.valido, true);
assert.equal(valid.valores.usuario_asesor, 'asesor.test');
assert.equal(valid.valores.numero_conexion, '0000123');
assert.equal(valid.valores.pqr, '0000456');
for (const field of ['usuario_asesor', 'numero_conexion', 'pqr']) {
  for (const badValue of ['', '   ', null, 123, ['duplicado'], { value: 'objeto' }, 'a'.repeat(101), 'control\u0000']) {
    assert.equal(validate({ ...body, [field]: badValue }).valido, false, field + ': valor inválido aceptado');
  }
  assert.equal(validate({ ...body, [field]: 'a'.repeat(100) }).valido, true);
}
for (const badSession of ['', 'otra-sesion', ['f0-dup'], 'f0-' + 'a'.repeat(73)]) assert.equal(validate({ ...body, workflow_session: badSession }).valido, false);
assert.equal(run('Validar Datos Iniciales', { query: body }).valido, false, 'No aceptar datos desde la URL');
const prepared = run('Preparar Registro Inicial SQL', valid);
assert.equal(prepared.workflow_session, session);
assert.equal(prepared.numero_etapa, 0);
assert.equal(prepared.codigo_flujo, 'inicioGestion');
assert.deepEqual(JSON.parse(prepared.respuestas_json), valid.valores);
const sqlNode = nodes.get('Guardar Registro Inicial MySQL');
assert.equal(sqlNode.onError, 'continueErrorOutput');
assert.equal(sqlNode.parameters.query, 'CALL CRM.RegistrarInicioGestion($1,$2,$3,$4)');
const replacements = new Function('$json', 'return ' + sqlNode.parameters.options.queryReplacement.slice(3, -2).trim())(prepared);
assert.equal(replacements.length, 4);
assert.equal(replacements[0], session);
assert.deepEqual(JSON.parse(replacements[1]), valid.valores);
// Misma conversión numérica usada por el nodo MySQL: el JSON debe resistirla.
const n8nParams = replacements.map(value => Number(value) ? Number(value) : value);
assert.equal(JSON.parse(n8nParams[1]).numero_conexion, '0000123');
assert.equal(JSON.parse(n8nParams[1]).pqr, '0000456');
const reference = name => { assert.equal(name, 'Preparar Registro Inicial SQL'); return { first: () => ({ json: prepared }) }; };
const retry = run('Preparar Reintento Registro', { message: 'SQL_PRIVATE_DETAIL' }, reference);
const retryHtml = run('Formulario Reintento Registro', retry).html_response;
assert.ok(retryHtml.includes('No pudimos confirmar el guardado'));
assert.ok(retryHtml.includes('name="workflow_session" value="' + session + '"'));
assert.ok(retryHtml.includes('value="0000123"'));
assert.ok(!retryHtml.includes('SQL_PRIVATE_DETAIL'));
assert.ok(!retryHtml.includes('Datos iniciales guardados'));
assert.equal(nodes.get('Mostrar Reintento Registro').parameters.options.responseCode, 503);
const invalidHtml = run('Formulario Datos Invalidos', validate({ ...body, pqr: '' })).html_response;
assert.ok(invalidHtml.includes('value="0000123"'));
assert.equal(nodes.get('Mostrar Datos Invalidos').parameters.options.responseCode, 422);
const payload = '<script>alert("test")</script>';
const dbRow = { registroConfirmado: 1, workflowSession: session, usuarioAsesor: payload, numeroConexion: '0000123', pqr: '0000456' };
const success = run('Confirmar Registro Inicial', { data: [[dbRow], { affectedRows: 1 }] }, reference).html_response;
assert.ok(success.includes('Datos iniciales guardados'));
assert.ok(!success.includes(payload));
assert.ok(success.includes('&lt;script&gt;'));
for (const result of [{ success: true }, { data: [[{ ...dbRow, workflowSession: 'otra-sesion' }]] }]) {
  assert.throws(() => run('Confirmar Registro Inicial', result, reference), /confirmacion/);
}
const canonical = run('Confirmar Registro Inicial', { data: [[{ ...dbRow, usuarioAsesor: 'asesor.original', numeroConexion: '0000999' }]] }, reference).html_response;
assert.ok(canonical.includes('asesor.original') && canonical.includes('0000999'), 'Mostrar datos originales confirmados, no datos modificados del reintento');
assert.deepEqual(workflow.connections['Guardar Registro Inicial MySQL'].main[0].map(edge => edge.node), ['Confirmar Registro Inicial']);
assert.deepEqual(workflow.connections['Guardar Registro Inicial MySQL'].main[1].map(edge => edge.node), ['Preparar Reintento Registro']);
assert.equal(nodes.get('Confirmar Registro Inicial').onError, 'continueErrorOutput');
assert.deepEqual(workflow.connections['Confirmar Registro Inicial'].main[1].map(edge => edge.node), ['Preparar Reintento Registro']);
// Ejecutar la validación de pantalla y comprobar el retorno del navegador.
const listeners = {};
const windowListeners = {};
const field = value => ({ value, focus() {} });
const elements = { usuario_asesor: field('   '), numero_conexion: field('0000123'), pqr: field('0000456') };
const form = { elements, addEventListener(type, listener) { listeners[type] = listener; }, reportValidity() { return true; }, getAttribute() { return 'https://n8n.example.test/webhook/etb-form-inicial-guardar'; } };
const button = { disabled: false, textContent: '' };
const error = { hidden: true, textContent: '' };
vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
  document: { getElementById(id) { return { initialForm: form, submit: button, error }[id]; } },
  window: { addEventListener(type, listener) { windowListeners[type] = listener; } },
});
let prevented = false;
listeners.submit({ preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(button.disabled, false);
elements.usuario_asesor.value = ' asesor.test ';
prevented = false;
listeners.submit({ preventDefault() { prevented = true; } });
assert.equal(prevented, false);
assert.equal(button.disabled, true);
assert.equal(elements.usuario_asesor.value, 'asesor.test');
windowListeners.pageshow();
assert.equal(button.disabled, false);
console.log('VALIDACIÓN FLUJO 0 OK: 15 nodos, 3 campos obligatorios, POST, ceros iniciales, rechazo de datos inválidos, escape HTML y reintento idempotente.');
