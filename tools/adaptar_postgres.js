// Adaptación final, idempotente. Ejecutar después de los generadores históricos.
const fs = require('node:fs');
const path = require('node:path');
const sql = require('./postgres_consultas');
const root = path.resolve(__dirname, '..');
const files = ['Flujo 0 - Registro Inicial.json', ...[1, 2, 3].map(n => `Ningun Servicio Funciona - ${n}.json`)];
for (const [stage, file] of files.entries()) {
  let source = fs.readFileSync(path.join(root, file), 'utf8')
    .replaceAll('MySQL', 'PostgreSQL').replaceAll('CRM.GestionesFlujosLog', 'wflow.gestiones_log')
    .replaceAll('CRM.GestionesFlujos', 'wflow.gestiones');
  const workflow = JSON.parse(source);
  for (const node of workflow.nodes) {
    if (!['n8n-nodes-base.mySql', 'n8n-nodes-base.postgres'].includes(node.type)) continue;
    node.type = 'n8n-nodes-base.postgres';
    node.typeVersion = 2.6;
    const name = node.name;
    const query = name.includes('Guardar Registro Inicial') ? sql.inicio :
      name.includes('Consultar Registro Inicial') ? sql.registro :
      name.includes('Consultar Contexto Etapa 1') ? sql.etapa1 :
      name.includes('Consultar Contexto Etapa 2') ? sql.etapa2 :
      name === 'Consultar Resumen Gestion Actual' ? sql.resumen :
      name.includes('Guardar Observaciones') ? sql.observaciones :
      name.startsWith('Guardar ') ? sql.guardar : null;
    if (!query) throw new Error('Nodo de persistencia sin contrato: ' + name);
    node.parameters = { resource: 'database', operation: 'executeQuery', query, options: {
      queryBatching: 'single', queryReplacement: node.parameters.options.queryReplacement,
      replaceEmptyStrings: false, largeNumbersOutput: 'text', connectionTimeout: 15,
    } };
    if (node.credentials?.mySql) {
      delete node.credentials.mySql;
      if (!Object.keys(node.credentials).length) delete node.credentials;
    }
    node.notes = 'PostgreSQL · CRM_N8N · esquema wflow. Instalar database/postgres/00_Estructura.sql. Asignar la credencial PostgreSQL; nunca guardar contraseñas en el JSON. Los parámetros se envían como un array, sin concatenar datos en SQL.';
    node.onError = 'continueErrorOutput';
    node.alwaysOutputData = true;
  }
  // Evitar éxito aparente si un UPDATE no encuentra la fila o devuelve datos vacíos.
  if (stage > 0) {
    const confirmations = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.postgres' &&
      (n.name.startsWith('Guardar ') || n.name === 'Consultar Resumen Gestion Actual'));
    for (const database of confirmations) {
      const summary = database.name === 'Consultar Resumen Gestion Actual';
      const observation = database.name.includes('Observaciones');
      const name = summary ? 'Verificar Resumen de Sesion' : observation ? 'Confirmar Observaciones Asesor' : `Confirmar Guardado Etapa ${stage}`;
      if (workflow.nodes.some(n => n.name === name)) continue;
      const preparedName = observation ? 'Preparar Observaciones Asesor' : stage === 1 ? 'Preparar Registro SQL' : `Preparar Registro Etapa ${stage} SQL`;
      const errorName = stage === 2 ? 'HTML Error Persistencia Etapa 2' : `HTML Guardado Pendiente Etapa ${stage}`;
      const next = workflow.connections[database.name].main[0];
      workflow.nodes.push({ id: `pg-confirm-${stage}-${observation ? 'observaciones' : summary ? 'resumen' : 'etapa'}`,
        name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 0], onError: 'continueErrorOutput',
        parameters: { jsCode: `const expected = $('${preparedName}').first().json.workflow_session;
if ($json.workflow_session !== expected || ${summary ? 'Number($json.etapas_registradas) < 3' : 'Number($json.registro_confirmado) !== 1'}) {
  throw new Error('La base no confirmó la operación para esta sesión.');
}
return [{json:$json}];` } });
      workflow.connections[database.name].main[0] = [{ node: name, type: 'main', index: 0 }];
      workflow.connections[name] = { main: [next, [{ node: errorName, type: 'main', index: 0 }]] };
    }
  }
  // Las etapas 1 y 3 tenían salidas de error de persistencia sin respuesta.
  if ([1, 3].includes(stage)) {
    const name = `HTML Guardado Pendiente Etapa ${stage}`;
    const responder = `Responder Guardado Pendiente Etapa ${stage}`;
    if (!workflow.nodes.some(n => n.name === name)) {
      const references = stage === 1 ? ['Preparar Registro SQL', 'Normalizar Inicio Entrada 1'] :
        ['Preparar Observaciones Asesor', 'Preparar Registro Etapa 3 SQL', 'Normalizar Entrada Etapa 3'];
      workflow.nodes.push({ id: `pg-error-ui-${stage}`, name, type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [0, 0], parameters: { jsCode: `const references = ${JSON.stringify(references)};
let context = {};
for (const name of references) { try { const value = $(name).first().json; if (value.workflow_session) { context = value; break; } } catch (error) {} }
const session = String(context.workflow_session || '');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const candidate = String(context.public_base || context.webhookUrl || $execution.resumeUrl || '');
const match = candidate.match(/^(https?:\\/\\/[^/]+)(\\/[^?#]*)?/);
let retry = '';
if (match && session) {
  const base = match[1] + (match[2] || '').split(/\\/webhook(?:-waiting|-test)?\\//)[0].replace(/\\/$/, '');
  retry = base + '/webhook/${stage === 1 ? 'etb-form' : 'etb-form-parte-3'}?workflow_session=' + encodeURIComponent(session);
}
const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ETB - Gestión pendiente</title><style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#071830;color:#f0f6ff;font:16px system-ui;padding:18px;box-sizing:border-box}.card{width:min(100%,620px);background:#10284a;border-radius:20px;padding:30px;box-sizing:border-box}p{line-height:1.6;overflow-wrap:anywhere}a{display:block;text-align:center;background:#148cdd;color:white;padding:16px;border-radius:12px;text-decoration:none}</style></head><body><main class="card"><h1>Gestión pendiente de confirmar</h1><p>No pudimos confirmar esta operación. Las etapas ya guardadas se conservan. Retoma la gestión con la misma referencia; puede ser necesario repetir las últimas validaciones.</p><p>Si continúa, comparte la referencia con soporte: ' + esc(session || 'no disponible') + '</p>' + (retry ? '<a href="'+esc(retry)+'">Retomar gestión</a>' : '') + '</main></body></html>';
return [{json:{html_response:html,persistence_diagnostic:{workflow_session:session,message:String($json.message || $json.error?.message || 'Error sin detalle'),table:'wflow.gestiones_log'}}}];` } });
      workflow.nodes.push({ id: `pg-error-response-${stage}`, name: responder, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5,
        position: [0, 0], parameters: { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: {
          responseCode: 503, responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] },
        } } });
      workflow.connections[name] = { main: [[{ node: responder, type: 'main', index: 0 }]] };
    }
    for (const node of workflow.nodes.filter(n => n.type === 'n8n-nodes-base.postgres')) {
      const outputs = workflow.connections[node.name]?.main;
      if (outputs && !outputs[1]?.length) outputs[1] = [{ node: name, type: 'main', index: 0 }];
    }
  }
  workflow.versionId = `postgres-flujo-${stage}-20261008`;
  workflow.meta = { ...workflow.meta, templateCredsSetupCompleted: false };
  workflow.nodes.filter(n => n.type === 'n8n-nodes-base.code').forEach(n => {
    n.parameters.jsCode = n.parameters.jsCode.replace(/workflow_version: '[^']*'/g, `workflow_version: 'postgres-flujo-${stage}-20261008'`);
  });
  fs.writeFileSync(path.join(root, file), JSON.stringify(workflow, null, 2) + '\n');
}
console.log('Cuatro workflows adaptados a PostgreSQL. Credenciales externas al repositorio.');
