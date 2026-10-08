// Contrato estático. validar_postgres.js ejecuta las consultas en PostgreSQL local.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ddl = fs.readFileSync(path.join(root, 'database/postgres/00_Estructura.sql'), 'utf8');
for (const marker of ['CREATE SCHEMA IF NOT EXISTS wflow', 'CREATE TABLE IF NOT EXISTS wflow.gestiones (',
  'CREATE TABLE IF NOT EXISTS wflow.gestiones_log', 'REFERENCES wflow.gestiones(workflow_session) ON DELETE RESTRICT',
  'CONSTRAINT uq_log_etapa_intento UNIQUE', 'BEFORE INSERT OR UPDATE ON wflow.gestiones_log', 'NEW.numero_etapa > 0',
  'CREATE OR REPLACE FUNCTION wflow.registrar_inicio_gestion', 'ON CONFLICT (workflow_session) DO NOTHING',
  'CREATE OR REPLACE VIEW wflow.vw_gestiones_resumen', 'CREATE OR REPLACE VIEW wflow.vw_nsf_resumen']) assert.ok(ddl.includes(marker), marker);
assert.ok(ddl.includes('BEGIN;') && ddl.trimEnd().endsWith('COMMIT;'));
assert.ok(!/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/.test(ddl));
for (const field of ['usuario_asesor', 'numero_conexion', 'pqr']) {
  assert.equal((ddl.match(new RegExp(field + ' varchar\\(100\\) NOT NULL', 'g')) || []).length, 2);
  assert.ok(ddl.includes('NEW.' + field + ' := inicio.' + field));
}
const start = ddl.indexOf('INSERT INTO wflow.gestiones AS gestion');
const log = ddl.indexOf('INSERT INTO wflow.gestiones_log', start);
const confirm = ddl.indexOf('RETURN QUERY SELECT 1', log);
assert.ok(start < log && log < confirm);
const registration = ddl.slice(ddl.indexOf('CREATE OR REPLACE FUNCTION wflow.registrar_inicio_gestion'), ddl.indexOf('REVOKE ALL ON FUNCTION wflow.registrar_inicio_gestion'));
assert.ok(!/\bUPDATE\s+(?:SET|wflow\.)|\bDELETE\b/i.test(registration.replace(/--[^\n]*/g, '')));
assert.ok(!/FROM\s+.*(?:usuarios|users|asesores)\b/i.test(registration));
for (let stage = 0; stage <= 3; stage++) {
  const file = stage === 0 ? 'Flujo 0 - Registro Inicial.json' : `Ningun Servicio Funciona - ${stage}.json`;
  const workflow = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  assert.ok(workflow.nodes.some(n => n.type === 'n8n-nodes-base.postgres'));
  assert.ok(!workflow.nodes.some(n => n.type === 'n8n-nodes-base.mySql'));
}
console.log('CONTRATO DATOS INICIALES OK: PostgreSQL, cabecera inmutable, log con FK, snapshots y confirmación atómica.');
