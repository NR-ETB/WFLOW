const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const stage1Path = path.join(root, 'Ningun Servicio Funciona - 1.json');
const outputPath = path.join(root, 'Ningun Servicio Funciona - 2.json');
const stage1 = JSON.parse(fs.readFileSync(stage1Path, 'utf8'));

function sourceNode(name) {
  const node = stage1.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No se encontró la plantilla ${name}`);
  return node;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const workflow = {
  name: 'Ningun Servicio Funciona - 2',
  nodes: [],
  pinData: {},
  connections: {},
  active: false,
  settings: { executionOrder: 'v1' },
  versionId: 'etapa2-v6-handoff-codificado-20260715',
  meta: { templateCredsSetupCompleted: false },
  id: 'NingunServicioFuncionaEtapa2V2',
  tags: [],
};

function add(node) {
  workflow.nodes.push(node);
  return node;
}

function connect(source, branch, target) {
  if (!workflow.connections[source]) workflow.connections[source] = { main: [] };
  const main = workflow.connections[source].main;
  while (main.length <= branch) main.push([]);
  main[branch].push({ node: target, type: 'main', index: 0 });
}

function chain(...names) {
  for (let index = 0; index < names.length - 1; index += 1) connect(names[index], 0, names[index + 1]);
}

const baseFormCode = sourceNode('Form Confirmar Pago').parameters.jsCode;

function buildFormCode(config) {
  const match = baseFormCode.match(/^const cfg = (\{.*\});$/m);
  if (!match) throw new Error('La plantilla no contiene cfg');
  const cfg = {
    field: config.field,
    titleAccent: config.titleAccent || '',
    title: config.title,
    question: config.question,
    subtitle: config.subtitle,
    tag: config.tag,
    buttonLabel: config.buttonLabel || 'Continuar',
    options: config.options,
    footer: '© 2026 ETB · Empresa de Telecomunicaciones de Bogotá',
    errorMsg: 'Debes seleccionar una opción antes de continuar',
    startPath: 'etb-form-parte-2',
    allowBack: Boolean(config.allowBack),
    backButtonLabel: 'Volver',
    finishToStart: Boolean(config.final),
    finishToStartWhen: {},
    rendererVersion: 'etapa2-v1',
    finishMode: config.final ? 'complete' : 'continue',
  };
  if (config.outcome) cfg.outcome = config.outcome;
  if (config.nextStep) cfg.nextStep = config.nextStep;
  if (config.handoffPath) cfg.handoffPath = config.handoffPath;
  if (config.handoffWhen) cfg.handoffWhen = config.handoffWhen;

  let code = baseFormCode.replace(match[0], `const cfg = ${JSON.stringify(cfg)};`);
  code = code.replace(
    "const session = fieldValue('__workflow_session') || String(Date.now()) + '-' + Math.random().toString(36).slice(2);",
    "const session = fieldValue('__workflow_session') || fieldValue('workflow_session') || String(Date.now()) + '-' + Math.random().toString(36).slice(2);",
  );
  code = code.replace(
    "if (internal.has(key) || key === cfg.field || key === '__workflow_session') return;",
    "if (internal.has(key) || key === cfg.field || key === '__workflow_session' || key === 'workflow_session') return;",
  );
  code = code.replace(
    "  const testFlag = executionMode === 'test' ? 'true' : 'false';",
    `  const handoffWhen = JSON.stringify(cfg.handoffWhen || {});
  const cleanHandoffPath = String(cfg.handoffPath || '').replace(/^\\/+/, '');
  let handoffUrl = '';
  if (cleanHandoffPath) {
    const resumeMatch = String(resumeUrl || '').match(/^(https?:\\/\\/[^/]+)(\\/[^?#]*)?/i);
    if (resumeMatch) {
      const origin = resumeMatch[1];
      const pathname = resumeMatch[2] || '';
      const markers = ['/webhook-waiting/', '/webhook-test/', '/webhook/'];
      let basePath = '';
      for (const marker of markers) {
        const markerIndex = pathname.indexOf(marker);
        if (markerIndex >= 0) { basePath = pathname.slice(0, markerIndex); break; }
      }
      handoffUrl = origin + basePath + '/webhook/' + cleanHandoffPath;
    }
  }
  const handoffUrlJson = JSON.stringify(handoffUrl);
  const testFlag = executionMode === 'test' ? 'true' : 'false';
  const completionFlag = cfg.finishMode === 'complete' ? 'true' : 'false';`,
  );
  code = code.replace(
    "var startUrl=' + startUrlJson + ';var isTestMode=' + testFlag + ';function showCompletion()",
    "var startUrl=' + startUrlJson + ';var handoffUrl=' + handoffUrlJson + ';var handoffWhen=' + handoffWhen + ';var isTestMode=' + testFlag + ';var finishComplete=' + completionFlag + ';function showCompletion()",
  );
  code = code.replace(
    'function shouldReturnToStart(data){if(cfgFinishToStart)return true;return Object.keys(cfgFinishToStartWhen).some(function(k){return data.get(k)===cfgFinishToStartWhen[k];});}',
    'function shouldReturnToStart(data){if(cfgFinishToStart)return true;return Object.keys(cfgFinishToStartWhen).some(function(k){return data.get(k)===cfgFinishToStartWhen[k];});}function shouldUseHandoff(data){var keys=Object.keys(handoffWhen||{});return !!handoffUrl&&keys.length>0&&keys.every(function(k){return data.get(k)===String(handoffWhen[k]);});}',
  );
  code = code.replace(
    'err.classList.remove("is-visible");err.style.display="none";if(shouldReturnToStart(data))',
    'err.classList.remove("is-visible");err.style.display="none";if(shouldUseHandoff(data)){form.action=handoffUrl;}if(shouldReturnToStart(data))',
  );
  code = code.replace(
    'if(isTestMode||!startUrl){showCompletion();return;}',
    'if(finishComplete||isTestMode||!startUrl){showCompletion();return;}',
  );
  code = code.replace('Proceso finalizado', 'Gestión finalizada');
  code = code.replace(
    'Las respuestas fueron procesadas y enviadas al cierre del flujo.',
    'Las respuestas fueron guardadas correctamente.',
  );
  code = code.replace(
    'Modo de prueba: vuelve a n8n y pulsa <strong>Test workflow</strong> para iniciar una nueva ejecución.',
    'Puedes cerrar esta ventana. Para una nueva gestión, inicia otra sesión desde el comienzo.',
  );
  return code;
}

const formTemplate = sourceNode('Form Confirmar Pago');
const respondTemplate = sourceNode('Enviar Confirmar Pago');
const waitTemplate = sourceNode('Espera Confirmar Pago');
const ifTemplate = sourceNode('IF linea_activa');
const compactContextCss = '@media(min-width:901px) and (max-width:1600px), (min-width:901px) and (max-height:900px){.card{width:min(100%,620px);padding:28px 30px}.title{font-size:32px}.copy,.code{font-size:14px}}';

function makeIf(name, expression, expected, position) {
  const node = clone(ifTemplate);
  node.id = `etapa2-if-${slug(name)}`;
  node.name = name;
  node.position = position;
  node.parameters.conditions.conditions = [{
    id: `cond-${slug(name)}`,
    leftValue: expression,
    rightValue: expected,
    operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
  }];
  node.parameters.conditions.combinator = 'or';
  return add(node);
}

function makeBackIf(label, position) {
  return makeIf(`IF Volver ${label}`, '={{ $json.query.__back }}', '1', position);
}

function makeFormSet(label, config, position) {
  const [x, y] = position;
  const step = 280;
  const form = clone(formTemplate);
  form.id = `etapa2-form-${slug(label)}`;
  form.name = `Form ${label}`;
  form.position = [x, y];
  form.parameters.jsCode = buildFormCode(config);
  add(form);

  const send = clone(respondTemplate);
  send.id = `etapa2-enviar-${slug(label)}`;
  send.name = `Enviar ${label}`;
  send.position = [x + step, y];
  add(send);

  const wait = clone(waitTemplate);
  wait.id = `etapa2-espera-${slug(label)}`;
  wait.name = `Espera ${label}`;
  wait.webhookId = `etapa2-${slug(label)}`;
  wait.position = [x + (step * 2), y];
  add(wait);

  let back = null;
  if (config.allowBack) back = makeBackIf(label, [x + (step * 3), y]);
  chain(form.name, send.name, wait.name);
  if (back) connect(wait.name, 0, back.name);
  return { form: form.name, send: send.name, wait: wait.name, back: back?.name || null };
}

const webhook = clone(sourceNode('Apertura del Flujo'));
webhook.id = 'etapa2-webhook-apertura';
webhook.name = 'Apertura Etapa 2';
webhook.webhookId = 'etb-form-parte-2';
webhook.position = [-3600, 0];
webhook.parameters.path = 'etb-form-parte-2';
webhook.parameters.responseMode = 'responseNode';
webhook.parameters.options = { allowedOrigins: '*' };
add(webhook);

const handoffWebhook = clone(sourceNode('Apertura del Flujo'));
handoffWebhook.id = 'etapa2-webhook-handoff-etapa3';
handoffWebhook.name = 'Continuar directamente a Diagnostico de Equipo';
handoffWebhook.webhookId = 'etb-form-parte-2-continuar';
handoffWebhook.position = [-3600, -520];
handoffWebhook.parameters.httpMethod = 'GET';
handoffWebhook.parameters.path = 'etb-form-parte-2-continuar';
handoffWebhook.parameters.responseMode = 'responseNode';
handoffWebhook.parameters.options = { allowedOrigins: '*' };
add(handoffWebhook);

add({
  parameters: {
    jsCode: `const query = ($json && $json.query) ? $json.query : {};
const raw = Array.isArray(query.workflow_session) ? query.workflow_session[0] : query.workflow_session;
const workflowSession = String(raw || '').trim();
return [{ json: {
  workflow_session: workflowSession || '__missing__',
  transition_mode: 'ui',
  handoff_query_json: encodeURIComponent('{}'),
  public_base: '',
} }];`,
  },
  id: 'etapa2-normalizar-entrada',
  name: 'Normalizar Entrada Etapa 2',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-3320, 0],
});

add({
  parameters: {
    jsCode: `const input = $json || {};
const query = input.query || {};
const first = (value) => Array.isArray(value) ? value[0] : value;
const workflowSession = String(first(query.workflow_session) || first(query.__workflow_session) || '').trim();
const headers = input.headers || {};
const forwardedProto = String(first(headers['x-forwarded-proto']) || '').split(',')[0].trim();
const forwardedHost = String(first(headers['x-forwarded-host']) || '').split(',')[0].trim();
const host = forwardedHost || String(first(headers.host) || '').trim();
const proto = forwardedProto || 'https';
const publicBase = host ? proto + '://' + host : '';
const normalizedQuery = { ...query, workflow_session: workflowSession, __workflow_session: workflowSession };
return [{ json: {
  workflow_session: workflowSession || '__missing__',
  transition_mode: 'handoff',
  handoff_query_json: encodeURIComponent(JSON.stringify(normalizedQuery)),
  public_base: publicBase,
} }];`,
  },
  id: 'etapa2-normalizar-handoff-etapa3',
  name: 'Normalizar Handoff a Diagnostico de Equipo',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-3320, -520],
});

const lookup = clone(sourceNode('Guardar Respuestas MySQL'));
lookup.id = 'etapa2-consultar-etapa1-mysql';
lookup.name = 'Consultar Contexto Etapa 1 MySQL';
lookup.position = [-3040, 0];
lookup.parameters = {
  operation: 'executeQuery',
  query: "SELECT $1 AS workflow_session_solicitada, $2 AS transition_mode, $3 AS handoff_query_json, $4 AS public_base, DATABASE() AS esquema_credencial, COUNT(*) AS coincidencias, IF(COUNT(*) >= 1 AND MAX(tipo_sim) IS NOT NULL AND TRIM(MAX(tipo_sim)) <> '', 'Si', 'No') AS contexto_valido, IF(MAX(resultado_etapa_1) = 'continuar_parte_2' AND MAX(next_step) = 'parte_2_tipo_sim', 'Si', 'No') AS contrato_canonico, MAX(workflow_session) AS workflow_session, MAX(tipo_sim) AS tipo_sim, MAX(resultado_etapa_1) AS resultado_etapa_1, MAX(next_step) AS next_step FROM CRM.n8n_nsf_respuestas WHERE workflow_session = $5",
  options: {
    queryBatching: 'single',
      queryReplacement: '={{ [ $json.workflow_session, $json.transition_mode, $json.handoff_query_json, $json.public_base, $json.workflow_session ] }}',
    replaceEmptyStrings: true,
    detailedOutput: false,
  },
};
lookup.notesInFlow = true;
lookup.notes = 'Selecciona la credencial MySQL CRM. La sesión puede venir de la versión actual o de una gestión anterior; debe existir y tener tipo_sim. contrato_canonico permite auditar si también conserva los marcadores actuales.';
lookup.onError = 'continueErrorOutput';
delete lookup.credentials;
add(lookup);

makeIf('IF Contexto Etapa 1 Valido', '={{ $json.contexto_valido }}', 'Si', [-2760, 0]);
makeIf('IF Entrada por Handoff', '={{ $json.transition_mode }}', 'handoff', [-2480, 0]);

add({
  parameters: {
    jsCode: `const session = String($json.workflow_session || $json.workflow_session_solicitada || '');
const tipo = String($json.tipo_sim || '');
return [{ json: { query: { workflow_session: session, tipo_sim: tipo } } }];`,
  },
  id: 'etapa2-preparar-contexto-ui',
  name: 'Preparar Contexto UI Etapa 2',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-2200, 160],
});

add({
  parameters: {
    jsCode: `let query = {};
const encodedQuery = String($json.handoff_query_json || '%7B%7D');
try { query = JSON.parse(decodeURIComponent(encodedQuery)); } catch (error) {
  try { query = JSON.parse(encodedQuery); } catch (fallbackError) {}
}
const workflowSession = String($json.workflow_session || $json.workflow_session_solicitada || query.workflow_session || query.__workflow_session || '').trim();
query.workflow_session = workflowSession;
query.__workflow_session = workflowSession;
const base = String($json.public_base || '').replace(/\\\/$/, '');
return [{ json: {
  query,
  webhookUrl: base ? base + '/webhook/etb-form-parte-2-continuar' : '',
} }];`,
  },
  id: 'etapa2-preparar-handoff-sql',
  name: 'Preparar Handoff SQL y Continuidad',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-2200, -360],
});

add({
  parameters: {
    jsCode: `const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#071830"><title>ETB - Contexto no válido</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071830;color:#f0f6ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:18px}.card{width:min(100%,720px);background:#10284a;border:1px solid rgba(29,161,242,.25);border-radius:20px;padding:clamp(24px,5vw,44px);box-shadow:0 28px 70px rgba(0,0,0,.55)}.tag{color:#ff8fa3;font-size:12px;letter-spacing:.1em;text-transform:uppercase}.title{font-size:clamp(26px,6vw,40px);margin:14px 0}.copy{color:rgba(240,246,255,.72);font-size:16px;line-height:1.6}.code{margin-top:20px;padding:14px;border-radius:12px;background:#081a34;color:#38c7ff;overflow-wrap:anywhere}@media(max-width:480px){body{align-items:start;padding-top:28px}.card{padding:24px 18px}}</style></head><body><main class="card"><div class="tag">Acceso no válido</div><h1 class="title">No fue posible recuperar la gestión</h1><p class="copy">La sesión anterior no existe o no terminó correctamente.</p><div class="code">Verifica el parámetro workflow_session e inicia nuevamente desde el comienzo.</div></main></body></html>';
return [{ json: { html_response: html } }];`,
  },
  id: 'etapa2-contexto-invalido-html',
  name: 'HTML Contexto Invalido',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-2480, 500],
});

const invalidContextNode = workflow.nodes.find((node) => node.name === 'HTML Contexto Invalido');
if (invalidContextNode) {
  invalidContextNode.parameters.jsCode = `const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const requested = String($json.workflow_session_solicitada || '');
const schema = String($json.esquema_credencial || '(sin esquema predeterminado)');
const matches = Number($json.coincidencias || 0);
const tipoSim = String($json.tipo_sim || '');
const reason = !requested
  ? 'El enlace no incluyó workflow_session.'
  : matches === 0
    ? 'La credencial MySQL no encontró esta sesión en CRM.n8n_nsf_respuestas.'
    : !tipoSim
      ? 'La sesión existe, pero tipo_sim está vacío.'
      : 'La sesión existe, pero no pudo habilitarse la continuidad.';
const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#071830"><title>ETB - Diagnóstico de acceso</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071830;color:#f0f6ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:18px}.card{width:min(100%,720px);background:#10284a;border:1px solid rgba(29,161,242,.25);border-radius:20px;padding:clamp(24px,5vw,40px);box-shadow:0 28px 70px rgba(0,0,0,.55)}.tag{color:#ff8fa3;font-size:12px;letter-spacing:.1em;text-transform:uppercase}.title{font-size:clamp(26px,6vw,38px);margin:14px 0}.copy{color:rgba(240,246,255,.76);font-size:15px;line-height:1.55}.details{margin-top:20px;display:grid;gap:8px}.row{padding:10px 12px;border-radius:10px;background:#081a34;border:1px solid rgba(29,161,242,.14);font-size:13px;overflow-wrap:anywhere}.row b{color:#38c7ff;font-weight:600}.hint{margin-top:18px;color:rgba(240,246,255,.58);font-size:12px;line-height:1.5}' + ${JSON.stringify(compactContextCss)} + '</style></head><body><main class="card"><div class="tag">Diagnóstico de acceso</div><h1 class="title">No fue posible recuperar la gestión</h1><p class="copy">' + esc(reason) + '</p><div class="details"><div class="row"><b>Sesión:</b> ' + esc(requested || '(vacía)') + '</div><div class="row"><b>Tabla:</b> CRM.n8n_nsf_respuestas</div><div class="row"><b>Esquema de la credencial:</b> ' + esc(schema) + '</div><div class="row"><b>Filas encontradas:</b> ' + esc(matches) + '</div><div class="row"><b>Tipo de SIM:</b> ' + esc(tipoSim || '(vacío)') + '</div></div><p class="hint">Usa la misma credencial MySQL CRM en Guardar Respuestas MySQL y Consultar Contexto Etapa 1 MySQL.</p></main></body></html>';
return [{ json: { html_response: html } }];`;
}

const invalidRespond = clone(respondTemplate);
invalidRespond.id = 'etapa2-responder-contexto-invalido';
invalidRespond.name = 'Responder Contexto Invalido';
invalidRespond.position = [-2200, 500];
invalidRespond.parameters.options = { responseCode: 400 };
add(invalidRespond);

makeIf('IF Tipo SIM eSIM', '={{ $json.query.tipo_sim }}', 'eSIM', [-1360, -280]);
makeIf('IF Tipo SIM Fisica', '={{ $json.query.tipo_sim }}', 'Fisica', [-1080, 180]);

const multi = makeFormSet('Resolver MultiSIM', {
  field: 'ruta_multisim',
  title: 'Definir componente de {accent}',
  titleAccent: 'MultiSIM',
  question: 'COMPONENTE QUE PRESENTA LA FALLA',
  subtitle: 'MultiSIM puede involucrar componentes físicos o virtuales. Selecciona cuál se está diagnosticando.',
  tag: 'Diagnóstico · MultiSIM',
  options: [
    { value: 'Virtual', label: 'Componente virtual / eSIM' },
    { value: 'Fisica', label: 'Componente físico' },
  ],
  allowBack: false,
}, [-800, 650]);
makeIf('IF Ruta MultiSIM Virtual', '={{ $json.query.ruta_multisim }}', 'Virtual', [320, 650]);

const qr = makeFormSet('Validar QR', {
  field: 'qr_escaneo_ok',
  title: 'Validar escaneo del {accent}',
  titleAccent: 'QR',
  question: '¿EL QR FUE ESCANEADO CORRECTAMENTE?',
  subtitle: 'Confirma si la SIM virtual quedó instalada después de escanear el código QR.',
  tag: 'Diagnóstico · SIM virtual',
  options: [
    { value: 'Si', label: 'Sí, el QR funcionó' },
    { value: 'No', label: 'No fue posible escanearlo' },
  ],
  allowBack: false,
}, [640, -1050]);
makeIf('IF QR Escaneo OK', '={{ $json.query.qr_escaneo_ok }}', 'Si', [1760, -1050]);

const qrManage = makeFormSet('Gestionar QR', {
  field: 'qr_gestion',
  title: 'Gestionar novedad del {accent}',
  titleAccent: 'QR',
  question: 'ACCIÓN REALIZADA',
  subtitle: 'Intenta nuevamente el escaneo, reenvía el QR o inicia el proceso de reposición cuando corresponda.',
  tag: 'Diagnóstico · Recuperación QR',
  options: [
    { value: 'Reintentar', label: 'Volver a escanear' },
    { value: 'Reenviado', label: 'QR reenviado' },
    { value: 'Reposicion', label: 'Requiere reposición' },
  ],
  allowBack: true,
}, [2040, -1050]);
makeIf('IF QR Requiere Reposicion', '={{ $json.query.qr_gestion }}', 'Reposicion', [3160, -1050]);

const replacement = makeFormSet('Confirmar Reposicion QR', {
  field: 'reposicion_ok',
  title: 'Confirmar proceso de {accent}',
  titleAccent: 'reposición',
  question: 'RESULTADO DE LA GESTIÓN',
  subtitle: 'Registra si el proceso de reposición de la SIM virtual quedó iniciado correctamente.',
  tag: 'Diagnóstico · Salida QR',
  buttonLabel: 'Guardar y finalizar',
  options: [
    { value: 'Si', label: 'Reposición iniciada' },
    { value: 'No', label: 'No fue posible iniciarla' },
  ],
  allowBack: true,
  final: true,
  outcome: 'reposicion_qr',
  nextStep: 'fin_etapa_2',
}, [3440, -1050]);

const ported = makeFormSet('Linea Portada', {
  field: 'linea_portada',
  title: 'Validar si la línea es {accent}',
  titleAccent: 'portada',
  question: 'ESTADO DE PORTABILIDAD',
  subtitle: 'Confirma si el número del cliente proviene de otro operador.',
  tag: 'Diagnóstico · Portabilidad',
  options: [
    { value: 'Si', label: 'Sí, es una línea portada' },
    { value: 'No', label: 'No es una línea portada' },
  ],
  allowBack: false,
}, [640, 100]);
makeIf('IF Linea Portada', '={{ $json.query.linea_portada }}', 'Si', [1760, 100]);

const portability = makeFormSet('Verificar Portacion', {
  field: 'portacion_completada',
  title: 'Verificar portación en {accent}',
  titleAccent: 'Portaflow',
  question: '¿LA PORTACIÓN ESTÁ COMPLETADA?',
  subtitle: 'Consulta Portaflow y revisa en SUMA el estado de la orden antes de continuar.',
  tag: 'Diagnóstico · Portaflow y SUMA',
  options: [
    { value: 'Si', label: 'Sí, portación completada' },
    { value: 'No', label: 'No, continúa pendiente' },
  ],
  allowBack: true,
}, [2040, 100]);
makeIf('IF Portacion Completada', '={{ $json.query.portacion_completada }}', 'Si', [3160, 100]);

const nip = makeFormSet('Estado NIP', {
  field: 'nip_estado',
  title: 'Revisar estado del {accent}',
  titleAccent: 'NIP',
  question: 'ESTADO ACTUAL DEL NIP',
  subtitle: 'Indica si el NIP ya fue recibido, continúa dentro del tiempo de espera o superó el plazo operativo.',
  tag: 'Diagnóstico · Espera NIP',
  options: [
    { value: 'Recibido', label: 'NIP recibido' },
    { value: 'Pendiente', label: 'Pendiente dentro del plazo' },
    { value: 'Vencido', label: 'Tiempo de espera vencido' },
  ],
  allowBack: true,
}, [3440, -350]);
makeIf('IF NIP Recibido', '={{ $json.query.nip_estado }}', 'Recibido', [4560, -350]);
makeIf('IF NIP Vencido', '={{ $json.query.nip_estado }}', 'Vencido', [4840, -350]);

const waitNip = makeFormSet('Confirmar Espera NIP', {
  field: 'espera_nip_confirmada',
  title: 'Registrar espera de {accent}',
  titleAccent: 'NIP',
  question: 'GESTIÓN PENDIENTE',
  subtitle: 'Guarda el caso como pendiente para revisarlo nuevamente cuando llegue el NIP.',
  tag: 'Diagnóstico · Pausa controlada',
  buttonLabel: 'Guardar estado',
  options: [{ value: 'Si', label: 'Dejar el caso pendiente' }],
  allowBack: true,
  final: true,
  outcome: 'espera_nip',
  nextStep: 'revisar_nip',
}, [5120, -50]);

const nipManager = makeFormSet('Escalar Gestor NIP', {
  field: 'gestor_nip_ok',
  title: 'Escalar vencimiento de {accent}',
  titleAccent: 'NIP',
  question: 'RESULTADO DEL ESCALAMIENTO',
  subtitle: 'El plazo operativo finalizó. Registra el envío del caso al gestor correspondiente.',
  tag: 'Diagnóstico · Escalamiento NIP',
  buttonLabel: 'Guardar y finalizar',
  options: [
    { value: 'Si', label: 'Caso escalado al gestor' },
    { value: 'No', label: 'Escalamiento pendiente' },
  ],
  allowBack: true,
  final: true,
  outcome: 'gestor_nip_vencido',
  nextStep: 'fin_etapa_2',
}, [5120, -650]);

const suma = makeFormSet('Validar SUMA', {
  field: 'suma_ok',
  title: 'Validar estado en {accent}',
  titleAccent: 'SUMA Móvil',
  question: '¿ESTÁ ACTIVO Y CON RECURSOS CARGADOS?',
  subtitle: 'Verifica que la línea se encuentre activa y que todos los recursos estén correctamente cargados.',
  tag: 'Diagnóstico · Validación SUMA',
  options: [
    { value: 'Si', label: 'Activo y con recursos' },
    { value: 'No', label: 'Inactivo o con recursos incompletos' },
  ],
  allowBack: true,
  handoffPath: 'etb-form-parte-2-continuar',
  handoffWhen: { suma_ok: 'Si' },
}, [3440, 800]);
makeIf('IF SUMA Activo y Recursos', '={{ $json.query.suma_ok }}', 'Si', [4560, 800]);

const sumaManager = makeFormSet('Escalar Gestor SUMA', {
  field: 'gestor_suma_ok',
  title: 'Escalar a gestor de {accent}',
  titleAccent: 'sincronización',
  question: 'RESULTADO DEL ESCALAMIENTO',
  subtitle: 'La línea no está activa o tiene recursos incompletos. Registra el escalamiento al gestor de sincronización.',
  tag: 'Diagnóstico · Escalamiento SUMA',
  buttonLabel: 'Guardar y finalizar',
  options: [
    { value: 'Si', label: 'Escalamiento realizado' },
    { value: 'No', label: 'Escalamiento pendiente' },
  ],
  allowBack: true,
  final: true,
  outcome: 'gestor_sincronizacion_suma',
  nextStep: 'fin_etapa_2',
}, [4840, 1050]);

add({
  parameters: {
    jsCode: `const source = ($json && $json.query) ? $json.query : ($json || {});
const raw = (key) => {
  const current = source[key];
  if (Array.isArray(current)) return current[0] ?? null;
  return current === undefined || current === '' ? null : current;
};
const outcome = raw('__outcome') ||
  (raw('reposicion_ok') ? 'reposicion_qr' :
  raw('espera_nip_confirmada') ? 'espera_nip' :
  raw('gestor_nip_ok') ? 'gestor_nip_vencido' :
  raw('gestor_suma_ok') ? 'gestor_sincronizacion_suma' :
  raw('suma_ok') === 'Si' ? 'continuar_parte_3' : 'fin_etapa_2');
const nextStep = raw('__next_step') ||
  (outcome === 'espera_nip' ? 'revisar_nip' :
  outcome === 'continuar_parte_3' ? 'parte_3_configuracion_equipo' : 'fin_etapa_2');
const tipoSim = raw('tipo_sim');
const rutaMulti = tipoSim === 'MultiSIM' ? raw('ruta_multisim') : null;
const rutaVirtual = tipoSim === 'eSIM' || (tipoSim === 'MultiSIM' && rutaMulti === 'Virtual');
const finalQr = outcome === 'reposicion_qr';
const lineaPortada = finalQr ? null : raw('linea_portada');
const portacion = lineaPortada === 'Si' ? raw('portacion_completada') : null;
const answers = {
  tipo_sim: tipoSim,
  ruta_multisim: rutaMulti,
  qr_escaneo_ok: rutaVirtual ? raw('qr_escaneo_ok') : null,
  qr_gestion: rutaVirtual ? raw('qr_gestion') : null,
  reposicion_ok: finalQr ? raw('reposicion_ok') : null,
  linea_portada: lineaPortada,
  portacion_completada: portacion,
  nip_estado: portacion === 'No' ? raw('nip_estado') : null,
  espera_nip_confirmada: outcome === 'espera_nip' ? raw('espera_nip_confirmada') : null,
  gestor_nip_ok: outcome === 'gestor_nip_vencido' ? raw('gestor_nip_ok') : null,
  suma_ok: ['continuar_parte_3','gestor_sincronizacion_suma'].includes(outcome) ? raw('suma_ok') : null,
  gestor_suma_ok: outcome === 'gestor_sincronizacion_suma' ? raw('gestor_suma_ok') : null,
  servicio_normalizado: null,
};
const absoluteBase = (candidate) => {
  const match = String(candidate || '').match(/^(https?:\\/\\/[^/]+)(\\/[^?#]*)?/i);
  if (!match) return '';
  const origin = match[1];
  const pathname = match[2] || '';
  const markers = ['/webhook-waiting/', '/webhook-test/', '/webhook/'];
  let basePath = '';
  for (const marker of markers) {
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex >= 0) { basePath = pathname.slice(0, markerIndex); break; }
  }
  return origin + basePath;
};
const workflowSession = raw('workflow_session') || '';
const publicBase = absoluteBase(($json && $json.webhookUrl) || '') || absoluteBase($execution.resumeUrl || '');
const handoffUrl = outcome === 'continuar_parte_3' && publicBase
  ? publicBase.replace(/\\\/$/, '') + '/webhook/etb-form-parte-3?workflow_session=' + encodeURIComponent(workflowSession)
  : '';
return [{ json: {
  workflow_session: workflowSession,
  execution_id: String($execution.id || ''),
  workflow_version: 'etapa2-v6-handoff-codificado-20260715',
  resultado_etapa_2: outcome,
  next_step: nextStep,
  handoff_url: handoffUrl,
  ...answers,
  respuestas_json: JSON.stringify(answers),
} }];`,
  },
  id: 'etapa2-preparar-registro-sql',
  name: 'Preparar Registro Etapa 2 SQL',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [6500, 200],
});

const save = clone(sourceNode('Guardar Respuestas MySQL'));
save.id = 'etapa2-guardar-mysql';
save.name = 'Guardar Etapa 2 MySQL';
save.position = [6780, 200];
save.parameters = {
  operation: 'executeQuery',
  query: 'INSERT INTO CRM.n8n_nsf_etapa2 (workflow_session, execution_id, workflow_version, resultado_etapa_2, next_step, tipo_sim, ruta_multisim, qr_escaneo_ok, qr_gestion, reposicion_ok, linea_portada, portacion_completada, nip_estado, espera_nip_confirmada, gestor_nip_ok, suma_ok, gestor_suma_ok, servicio_normalizado, respuestas_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON DUPLICATE KEY UPDATE execution_id=VALUES(execution_id), workflow_version=VALUES(workflow_version), resultado_etapa_2=VALUES(resultado_etapa_2), next_step=VALUES(next_step), tipo_sim=VALUES(tipo_sim), ruta_multisim=VALUES(ruta_multisim), qr_escaneo_ok=VALUES(qr_escaneo_ok), qr_gestion=VALUES(qr_gestion), reposicion_ok=VALUES(reposicion_ok), linea_portada=VALUES(linea_portada), portacion_completada=VALUES(portacion_completada), nip_estado=VALUES(nip_estado), espera_nip_confirmada=VALUES(espera_nip_confirmada), gestor_nip_ok=VALUES(gestor_nip_ok), suma_ok=VALUES(suma_ok), gestor_suma_ok=VALUES(gestor_suma_ok), servicio_normalizado=VALUES(servicio_normalizado), respuestas_json=VALUES(respuestas_json), updated_at=CURRENT_TIMESTAMP(3)',
  options: {
    queryBatching: 'single',
    queryReplacement: '={{ [ $json.workflow_session, $json.execution_id, $json.workflow_version, $json.resultado_etapa_2, $json.next_step, $json.tipo_sim, $json.ruta_multisim, $json.qr_escaneo_ok, $json.qr_gestion, $json.reposicion_ok, $json.linea_portada, $json.portacion_completada, $json.nip_estado, $json.espera_nip_confirmada, $json.gestor_nip_ok, $json.suma_ok, $json.gestor_suma_ok, $json.servicio_normalizado, $json.respuestas_json ] }}',
    replaceEmptyStrings: true,
    detailedOutput: true,
  },
};
save.notesInFlow = true;
save.notes = 'Selecciona la misma credencial MySQL CRM usada en la etapa 1. Base: CRM. Tabla: n8n_nsf_etapa2.';
save.onError = 'continueErrorOutput';
delete save.credentials;
add(save);

makeIf('IF Continuar Etapa 3', "={{ $('Preparar Registro Etapa 2 SQL').first().json.resultado_etapa_2 }}", 'continuar_parte_3', [7060, 200]);

const redirectStage3 = clone(respondTemplate);
redirectStage3.id = 'etapa2-redirigir-etapa3';
redirectStage3.name = 'Redirigir a Etapa 3';
redirectStage3.position = [7340, 20];
redirectStage3.parameters = {
  respondWith: 'redirect',
  redirectURL: "={{ $('Preparar Registro Etapa 2 SQL').first().json.handoff_url }}",
  options: {},
};
add(redirectStage3);

const finalRespond = clone(respondTemplate);
finalRespond.id = 'etapa2-responder-cierre';
finalRespond.name = 'Responder Cierre Etapa 2';
finalRespond.position = [7340, 380];
finalRespond.parameters = {
  respondWith: 'text',
  responseBody: 'OK',
  options: { responseCode: 200 },
};
add(finalRespond);

add({
  parameters: {
    jsCode: `const item = ($json && $json.item) ? $json.item : ($json || {});
let prepared = {};
let normalized = {};
try { prepared = $('Preparar Registro Etapa 2 SQL').first().json || {}; } catch (error) {}
try { normalized = $('Normalizar Handoff a Diagnostico de Equipo').first().json || {}; } catch (error) {}
if (!normalized.workflow_session) {
  try { normalized = $('Normalizar Entrada Etapa 2').first().json || {}; } catch (error) {}
}
const session = String(item.workflow_session || item.workflow_session_solicitada || prepared.workflow_session || normalized.workflow_session || 'no disponible');
const saving = Boolean(item.resultado_etapa_2 || prepared.resultado_etapa_2);
const phase = saving ? 'guardar la etapa 2' : 'consultar el contexto de la etapa 1';
const table = saving ? 'CRM.n8n_nsf_etapa2' : 'CRM.n8n_nsf_respuestas';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#071830"><title>ETB - Error de persistencia</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071830;color:#f0f6ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:18px}.card{width:min(100%,620px);background:#10284a;border:1px solid rgba(255,92,122,.36);border-radius:20px;padding:32px}.tag{color:#ff8fa3;font-size:12px;letter-spacing:.1em;text-transform:uppercase}.title{font-size:clamp(26px,6vw,36px);margin:14px 0}.copy{color:rgba(240,246,255,.75);font-size:15px;line-height:1.55}.details{margin-top:18px;padding:13px;border-radius:12px;background:#081a34;color:#38c7ff;overflow-wrap:anywhere}.hint{margin-top:16px;color:rgba(240,246,255,.58);font-size:13px;line-height:1.5}@media(max-width:480px){body{align-items:start;padding-top:28px}.card{padding:24px 18px}}</style></head><body><main class="card"><div class="tag">Error de persistencia</div><h1 class="title">No fue posible continuar</h1><p class="copy">MySQL presentó un error al ' + esc(phase) + '.</p><div class="details"><b>Sesión:</b> ' + esc(session) + '<br><b>Tabla:</b> ' + esc(table) + '</div><p class="hint">Verifica la credencial del nodo y la tabla indicada. Consulta la ejecución en n8n para ver el detalle técnico.</p></main></body></html>';
return [{ json: { html_response: html } }];`,
  },
  id: 'etapa2-html-error-persistencia',
  name: 'HTML Error Persistencia Etapa 2',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [7060, 650],
});

const persistenceErrorRespond = clone(respondTemplate);
persistenceErrorRespond.id = 'etapa2-responder-error-persistencia';
persistenceErrorRespond.name = 'Responder Error Persistencia Etapa 2';
persistenceErrorRespond.position = [7340, 650];
persistenceErrorRespond.parameters = {
  respondWith: 'text',
  responseBody: '={{ $json.html_response }}',
  options: { responseCode: 500 },
};
add(persistenceErrorRespond);

chain('Apertura Etapa 2', 'Normalizar Entrada Etapa 2', 'Consultar Contexto Etapa 1 MySQL', 'IF Contexto Etapa 1 Valido');
chain('Continuar directamente a Diagnostico de Equipo', 'Normalizar Handoff a Diagnostico de Equipo', 'Consultar Contexto Etapa 1 MySQL');
connect('IF Contexto Etapa 1 Valido', 0, 'IF Entrada por Handoff');
connect('IF Entrada por Handoff', 0, 'Preparar Handoff SQL y Continuidad');
connect('Preparar Handoff SQL y Continuidad', 0, 'Preparar Registro Etapa 2 SQL');
connect('IF Entrada por Handoff', 1, 'Preparar Contexto UI Etapa 2');
connect('Preparar Contexto UI Etapa 2', 0, 'IF Tipo SIM eSIM');
connect('IF Contexto Etapa 1 Valido', 1, 'HTML Contexto Invalido');
connect('HTML Contexto Invalido', 0, 'Responder Contexto Invalido');

connect('IF Tipo SIM eSIM', 0, qr.form);
connect('IF Tipo SIM eSIM', 1, 'IF Tipo SIM Fisica');
connect('IF Tipo SIM Fisica', 0, ported.form);
connect('IF Tipo SIM Fisica', 1, multi.form);

connect(multi.wait, 0, 'IF Ruta MultiSIM Virtual');
connect('IF Ruta MultiSIM Virtual', 0, qr.form);
connect('IF Ruta MultiSIM Virtual', 1, ported.form);

connect(qr.wait, 0, 'IF QR Escaneo OK');
connect('IF QR Escaneo OK', 0, ported.form);
connect('IF QR Escaneo OK', 1, qrManage.form);
connect(qrManage.back, 0, qr.form);
connect(qrManage.back, 1, 'IF QR Requiere Reposicion');
connect('IF QR Requiere Reposicion', 0, replacement.form);
connect('IF QR Requiere Reposicion', 1, qr.form);
connect(replacement.back, 0, qrManage.form);
connect(replacement.back, 1, 'Preparar Registro Etapa 2 SQL');

connect(ported.wait, 0, 'IF Linea Portada');
connect('IF Linea Portada', 0, portability.form);
connect('IF Linea Portada', 1, suma.form);
connect(portability.back, 0, ported.form);
connect(portability.back, 1, 'IF Portacion Completada');
connect('IF Portacion Completada', 0, suma.form);
connect('IF Portacion Completada', 1, nip.form);

connect(nip.back, 0, portability.form);
connect(nip.back, 1, 'IF NIP Recibido');
connect('IF NIP Recibido', 0, portability.form);
connect('IF NIP Recibido', 1, 'IF NIP Vencido');
connect('IF NIP Vencido', 0, nipManager.form);
connect('IF NIP Vencido', 1, waitNip.form);
connect(nipManager.back, 0, nip.form);
connect(nipManager.back, 1, 'Preparar Registro Etapa 2 SQL');
connect(waitNip.back, 0, nip.form);
connect(waitNip.back, 1, 'Preparar Registro Etapa 2 SQL');

connect(suma.back, 0, ported.form);
connect(suma.back, 1, 'IF SUMA Activo y Recursos');
connect('IF SUMA Activo y Recursos', 0, 'Preparar Registro Etapa 2 SQL');
connect('IF SUMA Activo y Recursos', 1, sumaManager.form);
connect(sumaManager.back, 0, suma.form);
connect(sumaManager.back, 1, 'Preparar Registro Etapa 2 SQL');

chain('Preparar Registro Etapa 2 SQL', 'Guardar Etapa 2 MySQL', 'IF Continuar Etapa 3');
connect('Consultar Contexto Etapa 1 MySQL', 1, 'HTML Error Persistencia Etapa 2');
connect('Guardar Etapa 2 MySQL', 1, 'HTML Error Persistencia Etapa 2');
connect('HTML Error Persistencia Etapa 2', 0, 'Responder Error Persistencia Etapa 2');
connect('IF Continuar Etapa 3', 0, 'Redirigir a Etapa 3');
connect('IF Continuar Etapa 3', 1, 'Responder Cierre Etapa 2');

const notes = [
  { id: 'inicio', pos: [-3680, -800], size: [1700, 1700], color: 5, text: '## 01 · Entradas y continuidad\n`etb-form-parte-2` abre las decisiones sin pantalla intermedia.\n\n`etb-form-parte-2-continuar` recibe la salida positiva de SUMA, guarda y redirige al diagnóstico del equipo sin depender de `webhook-waiting`.' },
  { id: 'tipo', pos: [-1900, -650], size: [2260, 1750], color: 6, text: '## 02 · Ruta por tipo de SIM\n- eSIM → validación de QR\n- Física → portabilidad\n- MultiSIM → selección explícita del componente afectado' },
  { id: 'qr', pos: [500, -1350], size: [3900, 650], color: 3, text: '## 03 · SIM virtual y QR\nValidar escaneo, reintentar o reenviar. Si no funciona, registrar reposición como salida controlada.' },
  { id: 'portabilidad', pos: [500, -150], size: [2800, 650], color: 4, text: '## 04 · Portabilidad\nLas líneas portadas se verifican en Portaflow y en la orden de SUMA. Las no portadas pasan directamente a SUMA.' },
  { id: 'nip', pos: [3320, -650], size: [2900, 1100], color: 2, text: '## 05 · Estado NIP\nSin plazo inventado: el asesor registra Recibido, Pendiente o Vencido.\n\nPendiente queda con `next_step = revisar_nip`; Vencido se escala al gestor.' },
  { id: 'suma', pos: [3320, 550], size: [2600, 1000], color: 5, text: '## 06 · SUMA Móvil\nValidar línea activa y recursos cargados.\n\nSí → guardar y continuar directamente a etapa 3.\nNo → gestor de sincronización.' },
  { id: 'sql', pos: [6400, -250], size: [1300, 1000], color: 7, text: '## 07 · Persistencia y continuidad\nUpsert en `CRM.n8n_nsf_etapa2`.\n\n`continuar_parte_3` → Redirect nativo a `etb-form-parte-3`.\nLos demás resultados cierran su ruta.' },
];
for (const note of notes) add({
  parameters: { content: note.text, height: note.size[1], width: note.size[0], color: note.color },
  id: `nota-etapa2-${note.id}`,
  name: `Nota Etapa 2 - ${note.id}`,
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: note.pos,
});

fs.writeFileSync(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
console.log(`Generado: ${path.basename(outputPath)}`);
console.log(`Nodos: ${workflow.nodes.length}`);
