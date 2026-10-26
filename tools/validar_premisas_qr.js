const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'Ningun Servicio Funciona - 2.json'), 'utf8'));
const nodes = new Map(workflow.nodes.map(n => [n.name, n]));
const execution = { id: 'qr-local', mode: 'production', resumeUrl: 'https://n8n.test/prefix/webhook-waiting/qr-local' };
const run = (name, query) => new Function('$json', '$execution', nodes.get(name).parameters.jsCode)({ query }, execution)[0].json;
const query = { __workflow_session: 'f0-qr-local', tipo_sim: 'eSIM', qr_estado: 'Menos24', servicio_post_qr: 'No' };
const premises = run('Form Premisas SIM Virtual', query).html_response;
for (const text of ['teléfono móvil compatible', 'red Wi-Fi', 'código QR', 'Android', 'Configuración', 'Conexiones',
  'Administrador de tarjetas SIM', 'Agregar plan móvil', 'añadirlo y utilizarlo', 'iPhone', 'Datos celulares',
  'Agregar plan de datos móviles', 'perfil eSIM activo', 'línea y el plan habilitado', 'Reiniciar el dispositivo',
  'actualizaciones del sistema operativo', 'SÍ FUNCIONA', 'NO FUNCIONA']) assert.ok(premises.includes(text), text);
function next(name, data) {
  const spec = nodes.get(name).parameters.conditions;
  const checks = spec.conditions.map(c => new Function('$json', 'return ' + c.leftValue.slice(3, -2).trim())({ query: data }) === c.rightValue);
  const ok = spec.combinator === 'or' ? checks.some(Boolean) : checks.every(Boolean);
  return workflow.connections[name].main[ok ? 0 : 1][0].node;
}
assert.equal(next('IF Servicio Post QR Funciona', { servicio_post_qr: 'Si' }), 'Marcar Cierre Servicio Post QR');
assert.equal(next('IF Servicio Post QR Funciona', query), 'Form Premisas SIM Virtual');
assert.equal(next('IF QR Funciona Tras Premisas', { qr_premisas_ok: 'Si' }), 'Form Linea Portada');
assert.equal(next('IF QR Funciona Tras Premisas', { qr_premisas_ok: 'No' }), 'Form Reenvio QR SUMA');
assert.equal(next('IF Reenvio QR Confirmado', {}), 'Form Reenvio QR SUMA');
assert.equal(next('IF Reenvio QR Confirmado', { qr_reenvio_confirmado: 'Si' }), 'IF QR Funciona Tras Reenvio');
assert.equal(next('IF QR Funciona Tras Reenvio', { qr_reenvio_ok: 'Si' }), 'Form Linea Portada');
assert.equal(next('IF QR Funciona Tras Reenvio', { qr_reenvio_ok: 'No' }), 'Form Escalar Gestor QR');
const failed = { ...query, qr_premisas_ok: 'No', qr_reenvio_confirmado: 'Si', qr_reenvio_ok: 'No' };
const resend = run('Form Reenvio QR SUMA', failed).html_response;
assert.ok(resend.includes('Este flujo no envía el código automáticamente'));
assert.equal((resend.match(/name="qr_reenvio_confirmado"/g) || []).length, 1);
assert.ok(resend.includes('event.stopImmediatePropagation()'));
const clean = run('Form Premisas SIM Virtual', failed).html_response;
assert.ok(!clean.includes('name="qr_reenvio_ok"'));
assert.ok(!clean.includes('name="qr_reenvio_confirmado"'));
const renewal = run('Form Escalar Gestor QR', failed).html_response;
assert.ok(renewal.includes('Crear trámite de renovación'));
assert.ok(renewal.includes('name="__outcome" value="gestor_qr_renovacion"'));
assert.ok(!renewal.includes('El QR superó las 24 horas'));
for (const text of ['Fecha de expedición de la cédula', 'Número de línea', 'Descripción del error o inconveniente presentado',
  'solución requerida', 'Número de contacto', 'Sistema operativo del dispositivo (iOS o Android)']) assert.ok(renewal.includes(text), text);
const original = run('Form Escalar Gestor QR', { ...query, qr_estado: 'Cumplidas24' }).html_response;
assert.ok(original.includes('name="__outcome" value="gestor_qr_vencido"'));
assert.equal(next('IF Renovacion Desde Reenvio QR', failed), 'Form Reenvio QR SUMA');
assert.equal(next('IF Renovacion Desde Reenvio QR', {}), 'Form Gestionar QR');
for (const suma of ['PrepagoSinRecursos', 'PospagoSinRecursos']) {
  assert.equal(next('IF SUMA Activo y Recursos', { suma_ok: suma }), 'Form Cierre Sin Recursos');
  assert.equal(next('IF Mostrar Cierre Sin Recursos', { suma_ok: suma }), 'Form Cierre Sin Recursos');
  assert.equal(next('IF Mostrar Cierre Sin Recursos', { suma_ok: suma, cierre_sin_recursos_ok: 'Si' }), 'Preparar Registro Etapa 2 SQL');
}
for (const suma of ['PospagoConRecursos', 'PrepagoConRecursos']) assert.equal(next('IF SUMA Activo y Recursos', { suma_ok: suma }), 'Preparar Registro Etapa 2 SQL');
const saved = run('Preparar Registro Etapa 2 SQL', { ...failed, gestor_qr_ok: 'Si', __outcome: 'gestor_qr_renovacion', __next_step: 'fin_etapa_2' });
assert.equal(saved.estado_gestion, 'Escalada');
for (const key of ['qr_premisas_ok', 'qr_reenvio_confirmado', 'qr_reenvio_ok']) {
  assert.equal(JSON.parse(saved.respuestas_json)[key], failed[key]);
  assert.equal(JSON.parse(saved.contexto_json)[key], failed[key]);
}
console.log('PREMISAS QR OK: contenido Android/iPhone, secuencia, reenvío manual, renovación, retornos, log y cuatro estados SUMA.');
