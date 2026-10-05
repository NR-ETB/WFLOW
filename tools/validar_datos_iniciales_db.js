// Validación local de contratos. No conecta ni ejecuta SQL contra una base.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/02_DatosInicialesGestion_Workbench.sql');
const checks = read('database/03_DatosInicialesGestion_Consultas.sql');
const workflow = JSON.parse(read('Flujo 0 - Registro Inicial.json'));
const node = workflow.nodes.find(node => node.name === 'Guardar Registro Inicial MySQL');
assert.equal(node.parameters.query, 'CALL CRM.RegistrarInicioGestion($1,$2,$3,$4)');
const replacements = node.parameters.options.queryReplacement.match(/\$json\.[a-z_]+/g);
assert.equal(replacements.length, 4);
assert.ok(!/DROP\s+TABLE|TRUNCATE\s+(TABLE\s+)?|DELETE\s+FROM/i.test(migration));
assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS CRM.GestionesFlujos'));
assert.ok(migration.includes('UNIQUE KEY uqGestionesFlujosSesion (workflowSession)'));
for (const field of ['usuarioAsesor', 'numeroConexion', 'pqr']) {
  assert.ok(migration.includes(field + ' VARCHAR(100) NOT NULL'));
  assert.ok(migration.includes('ADD COLUMN ' + field + ' VARCHAR(100)'));
  assert.ok(migration.includes('NEW.' + field));
}
assert.ok(migration.includes('log.updatedAt = log.updatedAt'), 'No cambiar fechas históricas en el backfill');
assert.ok(migration.includes('principal.COLLATION_NAME = logSesion.COLLATION_NAME'));
assert.ok(migration.includes('CHARACTER_SET_NAME = logSesion.CHARACTER_SET_NAME'));
assert.ok(migration.includes("vLogEngine <> 'InnoDB'"));
assert.ok(migration.includes('DECLARE EXIT HANDLER FOR SQLEXCEPTION'));
assert.ok(migration.includes('ROLLBACK;\n        RESIGNAL;'));
const procedure = migration.slice(migration.indexOf('CREATE PROCEDURE CRM.RegistrarInicioGestion('));
assert.equal((procedure.match(/\bIN p[A-Za-z]+/g) || []).length, 4);
for (const field of ['usuario_asesor', 'numero_conexion', 'pqr']) {
  assert.ok(procedure.includes("JSON_TYPE(JSON_EXTRACT(pDatos, '$." + field + "'))"));
}
const begin = procedure.indexOf('START TRANSACTION;');
const principal = procedure.indexOf('INSERT INTO CRM.GestionesFlujos (');
const log = procedure.indexOf('INSERT INTO CRM.GestionesFlujosLog');
const commit = procedure.indexOf('COMMIT;');
const confirmation = procedure.indexOf('SELECT 1 AS registroConfirmado');
assert.ok(begin < principal && principal < log && log < commit && commit < confirmation, 'Confirmar solo después de las dos escrituras y el commit');
assert.ok(procedure.slice(principal, log).includes('ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)'));
assert.ok(!/ON DUPLICATE KEY UPDATE[^;]*usuarioAsesor\s*=/i.test(procedure.slice(principal, log)), 'No reemplazar el registro original');
assert.ok(migration.includes('BEFORE INSERT ON CRM.GestionesFlujosLog'));
assert.ok(migration.includes('BEFORE UPDATE ON CRM.GestionesFlujosLog'));
assert.equal((migration.match(/El flujo inicial debe guardarse con RegistrarInicioGestion/g) || []).length, 2, 'No aceptar un registro inicial solo en el log');
assert.equal((migration.match(/FROM CRM\.GestionesFlujos WHERE workflowSession = NEW\.workflowSession/g) || []).length, 2);
assert.ok(migration.includes("codigoFlujo = 'inicioGestion' AND codigoEtapa = 'registroInicial'"));
assert.ok(migration.includes('ORDER BY createdAt, id'));
assert.ok(migration.includes('CREATE OR REPLACE VIEW CRM.VwGestionesFlujosResumen'));
assert.ok(migration.includes('CREATE OR REPLACE VIEW CRM.VwGestionesFlujosTrazabilidad'));
assert.ok(!migration.includes('CREATE OR REPLACE VIEW CRM.VwNsf'));
assert.ok(checks.includes('principalesSinLogInicial') && checks.includes('copiasDiferentesDelOriginal'));
for (const stage of [1, 2, 3]) {
  const current = JSON.parse(read('Ningun Servicio Funciona - ' + stage + '.json'));
  const save = current.nodes.find(node => node.type === 'n8n-nodes-base.mySql' && node.parameters.query?.includes('INSERT INTO CRM.GestionesFlujosLog'));
  assert.ok(save, 'La etapa existente conserva su contrato de log');
  assert.ok(!save.parameters.query.includes('usuarioAsesor'), 'Las etapas reciben el snapshot mediante triggers, sin cambiar su INSERT');
}
console.log('CONTRATO DATOS INICIALES OK: esquema, transacción, backfill, snapshots y confirmación. SQL no ejecutado en servidor.');
