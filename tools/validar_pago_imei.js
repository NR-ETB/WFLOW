// Contrato operativo local; no consulta IMEI ni ejecuta pagos o reconexiones.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'Ningun Servicio Funciona - 1.json'), 'utf8'));
const nodes = new Map(workflow.nodes.map(n => [n.name, n]));
const execution = { id: 'pago-imei-local', mode: 'production', resumeUrl: 'https://n8n.test/base/webhook-waiting/etapa1' };
const getCfg = name => JSON.parse(nodes.get(name).parameters.jsCode.match(/^const cfg = (\{.*\});$/m)[1]);
const run = (name, query) => new Function('$json', '$execution', nodes.get(name).parameters.jsCode)({ query }, execution)[0].json;
for (const [name, field] of [['Form Escalar GESTFAC', 'escalado_ok'], ['Form Escalar Gestor', 'gestor_ok']]) {
  assert.deepEqual(getCfg(name).options.map(o => o.value), ['Si']);
  const html = run(name, { __workflow_session: 'f0-test' }).html_response;
  assert.ok(!html.includes('name="' + field + '" value="No"'));
  assert.ok(!html.includes('No fue posible escalar'));
  assert.ok(!html.includes('No fue posible enviarlo'));
}
const payment = getCfg('Form Confirmar Pago');
assert.deepEqual(payment.finishToStartWhen, {});
assert.equal(payment.outcome, null);
assert.ok(!nodes.get('Form Confirmar Pago').parameters.jsCode.includes('Confirmar y reconectar'));
assert.equal(workflow.connections['IF pago_al_dia'].main[1][0].node, 'Form Saldo Pendiente');
assert.equal(workflow.connections['IF pago_al_dia'].main[0][0].node, 'Form Validar ICCID');
const cfg = getCfg('Form Saldo Pendiente');
assert.equal(cfg.outcome, 'pago_pendiente');
assert.equal(cfg.options.length, 1);
assert.ok(cfg.subtitle.includes('deberá realizar el pago correspondiente'));
const html = run('Form Saldo Pendiente', { __workflow_session: 'f0-test', pago_al_dia: 'No' }).html_response;
const query = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(m => [m[1], m[2]]));
query.pago_pendiente_informado = 'Si';
const saved = run('Preparar Registro SQL', query);
assert.equal(saved.resultado_etapa_1, 'pago_pendiente');
assert.equal(saved.estado_gestion, 'Pendiente');
assert.equal(saved.next_step, 'fin_etapa_1');
assert.equal(JSON.parse(saved.respuestas_json).pago_pendiente_informado, 'Si');
assert.equal(JSON.parse(saved.contexto_json).pago_al_dia, 'No');
const closure = new Function('$json', '$', nodes.get('HTML Cierre Etapa 1').parameters.jsCode)(
  { workflow_session: 'f0-test', registro_confirmado: 1 }, () => ({ first: () => ({ json: saved }) }))[0].json.html_response;
assert.ok(closure.includes('deberá realizar el pago correspondiente'));
assert.ok(closure.includes('Iniciar nueva gestión'));
assert.ok(!closure.includes('El caso quedó registrado como enviado'));
const imeiCfg = getCfg('Form Consultar Registro IMEI');
assert.equal(imeiCfg.requiredLink, 'https://www.imeicolombia.com.co/');
const imei = run('Form Consultar Registro IMEI', { __workflow_session: 'f0-test' }).html_response;
assert.ok(imei.includes('href="https://www.imeicolombia.com.co/"'));
assert.ok(!imei.includes('tramitescrcom.gov.co'));
assert.ok(!imei.includes('SRTM'));
assert.ok(imei.includes('data.get("consulta_imei_abierta")!=="Si"'));
console.log('PAGO/IMEI OK: dos confirmaciones únicas, paso de saldo pendiente, log, sin reconexión automática y enlace exacto obligatorio.');
