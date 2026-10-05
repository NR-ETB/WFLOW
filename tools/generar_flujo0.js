const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const code = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const sql = 'CALL CRM.RegistrarInicioGestion($1,$2,$3,$4)';
const nodes = [];
const connections = {};
function add(name, type, typeVersion, position, parameters, extra = {}) {
  nodes.push({ id: 'flujo0-' + name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-'), name, type: 'n8n-nodes-base.' + type, typeVersion, position, parameters, ...extra });
}
function connect(from, branch, to) {
  if (!connections[from]) connections[from] = { main: [] };
  while (connections[from].main.length <= branch) connections[from].main.push([]);
  connections[from].main[branch].push({ node: to, type: 'main', index: 0 });
}
const headers = contentType => ({ responseHeaders: { entries: [{ name: 'Content-Type', value: contentType }, { name: 'Cache-Control', value: 'no-store' }, { name: 'Referrer-Policy', value: 'no-referrer' }] } });
add('Abrir Flujo 0', 'webhook', 2.1, [0, 0], { httpMethod: 'GET', path: 'etb-form-inicial', responseMode: 'responseNode', options: {} }, { webhookId: 'flujo0-abrir-registro' });
add('Formulario Inicial', 'code', 2, [280, 0], { jsCode: code('flujo0_form.js') });
add('Mostrar Formulario Inicial', 'respondToWebhook', 1.5, [560, 0], { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: headers('text/html; charset=utf-8') });
add('Recibir Datos Iniciales', 'webhook', 2.1, [0, 480], { httpMethod: 'POST', path: 'etb-form-inicial-guardar', responseMode: 'responseNode', options: {} }, { webhookId: 'flujo0-recibir-registro' });
add('Validar Datos Iniciales', 'code', 2, [280, 480], { jsCode: code('flujo0_validar_datos.js') });
add('IF Datos Iniciales Validos', 'if', 2.3, [560, 480], { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 }, conditions: [{ id: 'flujo0-datos-validos', leftValue: '={{ $json.valido }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} });
add('Preparar Registro Inicial SQL', 'code', 2, [840, 380], { jsCode: `const answers = $json.valores;
return [{ json: {
  workflow_session: $json.workflow_session,
  codigo_flujo: 'inicioGestion', nombre_flujo: 'Inicio de gestion',
  codigo_etapa: 'registroInicial', nombre_etapa: 'Datos iniciales del asesor y la atencion',
  numero_etapa: 0, numero_intento: 1,
  execution_id: String($execution.id || ''), workflow_version: 'flujo0-v2-datos-base-log-20261005',
  estado_gestion: 'Completada', resultado: 'datos_iniciales_registrados', next_step: 'fin_flujo_0',
  respuestas_json: JSON.stringify(answers), contexto_json: JSON.stringify(answers),
  valores: answers, webhookUrl: $json.webhookUrl,
} }];` });
add('Guardar Registro Inicial MySQL', 'mySql', 2.5, [1120, 380], { operation: 'executeQuery', query: sql, options: {
  queryBatching: 'single',
  queryReplacement: '={{ [ $json.workflow_session, $json.respuestas_json, $json.execution_id, $json.workflow_version ] }}',
  replaceEmptyStrings: true, detailedOutput: true,
} }, { onError: 'continueErrorOutput', notes: 'Ejecuta primero database/02_DatosInicialesGestion_Workbench.sql. Asigna credencial CRM con EXECUTE sobre RegistrarInicioGestion y SELECT/INSERT/UPDATE sobre las dos tablas.' });
add('Confirmar Registro Inicial', 'code', 2, [1400, 280], { jsCode: `const input = $('Preparar Registro Inicial SQL').first().json;
function findConfirmation(value) {
  if (!value || typeof value !== 'object') return null;
  if (Number(value.registroConfirmado) === 1 && value.workflowSession === input.workflow_session &&
      ['usuarioAsesor', 'numeroConexion', 'pqr'].every(key => typeof value[key] === 'string' && value[key])) return value;
  for (const current of Object.values(value)) {
    if (current && typeof current === 'object') { const found = findConfirmation(current); if (found) return found; }
  }
  return null;
}
const stored = findConfirmation($json);
if (!stored) throw new Error('La base no devolvio confirmacion del registro inicial.');
const prepared = { workflow_session: stored.workflowSession, valores: {
  usuario_asesor: stored.usuarioAsesor, numero_conexion: stored.numeroConexion, pqr: stored.pqr,
} };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fields = [['Usuario del asesor', 'usuario_asesor'], ['Número de conexión', 'numero_conexion'], ['PQR', 'pqr']];
const summary = fields.map(([label, key]) => '<div class="row"><dt>' + label + '</dt><dd>' + esc(prepared.valores[key]) + '</dd></div>').join('');
const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ETB - Registro completado</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#071830;color:#f0f6ff;font-family:system-ui,sans-serif;padding:18px}.card{width:min(100%,620px);background:#10284a;border:1px solid #1a416d;border-radius:22px;padding:32px}.tag{color:#63e89e;font-size:12px}h1{font-size:30px}p{color:#b9c8dc;line-height:1.6}.row{background:#081a34;border-radius:12px;padding:14px;margin-bottom:10px}dt{color:#9fb4cf;font-size:12px}dd{margin:6px 0 0;overflow-wrap:anywhere}.reference{font-size:12px;overflow-wrap:anywhere}@media(max-width:480px){.card{padding:24px 18px}}</style></head><body><main class="card"><div class="tag">FLUJO 0 · REGISTRO COMPLETADO</div><h1>Datos iniciales guardados</h1><p>El registro se guardó correctamente. Este flujo aún no está conectado al diagnóstico.</p><dl>' + summary + '</dl><p class="reference">Referencia de la gestión: ' + esc(prepared.workflow_session) + '</p></main></body></html>';
return [{ json: { html_response: html } }];` }, { onError: 'continueErrorOutput' });
add('Mostrar Registro Completado', 'respondToWebhook', 1.5, [1680, 280], { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: headers('text/html; charset=utf-8') });
add('Formulario Datos Invalidos', 'code', 2, [840, 700], { jsCode: code('flujo0_form.js') });
add('Mostrar Datos Invalidos', 'respondToWebhook', 1.5, [1120, 700], { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: { ...headers('text/html; charset=utf-8'), responseCode: 422 } });
add('Preparar Reintento Registro', 'code', 2, [1400, 480], { jsCode: `const prepared = $('Preparar Registro Inicial SQL').first().json;
return [{ json: {
  workflow_session: prepared.workflow_session,
  valores: prepared.valores, webhookUrl: prepared.webhookUrl,
  mensaje: 'No pudimos confirmar el guardado. Tus datos se conservan en este formulario. Reintenta; si continúa, informa la referencia de la gestión a soporte: ' + prepared.workflow_session,
  detalle_tecnico: String($json.message || $json.error?.message || 'Error de guardado'),
} }];` });
add('Formulario Reintento Registro', 'code', 2, [1680, 480], { jsCode: code('flujo0_form.js') });
add('Mostrar Reintento Registro', 'respondToWebhook', 1.5, [1960, 480], { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: { ...headers('text/html; charset=utf-8'), responseCode: 503 } });
connect('Abrir Flujo 0', 0, 'Formulario Inicial');
connect('Formulario Inicial', 0, 'Mostrar Formulario Inicial');
connect('Recibir Datos Iniciales', 0, 'Validar Datos Iniciales');
connect('Validar Datos Iniciales', 0, 'IF Datos Iniciales Validos');
connect('IF Datos Iniciales Validos', 0, 'Preparar Registro Inicial SQL');
connect('IF Datos Iniciales Validos', 1, 'Formulario Datos Invalidos');
connect('Preparar Registro Inicial SQL', 0, 'Guardar Registro Inicial MySQL');
connect('Guardar Registro Inicial MySQL', 0, 'Confirmar Registro Inicial');
connect('Confirmar Registro Inicial', 0, 'Mostrar Registro Completado');
connect('Confirmar Registro Inicial', 1, 'Preparar Reintento Registro');
connect('Guardar Registro Inicial MySQL', 1, 'Preparar Reintento Registro');
connect('Preparar Reintento Registro', 0, 'Formulario Reintento Registro');
connect('Formulario Reintento Registro', 0, 'Mostrar Reintento Registro');
connect('Formulario Datos Invalidos', 0, 'Mostrar Datos Invalidos');
const workflow = { name: 'Flujo 0 - Registro Inicial', nodes, pinData: {}, connections, active: false, settings: { executionOrder: 'v1' }, versionId: 'flujo0-v2-datos-base-log-20261005', meta: { templateCredsSetupCompleted: false }, tags: [] };
fs.writeFileSync(path.join(root, 'Flujo 0 - Registro Inicial.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Flujo 0 generado: datos iniciales en registro principal y log, con confirmación de la base.');
