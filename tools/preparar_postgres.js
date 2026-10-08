// Los JSON versionados son la fuente vigente de la lógica operativa.
// No ejecutar generadores históricos sobre estos archivos: algunos requieren
// una versión v10 no incluida y otros vuelven a instalar el contrato MySQL.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const script of ['adaptar_postgres', 'organizar_workflows', 'validar_todo']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script + '.js')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
