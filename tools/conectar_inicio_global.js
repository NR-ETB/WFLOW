// Ejecutar después de generar/adaptar las tres etapas. No modifica el servidor.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = stage => JSON.parse(fs.readFileSync(path.join(root, `Ningun Servicio Funciona - ${stage}.json`), 'utf8'));
const save = (stage, workflow) => fs.writeFileSync(path.join(root, `Ningun Servicio Funciona - ${stage}.json`), JSON.stringify(workflow, null, 2) + '\n');
const edge = node => ({ node, type: 'main', index: 0 });
const node = (workflow, name) => {
  const found = workflow.nodes.find(item => item.name === name);
  if (!found) throw new Error('No existe ' + name);
  return found;
};
const upsert = (workflow, entry) => {
  const existing = workflow.nodes.find(item => item.name === entry.name);
  if (existing) Object.assign(existing, entry); else workflow.nodes.push(entry);
};
const w1 = load(1);
for (const [index, webhookName, target] of [
  [1, 'Apertura del Flujo', 'Form Verificar Linea'],
  [2, 'Continuar a Etapa 2', 'IF Entrada Handoff Valida'],
]) {
  const suffix = 'Entrada ' + index;
  const names = {
    input: 'Normalizar Inicio ' + suffix,
    lookup: 'Consultar Registro Inicial ' + suffix,
    valid: 'IF Registro Inicial ' + suffix,
    context: 'Conservar Sesion Inicial ' + suffix,
    redirect: 'Volver a Flujo 0 ' + suffix,
    error: 'Preparar Error Inicio ' + suffix,
    response: 'Responder Error Inicio ' + suffix,
  };
  const y = -1900 - (index - 1) * 700;
  const add = (name, type, x, parameters, extra = {}) => upsert(w1, {
    id: 'inicio-global-' + index + '-' + type + '-' + x,
    name, type: 'n8n-nodes-base.' + type,
    typeVersion: type === 'if' ? 2.3 : type === 'mySql' ? 2.5 : type === 'respondToWebhook' ? 1.5 : 2,
    position: [x, y], parameters, ...extra,
  });
  add(names.input, 'code', -1650, { jsCode: `const input = $json || {};
const query = input.query || {};
const raw = query.workflow_session ?? query.__workflow_session;
const session = typeof raw === 'string' && /^f0-[a-zA-Z0-9_-]{1,72}$/.test(raw) ? raw : '__missing__';
const match = String(input.webhookUrl || '').match(/^(https?:\\/\\/[^/]+)(\\/[^?#]*)?/i);
let initialUrl = '';
if (match) {
  const pathname = match[2] || '';
  const marker = ['/webhook-test/', '/webhook/'].find(value => pathname.includes(value));
  if (marker) initialUrl = match[1] + pathname.slice(0, pathname.indexOf(marker)) + '/webhook/etb-form-inicial';
}
if (!initialUrl) throw new Error('No se pudo resolver la entrada publicada del flujo 0.');
return [{ json: { ...input, workflow_session: session, initial_url: initialUrl } }];` });
  add(names.lookup, 'mySql', -1370, {
    operation: 'executeQuery',
    query: `SELECT COUNT(*) AS coincidencias,
 IF(COUNT(*) = 1, 'Si', 'No') AS registro_inicial_valido,
 MAX(gestion.workflowSession) AS workflow_session
FROM CRM.GestionesFlujos AS gestion
WHERE CAST(gestion.workflowSession AS BINARY) = CAST($1 AS BINARY)
 AND EXISTS (SELECT 1 FROM CRM.GestionesFlujosLog AS inicial
   WHERE inicial.workflowSession = gestion.workflowSession
     AND inicial.codigoFlujo = 'inicioGestion' AND inicial.codigoEtapa = 'registroInicial'
     AND inicial.resultado = 'datos_iniciales_registrados')`,
    options: { queryBatching: 'single', queryReplacement: '={{ [ $json.workflow_session ] }}', detailedOutput: false },
  }, { onError: 'continueErrorOutput', notes: 'Usa la misma credencial de gestiones del flujo 0. Exige registro principal y log inicial.' });
  add(names.valid, 'if', -1090, { conditions: {
    options: { caseSensitive: true, typeValidation: 'strict', version: 3 },
    conditions: [{ id: 'inicio-valido-' + index, leftValue: '={{ $json.registro_inicial_valido }}', rightValue: 'Si', operator: { type: 'string', operation: 'equals' } }], combinator: 'and',
  }, options: {} });
  add(names.context, 'code', -810, { jsCode: `const original = $('${names.input}').first().json;
const session = String($json.workflow_session || '');
if (session !== original.workflow_session) throw new Error('La sesion inicial no coincide.');
const query = ${index === 1 ? '{}' : '{ ...original.query }'};
query.workflow_session = session;
query.__workflow_session = session;
for (const key of ['usuario_asesor', 'numero_conexion', 'pqr', 'usuarioAsesor', 'numeroConexion']) delete query[key];
return [{ json: { ...original, query, workflow_session: session } }];` });
  add(names.redirect, 'respondToWebhook', -530, { respondWith: 'redirect', redirectURL: `={{ $('${names.input}').first().json.initial_url }}`, options: {} });
  node(w1, names.redirect).position[1] = y + 190;
  add(names.error, 'code', -1090, { jsCode: `const input = $('${names.input}').first().json;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const query = { ...input.query, workflow_session: input.workflow_session };
for (const key of ['usuario_asesor', 'numero_conexion', 'pqr', 'usuarioAsesor', 'numeroConexion']) delete query[key];
const parameters = Object.entries(query).filter(([, value]) => typeof value === 'string').map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
const retryUrl = String(input.webhookUrl || '').split('?')[0] + '?' + parameters;
const html = '<!DOCTYPE html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ETB - Continuidad de la gestión</title><body style="margin:0;background:#071830;color:#f0f6ff;font-family:system-ui;padding:24px"><main style="max-width:620px;margin:8vh auto;background:#10284a;padding:28px;border-radius:20px"><h1>Tu gestión conserva su referencia</h1><p>No pudimos consultar el registro inicial. Intenta nuevamente desde este mismo enlace. Si continúa, informa la referencia a soporte.</p><p>' + esc(input.workflow_session === '__missing__' ? 'Sin referencia de gestión' : input.workflow_session) + '</p><a style="color:#38c7ff" href="' + esc(retryUrl) + '">Reintentar consulta</a></main></body></html>';
return [{ json: { html_response: html } }];` });
  node(w1, names.error).position[1] = y + 380;
  add(names.response, 'respondToWebhook', -810, { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: { responseCode: 503, responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] } } });
  node(w1, names.response).position[1] = y + 380;
  w1.connections[webhookName] = { main: [[edge(names.input)]] };
  w1.connections[names.input] = { main: [[edge(names.lookup)]] };
  w1.connections[names.lookup] = { main: [[edge(names.valid)], [edge(names.error)]] };
  w1.connections[names.valid] = { main: [[edge(names.context)], [edge(names.redirect)]] };
  w1.connections[names.context] = { main: [[edge(target)]] };
  w1.connections[names.error] = { main: [[edge(names.response)]] };
}
// Las pantallas nunca inventan una sesión distinta a la del registro inicial.
for (let stage = 1; stage <= 3; stage++) {
  const workflow = stage === 1 ? w1 : load(stage);
  for (const entry of workflow.nodes) {
    if (entry.parameters?.jsCode && entry.name.startsWith('Preparar Registro')) {
      entry.parameters.jsCode = entry.parameters.jsCode.replace(/workflow_version: '[^']+'/, "workflow_version: 'entrada-global-flujo0-20261008-etapa" + stage + "'");
    }
    if (entry.parameters?.jsCode && entry.name.startsWith('Form ')) {
      entry.parameters.jsCode = entry.parameters.jsCode.replace(
        /const session = fieldValue\('__workflow_session'\)[^;]*;(?:\s*if \(!session\) throw new Error\('La gestion debe iniciarse desde el flujo 0\.'\);)*/,
        "const session = fieldValue('__workflow_session') || fieldValue('workflow_session');\n  if (!session) throw new Error('La gestion debe iniciarse desde el flujo 0.');",
      );
    }
  }
  if (stage > 1) {
    const lookup = node(workflow, stage === 2 ? 'Consultar Contexto Etapa 1 MySQL' : 'Consultar Contexto Etapa 2 MySQL');
    const condition = `\n  AND EXISTS (SELECT 1 FROM CRM.GestionesFlujos AS inicioGestion\n    WHERE inicioGestion.workflowSession = CRM.GestionesFlujosLog.workflowSession)`;
    if (!lookup.parameters.query.includes('FROM CRM.GestionesFlujos AS inicioGestion')) lookup.parameters.query += condition;
    // La falta de continuidad no expone nombres de tablas ni credenciales al asesor.
    const invalidName = stage === 2 ? 'HTML Contexto Invalido' : 'HTML Contexto Invalido Etapa 3';
    const entries = stage === 2 ? ['Apertura Etapa 2', 'Continuar directamente a Diagnostico de Equipo'] : ['Apertura Etapa 3'];
    node(workflow, invalidName).parameters.jsCode = `const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
let initialUrl = '';
for (const name of ${JSON.stringify(entries)}) {
  try {
    const input = $(name).first().json;
    const match = String(input.webhookUrl || '').match(/^(https?:\\/\\/[^/]+)(\\/[^?#]*)?/i);
    if (match) {
      const pathname = match[2] || '';
      const marker = ['/webhook-test/', '/webhook/'].find(value => pathname.includes(value));
      if (marker) initialUrl = match[1] + pathname.slice(0, pathname.indexOf(marker)) + '/webhook/etb-form-inicial';
    }
  } catch {}
}
const html = '<!DOCTYPE html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ETB - Inicio de la gestión</title><body style="margin:0;background:#071830;color:#f0f6ff;font-family:system-ui;padding:24px"><main style="max-width:620px;margin:8vh auto;background:#10284a;padding:28px;border-radius:20px"><h1>Inicia la gestión desde el flujo 0</h1><p>Este enlace no tiene una gestión inicial confirmada o aún falta completar la etapa anterior. Usa el registro inicial para comenzar una nueva atención.</p>' + (initialUrl ? '<a style="display:block;padding:16px;border-radius:12px;background:#0d80cc;color:#fff;text-decoration:none;text-align:center" href="' + esc(initialUrl) + '">Ir al registro inicial</a>' : '<p>Abre el enlace publicado del flujo 0.</p>') + '</main></body></html>';
return [{ json: { html_response: html } }];`;
  }
  if (stage === 3) {
    const summary = node(workflow, 'Consultar Resumen Gestion Actual');
    if (!summary.parameters.query.includes('MAX(usuarioAsesor) AS usuario_asesor')) {
      summary.parameters.query = summary.parameters.query.replace(' MAX(workflowSession) AS workflow_session,',
        ' MAX(workflowSession) AS workflow_session,\n MAX(usuarioAsesor) AS usuario_asesor,\n MAX(numeroConexion) AS numero_conexion,\n MAX(pqr) AS pqr,');
    }
    const form = node(workflow, 'Form Resumen y Observaciones');
    if (!form.parameters.jsCode.includes('const initialSummary =')) {
      form.parameters.jsCode = form.parameters.jsCode.replace('return [{json:{html_response:html}}];',
        `const initialSummary = '<section class="step" style="margin-bottom:12px" aria-label="Datos iniciales"><h2>Registro inicial</h2><div class="chips">' + chips([['Usuario del asesor',row.usuario_asesor],['Número de conexión',row.numero_conexion],['PQR',row.pqr]]) + '</div></section>';
return [{json:{html_response:html.replace('<section class="timeline"', initialSummary + '<section class="timeline"')}}];`);
    }
    form.parameters.jsCode = form.parameters.jsCode.replace('<section class="step" aria-label="Datos iniciales">', '<section class="step" style="margin-bottom:12px" aria-label="Datos iniciales">');
    if (!form.parameters.jsCode.includes("PospagoConRecursos:'Activo y con recursos (pospago)'")) {
      form.parameters.jsCode = form.parameters.jsCode.replace("Si:'Sí', No:'No',", "PospagoConRecursos:'Activo y con recursos (pospago)', PrepagoConRecursos:'Activo y con recursos (prepago)', PrepagoSinRecursos:'Activo sin recursos o recursos incompletos (prepago)',\n  Si:'Sí', No:'No',");
    }
  }
  workflow.versionId = 'entrada-global-flujo0-20261008-etapa' + stage;
  save(stage, workflow);
}
console.log('Inicio global conectado: registro inicial confirmado, sesión única y consultas posteriores vinculadas a la cabecera.');
