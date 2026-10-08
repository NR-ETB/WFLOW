// Pruebas locales del contrato; no ejecutan SQL ni consultan n8n productivo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workflows = [0, 1, 2, 3].map(stage => JSON.parse(fs.readFileSync(path.join(root,
  stage === 0 ? 'Flujo 0 - Registro Inicial.json' : `Ningun Servicio Funciona - ${stage}.json`), 'utf8')));
const find = (stage, name) => workflows[stage].nodes.find(node => node.name === name);
const run = (stage, name, input, reference) => new Function('$json', '$execution', '$',
  find(stage, name).parameters.jsCode)(input, { id: 'validacion-inicio', resumeUrl: 'https://n8n.test/webhook-waiting/123' }, reference)[0].json;
const target = (stage, name, branch = 0) => workflows[stage].connections[name]?.main[branch]?.[0]?.node;
const session = 'f0-referencia-001';
for (const [index, webhook, originalTarget] of [
  [1, 'Apertura del Flujo', 'Form Verificar Linea'],
  [2, 'Continuar a Etapa 2', 'IF Entrada Handoff Valida'],
]) {
  const suffix = 'Entrada ' + index;
  const inputName = 'Normalizar Inicio ' + suffix;
  const lookupName = 'Consultar Registro Inicial ' + suffix;
  const validName = 'IF Registro Inicial ' + suffix;
  const contextName = 'Conservar Sesion Inicial ' + suffix;
  const redirectName = 'Volver a Flujo 0 ' + suffix;
  const errorName = 'Preparar Error Inicio ' + suffix;
  assert.equal(target(1, webhook), inputName);
  assert.equal(target(1, inputName), lookupName);
  assert.equal(target(1, lookupName), validName);
  assert.equal(target(1, lookupName, 1), errorName);
  assert.equal(target(1, validName), contextName);
  assert.equal(target(1, validName, 1), redirectName);
  assert.equal(target(1, contextName), originalTarget);
  assert.equal(find(1, lookupName).onError, 'continueErrorOutput');
  const sql = find(1, lookupName).parameters.query;
  assert.ok(sql.includes('gestion.workflow_session = $1::text COLLATE "C"'));
  for (const token of ['FROM wflow.gestiones AS gestion', 'EXISTS', 'FROM wflow.gestiones_log AS inicial', "inicial.codigo_etapa = 'registroInicial'", "inicial.resultado = 'datos_iniciales_registrados'"]) assert.ok(sql.includes(token));
  const query = { workflow_session: session, __workflow_session: 'no-confiar', tipo_sim: 'eSIM', usuario_asesor: 'NO_EN_URL', numero_conexion: '0000123', pqr: '0000456' };
  const input = run(1, inputName, { query, webhookUrl: 'https://n8n.test/base/webhook/etb-form' });
  assert.equal(input.initial_url, 'https://n8n.test/base/webhook/etb-form-inicial');
  assert.equal(input.workflow_session, session);
  for (const invalid of [undefined, '', 'otra-sesion', [session], '<script>', 'f0-' + 'a'.repeat(73)]) {
    assert.equal(run(1, inputName, { query: { workflow_session: invalid }, webhookUrl: 'https://n8n.test/webhook/etb-form' }).workflow_session, '__missing__');
  }
  const reference = name => { assert.equal(name, inputName); return { first: () => ({ json: input }) }; };
  const context = run(1, contextName, { workflow_session: session }, reference);
  assert.equal(context.query.__workflow_session, session);
  assert.equal(context.query.workflow_session, session);
  for (const field of ['usuario_asesor', 'numero_conexion', 'pqr']) assert.equal(context.query[field], undefined);
  assert.equal(context.query.tipo_sim, index === 1 ? undefined : 'eSIM');
  assert.throws(() => run(1, contextName, { workflow_session: 'f0-otra' }, reference), /no coincide/);
  assert.equal(find(1, redirectName).parameters.respondWith, 'redirect');
  const errorHtml = run(1, errorName, { message: 'PRIVATE_DB_ERROR' }, reference).html_response;
  assert.ok(errorHtml.includes('workflow_session=' + session));
  assert.ok(!errorHtml.includes('NO_EN_URL') && !errorHtml.includes('PRIVATE_DB_ERROR'));
}
for (const stage of [1, 2, 3]) {
  for (const form of workflows[stage].nodes.filter(node => node.name.startsWith('Form ') && node.parameters.jsCode.includes('function hiddenInputs()'))) {
    assert.ok(!/const session =[^;]*Date\.now/.test(form.parameters.jsCode));
    assert.equal((form.parameters.jsCode.match(/if \(!session\) throw new Error\('La gestion debe iniciarse desde el flujo 0\.'/g) || []).length, 1);
    const result = run(stage, form.name, { query: { workflow_session: session } });
    assert.ok(result.html_response.includes('name="__workflow_session" value="' + session + '"'));
    assert.throws(() => run(stage, form.name, { query: {} }), /flujo 0/);
  }
}
for (const stage of [2, 3]) {
  const lookup = find(stage, stage === 2 ? 'Consultar Contexto Etapa 1 PostgreSQL' : 'Consultar Contexto Etapa 2 PostgreSQL');
  assert.ok(lookup.parameters.query.includes('FROM wflow.gestiones AS inicioGestion'));
  const invalid = stage === 2 ? 'HTML Contexto Invalido' : 'HTML Contexto Invalido Etapa 3';
  const html = run(stage, invalid, { esquema_credencial: 'PRIVATE_SCHEMA' },
    () => ({ first: () => ({ json: { webhookUrl: 'https://n8n.test/base/webhook/etb-form-parte-' + stage } }) })).html_response;
  assert.ok(html.includes('https://n8n.test/base/webhook/etb-form-inicial'));
  assert.ok(!html.includes('PRIVATE_SCHEMA') && !html.includes('GestionesFlujosLog'));
}
const summaryQuery = find(3, 'Consultar Resumen Gestion Actual').parameters.query;
for (const field of ['usuario_asesor', 'numero_conexion', 'pqr']) assert.ok(summaryQuery.includes('MAX(' + field + ')'));
const summary = run(3, 'Form Resumen y Observaciones', {
  workflow_session: session, usuario_asesor: '<script>private</script>', numero_conexion: '0000123', pqr: '0000456',
}).html_response;
assert.ok(summary.includes('Registro inicial') && summary.includes('0000123') && summary.includes('0000456'));
assert.ok(!summary.includes('<script>private</script>'));
const sql = fs.readFileSync(path.join(root, 'database/postgres/00_Estructura.sql'), 'utf8');
assert.ok(sql.includes('NEW.numero_etapa > 0'));
assert.ok(sql.includes('No se puede reasignar un registro del log'));
console.log('INICIO GLOBAL OK: entrada verificada, sesión única, retorno al flujo 0, datos fuera de URL y resumen vinculado. SQL no ejecutado.');
