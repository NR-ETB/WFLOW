// Ejecuta todas las regresiones y devuelve error si falla cualquiera.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const tests = ['validar_flujo0', 'validar_datos_iniciales_db', 'validar_inicio_global',
  'validar_v11', 'validar_etapa2', 'validar_etapa3', 'validar_integracion',
  'validar_plantillas_escalamiento', 'validar_cierre_etapa2', 'validar_postgres', 'validar_recorridos_log'];
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test + '.js')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('VALIDACIÓN COMPLETA OK: ' + tests.length + ' suites.');
