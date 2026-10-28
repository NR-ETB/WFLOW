// Datos ficticios y PostgreSQL en memoria. No llama al CRM, n8n ni SUMA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../preview/test-postgres/node_modules/@electric-sql/pglite');
const { fields, templateValues, templateText } = require('./plantilla_segundo_nivel');
const sql = require('./postgres_consultas');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'Ningun Servicio Funciona - 3.json'), 'utf8'));
const node = name => workflow.nodes.find(item => item.name === name);
const execution = { id: 'plantilla-local', resumeUrl: 'https://n8n.test/webhook-waiting/template', mode: 'production' };
function run(name, input, row) {
  return new Function('$json', '$execution', '$', node(name).parameters.jsCode)(input, execution,
    () => ({ first: () => ({ json: row }) }))[0].json;
}
async function main() {
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync(path.join(root, 'database/postgres/00_Estructura.sql'), 'utf8'));
    const session = 'f0-template-A';
    const other = 'f0-template-B';
    for (const [s, user] of [[session, 'asesor-A'], [other, 'asesor-B']]) await db.query(sql.inicio,
      [s, JSON.stringify({ usuario_asesor: user, numero_conexion: '000123', pqr: 'PQR-' + s }), 'test', 'test']);
    const savedContext = { tipo_sim: 'Fisica', bloqueado: 'No', imei_cliente: '000000000000001',
      canal_atencion: 'Llamada', marca_modelo_equipo: 'Equipo ficticio A', nombre_cliente: 'Cliente ficticio A',
      cedula_cliente: '000001', numero_linea: '000111', numero_contacto: '000222', ciudad_cliente: 'Ciudad ficticia',
      barrio_cliente: 'Barrio ficticio', charging: 'Validado por asesor', saaw: 'Validado por asesor' };
    const save = async (stage, answers, context = answers) => db.query(sql.guardar, [session, 'ningunServicioFunciona',
      'Ningun servicio funciona', ['', 'validacionServicio', 'diagnosticoSim', 'configuracionEquipo'][stage],
      'Etapa ' + stage, stage, 1, 'test', 'test', 'EnCurso', stage === 1 ? 'continuar_parte_2' : 'continuar_parte_3',
      stage === 1 ? 'parte_2_tipo_sim' : 'parte_3_configuracion_equipo', JSON.stringify(answers), JSON.stringify(context)]);
    await save(1, { tipo_sim: 'Fisica' }, savedContext);
    await save(2, { tipo_sim: 'Fisica', suma_ok: 'PospagoConRecursos' });
    const row = (await db.query(node('Consultar Contexto Etapa 2 PostgreSQL').parameters.query, [session, session])).rows[0];
    assert.equal(row.usuario_asesor, 'asesor-A');
    assert.equal(row.contexto_etapa_1.imei_cliente, savedContext.imei_cliente);
    assert.equal(row.contexto_etapa_2.suma_ok, 'PospagoConRecursos');
    assert.notEqual((await db.query(sql.etapa2, [other, other])).rows[0].contexto_valido, 'Si');
    const query = { workflow_session: session, tipo_falla_equipo: 'SMS', usuario_asesor: 'NO CONFIAR',
      segundo_nivel_usuario: 'NO CONFIAR', numero_conexion: 'NO ES LA LÍNEA' };
    const html = run('Form Escalar Segundo Nivel', { query }, row).html_response;
    assert.ok(html.includes('method="POST"'));
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script[1]);
    assert.ok(html.includes('name="segundo_nivel_usuario" value="asesor-A"'));
    assert.ok(html.includes('value="Falla en SMS"'));
    assert.ok(html.includes('value="No está bloqueado"'));
    assert.ok(html.includes('name="segundo_nivel_linea" value="000111"'));
    assert.ok(!html.includes('name="segundo_nivel_usuario" value="NO CONFIAR"'));
    assert.equal(node('Espera Escalar Segundo Nivel').parameters.httpMethod, 'POST');
    const values = templateValues({ ...savedContext, usuario_asesor: 'asesor-A', tipo_falla_equipo: 'SMS' }, fields);
    const body = { workflow_session: session, escalamiento_segundo_nivel: 'Si',
      ...Object.fromEntries(fields.map(([key]) => ['segundo_nivel_' + key, values[key]])),
      segundo_nivel_usuario: 'usuario alterado', plantilla_segundo_nivel: 'texto alterado' };
    const result = run('Normalizar Escalar Segundo Nivel', { body }, row);
    assert.equal(result.plantilla_invalida, false);
    assert.equal(result.query.segundo_nivel_usuario, 'asesor-A');
    assert.equal(result.query.plantilla_segundo_nivel, templateText(values, fields));
    const prepared = run('Preparar Registro Etapa 3 SQL', result);
    const params = new Function('$json', 'return ' + node('Guardar Etapa 3 PostgreSQL').parameters.options.queryReplacement.slice(3, -2))(prepared);
    const ack = (await db.query(sql.guardar, params)).rows[0];
    assert.equal(ack.registro_confirmado, 1);
    await db.query(sql.observaciones, ['Escalamiento realizado; cliente informado.', '2026-10-28T12:00:00Z', session]);
    const log = (await db.query("SELECT * FROM wflow.gestiones_log WHERE workflow_session=$1 AND numero_etapa=3", [session])).rows[0];
    assert.equal(log.respuestas_json.plantilla_segundo_nivel, templateText(values, fields));
    assert.equal(log.contexto_json.plantilla_segundo_nivel, templateText(values, fields));
    assert.equal(log.respuestas_json.datos_segundo_nivel.imei, '000000000000001');
    assert.equal(log.respuestas_json.datos_segundo_nivel.usuario, 'asesor-A');
    assert.equal(log.estado_gestion, 'Escalada');
    for (const value of ['', 'x'.repeat(301), ['duplicado', 'duplicado']]) {
      assert.equal(run('Normalizar Escalar Segundo Nivel', { body: { ...body, segundo_nivel_nombre: value } },
        { ...row, contexto_etapa_1: {} }).plantilla_invalida, true);
    }
    const back = run('Normalizar Escalar Segundo Nivel', { body: { ...body, __back: '1' } }, row);
    assert.ok(!Object.keys(back.query).some(key => key.startsWith('segundo_nivel_') || key === 'plantilla_segundo_nivel'));
    assert.throws(() => run('Normalizar Escalar Segundo Nivel', { body: { ...body, workflow_session: other } }, row), /sesión actual/);
    const isolated = run('Form Escalar Segundo Nivel', { query: { workflow_session: other } }, row).html_response;
    assert.ok(!isolated.includes('value="asesor-A"'));
    assert.ok(!isolated.includes('value="Cliente ficticio A"'));
    assert.equal(templateValues({ numero_conexion: '123', suma_ok: 'PospagoConRecursos', tipo_equipo_cliente: 'Android' }, fields).linea, '');
    assert.equal(templateValues({ suma_ok: 'PospagoConRecursos' }, fields).charging, '');
    const special = run('Form Escalar Segundo Nivel', { query: { workflow_session: session, segundo_nivel_nombre: '<script>alert(1)</script>' } }, row).html_response;
    assert.ok(special.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!special.includes('<script>alert(1)</script>'));
    console.log('PLANTILLA AUTOMÁTICA OK: 14 campos, contexto de la sesión, POST, datos originales, aislamiento y log PostgreSQL.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
