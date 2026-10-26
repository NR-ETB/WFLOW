// Solo las dos salidas de escalamiento usan navegación normal, no fetch al Wait.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'Ningun Servicio Funciona - 1.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
const get = name => {
  const node = workflow.nodes.find(n => n.name === name);
  if (!node) throw new Error('No existe ' + name);
  return node;
};
for (const name of ['Form Escalar GESTFAC', 'Form Escalar Gestor']) {
  const node = get(name);
  node.parameters.jsCode = node.parameters.jsCode.replace(/^const cfg = (\{.*\});$/m, (_, json) => {
    const cfg = JSON.parse(json);
    cfg.finishToStart = false;
    cfg.finishToStartWhen = {};
    cfg.options = cfg.options.filter(option => option.value === 'Si');
    return 'const cfg = ' + JSON.stringify(cfg) + ';';
  });
  node.notes = 'Finalizar envía el formulario mediante navegación normal al Wait activo. PostgreSQL confirma el guardado antes de mostrar el cierre. No depende de fetch desde el iframe.';
}
const name = 'HTML Cierre Etapa 1';
const node = {
  id: 'cierre-visual-etapa-1', name, type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [0, 0], onError: 'continueErrorOutput',
  parameters: { jsCode: fs.readFileSync(path.join(__dirname, 'ui_cierre_etapa1.js'), 'utf8') },
};
const existing = workflow.nodes.find(n => n.name === name);
if (existing) Object.assign(existing, node, { position: existing.position }); else workflow.nodes.push(node);
const edge = node => ({ node, type: 'main', index: 0 });
workflow.connections['IF Continuar Etapa 2'].main[1] = [edge(name)];
workflow.connections[name] = { main: [[edge('Responder Cierre Etapa 1')], [edge('HTML Guardado Pendiente Etapa 1')]] };
const response = get('Responder Cierre Etapa 1');
response.parameters.responseBody = '={{ $json.html_response }}';
response.parameters.options = { responseCode: 200, responseHeaders: { entries: [
  { name: 'Content-Type', value: 'text/html; charset=utf-8' },
  { name: 'Cache-Control', value: 'no-store' },
] } };
const prepare = get('Preparar Registro SQL');
workflow.versionId = 'postgres-flujo-1-20261026-cierres';
prepare.parameters.jsCode = prepare.parameters.jsCode.replace(/workflow_version: '[^']*'/,
  "workflow_version: 'postgres-flujo-1-20261026-cierres'");
prepare.parameters.jsCode = prepare.parameters.jsCode.replace(
  "const estadoGestion = outcome === 'continuar_parte_2' ? 'EnCurso' : (['gestfac','gestor_sincronizacion'].includes(outcome) ? 'Escalada' : 'Completada');",
  "const escalamientoEnviado = outcome === 'gestfac' ? value('escalado_ok') === 'Si' : value('gestor_ok') === 'Si';\nconst estadoGestion = outcome === 'continuar_parte_2' ? 'EnCurso' : (['gestfac','gestor_sincronizacion'].includes(outcome) ? (escalamientoEnviado ? 'Escalada' : 'Pendiente') : 'Completada');",
);
fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
console.log('Cierres GESTFAC/sincronización: HTML confirmado desde el servidor, sin fetch al finalizar.');
