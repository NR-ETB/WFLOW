// Ejecuta PostgreSQL real en WASM (PGlite), únicamente en memoria y sin red.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); }
catch { ({ PGlite } = require('../preview/test-postgres/node_modules/@electric-sql/pglite')); }
const contracts = require('./postgres_consultas');
const workflows = [0, 1, 2, 3].map(n => JSON.parse(fs.readFileSync(path.join(root,
  n === 0 ? 'Flujo 0 - Registro Inicial.json' : `Ningun Servicio Funciona - ${n}.json`), 'utf8')));
const find = (stage, name) => workflows[stage].nodes.find(n => n.name === name);
const executeCode = (stage, name, input, prepared) => new Function('$json', '$execution', '$', find(stage, name).parameters.jsCode)
  (input, { id: 'test', resumeUrl: 'https://n8n.test/webhook-waiting/1' }, () => ({ first: () => ({ json: prepared }) }))[0].json;
function validateLayout(workflow) {
  const notes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.stickyNote');
  const nodes = workflow.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');
  const inside = (node, note) => node.position[0] >= note.position[0] + 30 && node.position[1] >= note.position[1] + 280
    && node.position[0] + 220 <= note.position[0] + note.parameters.width
    && node.position[1] + 120 <= note.position[1] + note.parameters.height;
  for (const n of nodes) assert.equal(notes.filter(note => inside(n, note)).length, 1, 'Cobertura única: ' + n.name);
  for (const n of notes) {
    assert.ok(n.parameters.content.includes('**Regla:**') && n.parameters.content.includes('**Salidas:**'));
    assert.ok(nodes.some(node => inside(node, n)), 'Sticky vacía: ' + n.name);
  }
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i], b = notes[j];
    assert.ok(!(a.position[0] < b.position[0] + b.parameters.width && a.position[0] + a.parameters.width > b.position[0]
      && a.position[1] < b.position[1] + b.parameters.height && a.position[1] + a.parameters.height > b.position[1]), 'Stickies superpuestas');
  }
  const names = new Set(workflow.nodes.map(n => n.name));
  assert.equal(names.size, workflow.nodes.length);
  assert.equal(new Set(workflow.nodes.map(n => n.id)).size, workflow.nodes.length);
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.ok(names.has(source));
    for (const edge of outputs.main.flat()) assert.ok(names.has(edge.node));
  }
  for (const n of nodes) {
    assert.notEqual(n.type, 'n8n-nodes-base.mySql');
    if (n.type === 'n8n-nodes-base.code') new Function('$json', '$execution', '$', n.parameters.jsCode);
    if (n.type !== 'n8n-nodes-base.postgres') continue;
    assert.equal(n.typeVersion, 2.6);
    assert.equal(n.parameters.resource, 'database');
    assert.ok(n.parameters.options.queryReplacement.startsWith('={{ ['));
    assert.ok(!/CRM\.|ON DUPLICATE|JSON_EXTRACT|DATABASE\(\)/.test(n.parameters.query));
    assert.equal(n.onError, 'continueErrorOutput');
    assert.ok(workflow.connections[n.name].main[1]?.length, 'Error sin respuesta: ' + n.name);
    assert.ok(!n.credentials?.mySql);
  }
}
async function main() {
  workflows.forEach(validateLayout);
  const db = new PGlite();
  try {
    const ddl = fs.readFileSync(path.join(root, 'database/postgres/00_Estructura.sql'), 'utf8');
    await db.exec(ddl);
    await db.exec(ddl); // Reinstalar no borra tablas ni necesita MySQL.
    const migration = fs.readFileSync(path.join(root, 'database/postgres/02_InicioSoloInserts.sql'), 'utf8');
    const functionStart = 'CREATE OR REPLACE FUNCTION wflow.registrar_inicio_gestion';
    const functionEnd = 'REVOKE ALL ON FUNCTION wflow.registrar_inicio_gestion(text, jsonb, text, text) FROM PUBLIC;';
    const extract = text => text.slice(text.indexOf(functionStart), text.indexOf(functionEnd) + functionEnd.length).replace(/\r\n/g, '\n');
    assert.equal(extract(migration), extract(ddl), 'Migración y DDL deben publicar la misma función');
    await db.exec(migration);
    await db.exec(migration);
    const session = 'f0-postgres-001';
    const original = { usuario_asesor: "asesor.'test", numero_conexion: '0000123', pqr: '0000456' };
    const start = async (s, datos, version = 'postgres-test') => (await db.query(contracts.inicio, [s, JSON.stringify(datos), 'exec-test', version])).rows[0];
    const confirmed = await start(session, original);
    assert.equal(confirmed.registroConfirmado, 1);
    assert.equal(confirmed.numeroConexion, original.numero_conexion);
    assert.equal(confirmed.pqr, original.pqr);
    const snapshot = async () => ({
      gestion: (await db.query('SELECT * FROM wflow.gestiones WHERE workflow_session = $1', [session])).rows[0],
      log: (await db.query('SELECT * FROM wflow.gestiones_log WHERE workflow_session = $1', [session])).rows[0],
    });
    const beforeRetry = await snapshot();
    const retry = await start(session, { usuario_asesor: 'otro', numero_conexion: '9', pqr: '10' });
    assert.deepEqual(retry, confirmed, 'El reintento no cambia los valores originales');
    assert.deepEqual(await snapshot(), beforeRetry, 'Flujo 0 no actualiza timestamps, ejecución ni registros anteriores');
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM wflow.gestiones_log')).rows[0].n, 1);
    await start('f0-mismo-asesor-otra-gestion', original);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM wflow.gestiones WHERE usuario_asesor = $1', [original.usuario_asesor])).rows[0].n, 2,
      'El mismo asesor y las mismas referencias pueden generar gestiones independientes');
    for (const bad of [{ ...original, pqr: '' }, { ...original, numero_conexion: 123 }, {}, [], { ...original, pqr: 'a'.repeat(101) }, { ...original, usuario_asesor: 'control\n' }]) {
      await assert.rejects(start('f0-invalid', bad));
    }
    await assert.rejects(start('f0-atomic-failure', original, 'a'.repeat(101)));
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM wflow.gestiones WHERE workflow_session = 'f0-atomic-failure'")).rows[0].n, 0, 'Rollback de cabecera si falla log');
    await assert.rejects(db.query("UPDATE wflow.gestiones SET pqr = 'otro' WHERE workflow_session = $1", [session]));
    const lookup = (await db.query(contracts.registro, [session])).rows[0];
    assert.equal(lookup.registro_inicial_valido, 'Si');
    assert.equal((await db.query(contracts.registro, [session.toUpperCase()])).rows[0].registro_inicial_valido, 'No');
    const stageParams = (stage, result, next, answers, s = session) => [s, 'ningunServicioFunciona', 'Ningun servicio funciona',
      ['','validacionServicio','diagnosticoSim','configuracionEquipo'][stage], 'Etapa ' + stage,
      stage, 1, 'exec-stage-' + stage, 'postgres-test', stage === 3 ? 'PendienteCierre' : 'EnCurso', result, next,
      JSON.stringify(answers), JSON.stringify(answers)];
    await assert.rejects(db.query(contracts.guardar, stageParams(1, 'continuar_parte_2', 'parte_2_tipo_sim', {}, 'f0-no-existe')));
    await db.query("INSERT INTO wflow.gestiones (workflow_session,usuario_asesor,numero_conexion,pqr) VALUES ('f0-sin-log','asesor','1','2')");
    await assert.rejects(db.query(contracts.guardar, stageParams(1, 'continuar_parte_2', 'parte_2_tipo_sim', {}, 'f0-sin-log')));
    const p1 = stageParams(1, 'continuar_parte_2', 'parte_2_tipo_sim', { tipo_sim: 'eSIM', pqr: 'no-confiar', usuario_asesor: 'no-confiar' });
    const ack1 = (await db.query(contracts.guardar, p1)).rows[0];
    executeCode(1, 'Confirmar Guardado Etapa 1', ack1, { workflow_session: session });
    await db.query(contracts.guardar, p1);
    const context1 = (await db.query(contracts.etapa1, [session, 'normal', '', 'https://n8n.test', session])).rows[0];
    assert.equal(context1.contexto_valido, 'Si'); assert.equal(context1.contrato_canonico, 'Si'); assert.equal(context1.tipo_sim, 'eSIM');
    for (const option of ['PospagoConRecursos', 'PrepagoConRecursos']) {
      const p2 = stageParams(2, 'continuar_parte_3', 'parte_3_configuracion_equipo', { tipo_sim: 'eSIM', suma_ok: option });
      const ack2 = (await db.query(contracts.guardar, p2)).rows[0];
      executeCode(2, 'Confirmar Guardado Etapa 2', ack2, { workflow_session: session });
      assert.equal((await db.query(contracts.etapa2, [session, session])).rows[0].contexto_valido, 'Si');
    }
    await db.query(contracts.guardar, stageParams(2, 'no_aplica_sin_recursos', 'fin_etapa_2', { tipo_sim: 'eSIM', suma_ok: 'PrepagoSinRecursos' }));
    assert.equal((await db.query(contracts.etapa2, [session, session])).rows[0].contexto_valido, 'No');
    await db.query(contracts.guardar, stageParams(2, 'continuar_parte_3', 'parte_3_configuracion_equipo', { tipo_sim: 'eSIM', suma_ok: 'PrepagoConRecursos' }));
    const ack3 = (await db.query(contracts.guardar, stageParams(3, 'escalado_segundo_nivel', 'cierre_asesor', { tipo_falla_equipo: 'SMS' }))).rows[0];
    executeCode(3, 'Confirmar Guardado Etapa 3', ack3, { workflow_session: session });
    const summary = (await db.query(contracts.resumen, [session])).rows[0];
    assert.equal(summary.etapas_registradas, 3); assert.equal(summary.numero_conexion, '0000123');
    executeCode(3, 'Verificar Resumen de Sesion', summary, { workflow_session: session });
    const observation = "Se escaló el caso; cliente informado. Comillas ' y comas, preservadas.";
    const closed = (await db.query(contracts.observaciones, [observation, '2026-10-08T12:00:00Z', session])).rows[0];
    executeCode(3, 'Confirmar Observaciones Asesor', closed, { workflow_session: session });
    const log = (await db.query('SELECT * FROM wflow.gestiones_log WHERE workflow_session = $1 ORDER BY numero_etapa', [session])).rows;
    assert.equal(log.length, 4);
    for (const l of log) {
      assert.equal(l.usuario_asesor, original.usuario_asesor); assert.equal(l.numero_conexion, '0000123'); assert.equal(l.pqr, '0000456');
      assert.equal(l.respuestas_json.pqr, original.pqr); assert.equal(l.contexto_json.usuario_asesor, original.usuario_asesor);
    }
    assert.equal(log[3].respuestas_json.observaciones_asesor, observation); assert.equal(log[3].estado_gestion, 'Escalada');
    const noRow = await db.query(contracts.observaciones, [observation, 'date', 'f0-no-existe']);
    assert.equal(noRow.rows.length, 0);
    for (const [stage, name] of [[1,'Confirmar Guardado Etapa 1'],[2,'Confirmar Guardado Etapa 2'],[3,'Confirmar Guardado Etapa 3'],[3,'Confirmar Observaciones Asesor'],[3,'Verificar Resumen de Sesion']]) {
      assert.throws(() => executeCode(stage, name, {}, { workflow_session: session }));
      assert.throws(() => executeCode(stage, name, { registro_confirmado: 1, workflow_session: 'otra', etapas_registradas: 3 }, { workflow_session: session }));
    }
    await db.exec(fs.readFileSync(path.join(root, 'database/postgres/01_Verificacion.sql'), 'utf8'));
    const audit = await db.exec(fs.readFileSync(path.join(root, 'database/postgres/03_AuditoriaSoloLectura.sql'), 'utf8'));
    const functionAudit = audit.flatMap(result => result.rows || []).find(row => 'inicio_sin_actualizaciones' in row);
    assert.ok(functionAudit.inserta_cabecera && functionAudit.inserta_log && functionAudit.inicio_sin_actualizaciones);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM wflow.vw_nsf_resumen')).rows[0].n, 1);
    console.log('POSTGRESQL OK: DDL ejecutado dos veces, atomicidad, idempotencia, datos originales, consultas de 4 flujos, cierres y 24 stickies verificadas. Sin conexión productiva.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
