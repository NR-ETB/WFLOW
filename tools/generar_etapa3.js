const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'Ningun Servicio Funciona - 2.json');
const outputPath = path.join(root, 'Ningun Servicio Funciona - 3.json');
const stage2 = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

function sourceNode(name) {
  const node = stage2.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No se encontró la plantilla ${name}`);
  return node;
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const slug = (value) => value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const workflow = {
  name: 'Ningun Servicio Funciona - 3',
  nodes: [],
  pinData: {},
  connections: {},
  active: false,
  settings: { executionOrder: 'v1' },
  versionId: 'etapa3-v3-responsive-homogeneo-20260715',
  meta: { templateCredsSetupCompleted: false },
  id: 'NingunServicioFuncionaEtapa3V1',
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

const formTemplate = sourceNode('Form Validar SUMA');
const respondTemplate = sourceNode('Enviar Validar SUMA');
const waitTemplate = sourceNode('Espera Validar SUMA');
const ifTemplate = sourceNode('IF SUMA Activo y Recursos');
const mysqlTemplate = sourceNode('Guardar Etapa 2 MySQL');
const baseFormCode = formTemplate.parameters.jsCode;
const compactContextCss = '@media(min-width:901px) and (max-width:1600px), (min-width:901px) and (max-height:900px){.card{width:min(100%,620px);padding:28px 30px}.title{font-size:32px}.copy,.code{font-size:14px}}';

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
    startPath: 'etb-form-parte-3',
    allowBack: Boolean(config.allowBack),
    backButtonLabel: 'Volver',
    finishToStart: false,
    finishToStartWhen: {},
    rendererVersion: 'etapa3-v1',
    finishMode: 'continue',
  };
  if (config.outcome) cfg.outcome = config.outcome;
  if (config.nextStep) cfg.nextStep = config.nextStep;
  return baseFormCode
    .replace(match[0], `const cfg = ${JSON.stringify(cfg)};`)
    .replaceAll('Etapa 2 finalizada', 'Diagnóstico finalizado')
    .replaceAll('cierre de esta etapa', 'cierre del diagnóstico')
    .replaceAll('etapa2-v1', 'etapa3-v1');
}

function buildSummaryFormCode() {
  const code = `const resumeUrl = $execution.resumeUrl;
const row = ($json && typeof $json === 'object') ? $json : {};
function esc(value){return String(value ?? '').replace(/[&<>"']/g, function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function parseJson(value){try{return typeof value === 'object' && value ? value : JSON.parse(String(value || '{}'))}catch{return {}}}
function text(value, fallback){const current = Array.isArray(value) ? value[0] : value;return current === undefined || current === null || current === '' ? (fallback || 'No aplica') : String(current)}
function label(value){const labels={
  continuar_parte_2:'Continuó al diagnóstico de SIM', continuar_parte_3:'Continuó al diagnóstico del equipo',
  pqr_solucionada_configuracion:'Servicio recuperado mediante configuración',
  pqr_solucionada_falla_dispositivo:'Falla identificada en el dispositivo',
  pqr_solucionada_reinicio_sim:'Servicio recuperado después del reinicio',
  escalado_segundo_nivel:'Caso escalado a segundo nivel', gestfac:'Enviado a GESTFAC',
  gestor_sincronizacion:'Escalado por sincronización', espera_nip:'En espera de NIP',
  Si:'Sí', No:'No', DatosRed:'Datos o red', Llamadas:'Llamadas', Ambas:'Datos/red y llamadas',
  Revisada:'Revisada y aplicada', Fisica:'SIM física', eSIM:'eSIM', Virtual:'eSIM'
};return labels[value] || text(value)}
function chips(entries){return entries.filter(function(item){return item[1] !== undefined && item[1] !== null && item[1] !== ''}).map(function(item){return '<span class="chip"><b>'+esc(item[0])+':</b> '+esc(label(item[1]))+'</span>'}).join('') || '<span class="chip muted">Sin datos adicionales</span>'}
const a1=parseJson(row.respuestas_etapa_1_json);
const a2=parseJson(row.respuestas_etapa_2_json);
const a3=parseJson(row.respuestas_etapa_3_json);
const session=text(row.workflow_session,'');
const outcome=label(row.resultado_etapa_3);
const html='<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#071830"><title>ETB - Resumen de la gestión</title><style>*{box-sizing:border-box}:root{color-scheme:dark;--bg:#071830;--card:#10284a;--panel:#081a34;--line:#1a416d;--blue:#1da1f2;--cyan:#38c7ff;--white:#f0f6ff;--muted:rgba(240,246,255,.68);--green:#42e68b;--danger:#ff8fa3}html{min-height:100%;-webkit-text-size-adjust:100%}body{margin:0;min-height:100vh;min-height:100svh;background:var(--bg);color:var(--white);font-family:DM Sans,system-ui,-apple-system,Segoe UI,sans-serif;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));display:grid;place-items:center}.card{width:min(100%,980px);background:var(--card);border:1px solid rgba(29,161,242,.28);border-radius:22px;padding:clamp(22px,4vw,38px);box-shadow:0 30px 80px rgba(0,0,0,.62)}.tag{color:var(--cyan);font-size:11px;letter-spacing:.12em;text-transform:uppercase}.title{font-size:clamp(25px,4vw,38px);line-height:1.12;margin:10px 0 8px}.sub{color:var(--muted);line-height:1.5;margin:0 0 18px}.outcome{display:flex;align-items:center;gap:12px;background:rgba(66,230,139,.1);border:1px solid rgba(66,230,139,.38);border-radius:14px;padding:13px 16px;margin-bottom:16px}.ok{display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px;border-radius:50%;background:rgba(66,230,139,.16);color:var(--green);font-size:20px}.outcome small{display:block;color:var(--muted);margin-bottom:2px}.timeline{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 18px}.step{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:15px;min-width:0}.step-no{display:inline-grid;place-items:center;width:27px;height:27px;border-radius:50%;background:rgba(29,161,242,.18);border:1px solid rgba(56,199,255,.48);color:var(--cyan);font-weight:700;font-size:12px}.step h2{font-size:15px;margin:9px 0 4px}.step-result{font-size:12px;color:var(--muted);min-height:32px;margin-bottom:9px}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{font-size:11px;line-height:1.35;padding:5px 8px;background:rgba(29,161,242,.09);border:1px solid rgba(29,161,242,.2);border-radius:8px;overflow-wrap:anywhere}.chip b{color:var(--cyan)}.muted{color:var(--muted)}.field-label{display:block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 7px}.help{font-size:12px;color:var(--muted);line-height:1.45;margin:0 0 8px}.textarea{display:block;width:100%;min-height:112px;resize:vertical;border:1px solid var(--line);border-radius:13px;background:var(--panel);color:var(--white);font:inherit;line-height:1.5;padding:13px 14px;outline:none}.textarea:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(29,161,242,.16)}.counter{font-size:11px;color:var(--muted);text-align:right;margin:5px 2px 10px}.error{display:none;color:var(--danger);font-size:12px;margin:7px 0}.btn{width:100%;height:52px;border:0;border-radius:13px;background:linear-gradient(135deg,#1da1f2,#0d80cc);color:white;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 12px 28px rgba(29,161,242,.35)}.btn:disabled{opacity:.55;cursor:wait}.session{margin-top:12px;text-align:center;color:rgba(240,246,255,.35);font-size:10px;overflow-wrap:anywhere}@media(max-width:760px){body{display:block}.card{border-radius:17px;padding:20px 16px}.timeline{grid-template-columns:1fr}.step-result{min-height:0}.textarea{min-height:145px}.outcome{align-items:flex-start}}@media(min-width:761px) and (max-width:1600px), (min-width:761px) and (max-height:900px){body{padding:10px}.card{width:min(100%,840px);padding:22px 24px;border-radius:18px}.title{font-size:28px}.sub{font-size:14px;margin-bottom:12px}.outcome{padding:10px 13px;margin-bottom:12px}.timeline{gap:9px;margin-bottom:13px}.step{padding:11px}.step h2{margin:6px 0 3px}.step-result{min-height:28px;margin-bottom:6px}.textarea{min-height:86px;padding:10px 12px}.btn{height:47px}}@media(max-height:620px) and (orientation:landscape){body{display:block}.card{margin:auto}.timeline{grid-template-columns:repeat(3,1fr)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}</style></head><body><main class="card"><div class="tag">Cierre de la gestión · Sesión actual</div><h1 class="title">Resumen para el asesor</h1><p class="sub">Revisa la ruta recorrida y deja una evidencia breve y concreta de la atención realizada.</p><section class="outcome"><span class="ok" aria-hidden="true">✓</span><div><small>Resultado técnico</small><strong>'+esc(outcome)+'</strong></div></section><section class="timeline" aria-label="Trazabilidad de la gestión"><article class="step"><span class="step-no">1</span><h2>Validación inicial</h2><div class="step-result">'+esc(label(row.resultado_etapa_1))+'</div><div class="chips">'+chips([['SIM',a1.tipo_sim],['Línea',a1.linea_activa],['Pagos',a1.pago_al_dia],['ICCID',a1.iccid_valido]])+'</div></article><article class="step"><span class="step-no">2</span><h2>Diagnóstico de SIM</h2><div class="step-result">'+esc(label(row.resultado_etapa_2))+'</div><div class="chips">'+chips([['QR',a2.qr_escaneo_ok],['Portada',a2.linea_portada],['Portación',a2.portacion_completada],['SUMA',a2.suma_ok]])+'</div></article><article class="step"><span class="step-no">3</span><h2>Diagnóstico del equipo</h2><div class="step-result">'+esc(outcome)+'</div><div class="chips">'+chips([['Falla',a3.tipo_falla_equipo],['Equipo',a3.tipo_equipo_cliente],['Configuración',a3.configuracion_funciono],['Prueba cruzada',a3.prueba_cruzada_funciono],['Reinicio',a3.reinicio_sim_resultado]])+'</div></article></section><form id="closeForm" method="GET" action="'+esc(resumeUrl || '')+'" novalidate><input type="hidden" name="workflow_session" value="'+esc(session)+'"><label class="field-label" for="observaciones">Observaciones del asesor</label><p class="help">Indica qué validaste, qué acción ejecutaste, qué informó el cliente y cómo quedó el servicio o el escalamiento.</p><textarea class="textarea" id="observaciones" name="observaciones_asesor" minlength="10" maxlength="2000" required placeholder="Ejemplo: Se validó la configuración de datos, se aplicaron los parámetros indicados y el cliente confirmó navegación y llamadas..."></textarea><div class="error" id="error" role="alert">Escribe una observación de al menos 10 caracteres.</div><div class="counter"><span id="count">0</span>/2000</div><button class="btn" id="submit" type="submit">Guardar observaciones y cerrar gestión</button></form><div class="session">Gestión: '+esc(session)+'</div></main><script>(function(){var form=document.getElementById('closeForm'),field=document.getElementById('observaciones'),error=document.getElementById('error'),count=document.getElementById('count'),button=document.getElementById('submit');field.addEventListener('input',function(){count.textContent=String(field.value.length);error.style.display='none'});form.addEventListener('submit',function(event){if(field.value.trim().length<10){event.preventDefault();error.style.display='block';field.focus();return}button.disabled=true;button.textContent='Guardando cierre...'});})();</'+'script></body></html>';
return [{json:{html_response:html}}];`;
  return code
    .replaceAll("getElementById('closeForm')", 'getElementById("closeForm")')
    .replaceAll("getElementById('observaciones')", 'getElementById("observaciones")')
    .replaceAll("getElementById('error')", 'getElementById("error")')
    .replaceAll("getElementById('count')", 'getElementById("count")')
    .replaceAll("getElementById('submit')", 'getElementById("submit")')
    .replaceAll("addEventListener('input'", 'addEventListener("input"')
    .replaceAll("addEventListener('submit'", 'addEventListener("submit"')
    .replaceAll("style.display='none'", 'style.display="none"')
    .replaceAll("style.display='block'", 'style.display="block"')
    .replaceAll("textContent='Guardando cierre...'", 'textContent="Guardando cierre..."');
}

function buildFinalClosureCode() {
  return `const summary = $('Consultar Resumen Gestion Actual').item.json || {};
const observation = $('Preparar Observaciones Asesor').item.json || {};
function esc(value){return String(value ?? '').replace(/[&<>"']/g, function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
const labels={pqr_solucionada_configuracion:'Servicio recuperado mediante configuración',pqr_solucionada_falla_dispositivo:'Falla identificada en el dispositivo',pqr_solucionada_reinicio_sim:'Servicio recuperado después del reinicio',escalado_segundo_nivel:'Caso escalado a segundo nivel'};
const result=labels[summary.resultado_etapa_3] || String(summary.resultado_etapa_3 || 'Gestión registrada');
const html='<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#071830"><title>ETB - Gestión cerrada</title><style>*{box-sizing:border-box}:root{color-scheme:dark}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;background:#071830;color:#f0f6ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}.card{width:min(100%,720px);background:#10284a;border:1px solid rgba(66,230,139,.34);border-radius:20px;padding:clamp(24px,5vw,42px);box-shadow:0 28px 70px rgba(0,0,0,.55)}.icon{display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:rgba(66,230,139,.13);border:1px solid rgba(66,230,139,.5);color:#63e89e;font-size:29px;margin-bottom:17px}.tag{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#63e89e}.title{font-size:clamp(27px,5vw,39px);margin:9px 0}.copy{color:rgba(240,246,255,.7);line-height:1.55}.result{margin:18px 0 10px;padding:13px 15px;border-radius:12px;background:#081a34;border-left:3px solid #38c7ff}.result small{display:block;color:rgba(240,246,255,.55);margin-bottom:4px}.quote{margin:10px 0 0;padding:15px;border-radius:12px;background:rgba(29,161,242,.08);border:1px solid rgba(29,161,242,.22);line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.session{margin-top:16px;color:rgba(240,246,255,.35);font-size:10px;overflow-wrap:anywhere}@media(min-width:761px) and (max-width:1600px), (min-width:761px) and (max-height:900px){.card{width:min(100%,620px);padding:27px 30px}.title{font-size:31px}}@media(max-width:480px){body{display:block}.card{padding:24px 18px;border-radius:17px}}</style></head><body><main class="card"><div class="icon" aria-hidden="true">✓</div><div class="tag">Cierre confirmado</div><h1 class="title">Gestión finalizada</h1><p class="copy">El resultado y las observaciones quedaron asociados únicamente a esta sesión.</p><div class="result"><small>Resultado final</small><strong>'+esc(result)+'</strong></div><div class="quote"><strong>Observaciones del asesor</strong><br>'+esc(observation.observaciones_asesor)+'</div><div class="session">Gestión: '+esc(observation.workflow_session)+'</div></main></body></html>';
return [{json:{html_response:html}}];`;
}

function makeIf(name, expression, expected, position) {
  const node = clone(ifTemplate);
  node.id = `etapa3-if-${slug(name)}`;
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

function makeIfAny(name, expression, expectedValues, position) {
  const node = clone(ifTemplate);
  node.id = `etapa3-if-${slug(name)}`;
  node.name = name;
  node.position = position;
  node.parameters.conditions.conditions = expectedValues.map((expected, index) => ({
    id: `cond-${slug(name)}-${index + 1}`,
    leftValue: expression,
    rightValue: expected,
    operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
  }));
  node.parameters.conditions.combinator = 'or';
  return add(node);
}

function makeFormSet(label, config, position) {
  const [x, y] = position;
  const step = 280;
  const form = clone(formTemplate);
  form.id = `etapa3-form-${slug(label)}`;
  form.name = `Form ${label}`;
  form.position = [x, y];
  form.parameters.jsCode = buildFormCode(config);
  add(form);

  const send = clone(respondTemplate);
  send.id = `etapa3-enviar-${slug(label)}`;
  send.name = `Enviar ${label}`;
  send.position = [x + step, y];
  add(send);

  const wait = clone(waitTemplate);
  wait.id = `etapa3-espera-${slug(label)}`;
  wait.name = `Espera ${label}`;
  wait.webhookId = `etapa3-${slug(label)}`;
  wait.position = [x + (step * 2), y];
  add(wait);

  let back = null;
  if (config.allowBack) back = makeIf(`IF Volver ${label}`, '={{ $json.query.__back }}', '1', [x + (step * 3), y]);
  chain(form.name, send.name, wait.name);
  if (back) connect(wait.name, 0, back.name);
  return { form: form.name, send: send.name, wait: wait.name, back: back?.name || null };
}

const webhook = clone(sourceNode('Apertura Etapa 2'));
webhook.id = 'etapa3-webhook-apertura';
webhook.name = 'Apertura Etapa 3';
webhook.webhookId = 'etb-form-parte-3';
webhook.position = [-3600, 0];
webhook.parameters.httpMethod = 'GET';
webhook.parameters.path = 'etb-form-parte-3';
webhook.parameters.responseMode = 'responseNode';
webhook.parameters.options = { allowedOrigins: '*' };
add(webhook);

add({
  parameters: {
    jsCode: `const query = ($json && $json.query) ? $json.query : {};
const raw = Array.isArray(query.workflow_session) ? query.workflow_session[0] : query.workflow_session;
const workflowSession = String(raw || '').trim();
return [{ json: { workflow_session: workflowSession || '__missing__' } }];`,
  },
  id: 'etapa3-normalizar-entrada',
  name: 'Normalizar Entrada Etapa 3',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-3320, 0],
});

const lookup = clone(mysqlTemplate);
lookup.id = 'etapa3-consultar-etapa2-mysql';
lookup.name = 'Consultar Contexto Etapa 2 MySQL';
lookup.position = [-3040, 0];
lookup.parameters = {
  operation: 'executeQuery',
  query: "SELECT $1 AS workflow_session_solicitada, DATABASE() AS esquema_credencial, COUNT(*) AS coincidencias, IF(COUNT(*) = 1, 'Si', 'No') AS contexto_valido, MAX(workflow_session) AS workflow_session, MAX(tipo_sim) AS tipo_sim, MAX(resultado_etapa_2) AS resultado_etapa_2, MAX(next_step) AS next_step, MAX(suma_ok) AS suma_ok FROM CRM.n8n_nsf_etapa2 WHERE workflow_session = $2 AND resultado_etapa_2 = 'continuar_parte_3' AND next_step = 'parte_3_configuracion_equipo' AND suma_ok = 'Si'",
  options: {
    queryBatching: 'single',
      queryReplacement: '={{ [ $json.workflow_session, $json.workflow_session ] }}',
    replaceEmptyStrings: true,
    detailedOutput: false,
  },
};
lookup.notesInFlow = true;
lookup.notes = 'Selecciona la credencial MySQL CRM. Valida el contrato persistido por la etapa 2.';
delete lookup.credentials;
add(lookup);

makeIf('IF Contexto Etapa 2 Valido', '={{ $json.contexto_valido }}', 'Si', [-2760, 0]);

add({
  parameters: {
    jsCode: `const session = String($json.workflow_session || $json.workflow_session_solicitada || '');
const tipo = String($json.tipo_sim || '');
return [{ json: { query: { workflow_session: session, tipo_sim: tipo } } }];`,
  },
  id: 'etapa3-preparar-contexto-ui',
  name: 'Preparar Contexto UI Etapa 3',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-2480, -300],
});

add({
  parameters: {
    jsCode: `const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#071830"><title>ETB - Contexto no válido</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071830;color:#f0f6ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:18px}.card{width:min(100%,720px);background:#10284a;border:1px solid rgba(29,161,242,.25);border-radius:20px;padding:clamp(24px,5vw,44px);box-shadow:0 28px 70px rgba(0,0,0,.55)}.tag{color:#ff8fa3;font-size:12px;letter-spacing:.1em;text-transform:uppercase}.title{font-size:clamp(26px,6vw,40px);margin:14px 0}.copy{color:rgba(240,246,255,.72);font-size:16px;line-height:1.6}.code{margin-top:20px;padding:14px;border-radius:12px;background:#081a34;color:#38c7ff;overflow-wrap:anywhere}</style></head><body><main class="card"><div class="tag">Acceso no válido</div><h1 class="title">No fue posible recuperar la gestión</h1><p class="copy">La gestión anterior no terminó en la ruta de configuración del equipo.</p><div class="code">Inicia nuevamente desde el comienzo y conserva workflow_session.</div></main></body></html>';
return [{ json: { html_response: html } }];`,
  },
  id: 'etapa3-contexto-invalido-html',
  name: 'HTML Contexto Invalido Etapa 3',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [-2480, 500],
});

const invalidContextNode = workflow.nodes.find((node) => node.name === 'HTML Contexto Invalido Etapa 3');
if (invalidContextNode && !invalidContextNode.parameters.jsCode.includes(compactContextCss)) {
  invalidContextNode.parameters.jsCode = invalidContextNode.parameters.jsCode.replace('</style>', `${compactContextCss}</style>`);
}

const invalidRespond = clone(respondTemplate);
invalidRespond.id = 'etapa3-responder-contexto-invalido';
invalidRespond.name = 'Responder Contexto Invalido Etapa 3';
invalidRespond.position = [-2200, 500];
invalidRespond.parameters.options = { responseCode: 400 };
add(invalidRespond);

const failure = makeFormSet('Verificar Configuracion Equipo', {
  field: 'tipo_falla_equipo',
  title: 'Verificar configuración del {accent}',
  titleAccent: 'equipo móvil',
  question: 'TIPO DE FALLA ACTUAL',
  subtitle: 'Selecciona el síntoma que continúa después de validar la línea y los recursos en SUMA Móvil.',
  tag: 'Diagnóstico · Configuración del equipo',
  options: [
    { value: 'DatosRed', label: 'Falla de datos o red' },
    { value: 'Llamadas', label: 'Falla en llamadas' },
    { value: 'Ambas', label: 'Datos/red y llamadas' },
  ],
  allowBack: false,
}, [-2200, -300]);
makeIfAny('IF Falla Datos o Red', '={{ $json.query.tipo_falla_equipo }}', ['DatosRed', 'Ambas'], [-1360, -300]);

const equipment = makeFormSet('Confirmar Equipo Cliente', {
  field: 'tipo_equipo_cliente',
  title: 'Confirmar el {accent}',
  titleAccent: 'equipo del cliente',
  question: 'TIPO DE EQUIPO',
  subtitle: 'Identifica el equipo antes de consultar la plataforma de configuración. No registres nombres, teléfonos ni IMEI en la URL.',
  tag: 'Diagnóstico · Identificación del equipo',
  options: [
    { value: 'Android', label: 'Equipo Android' },
    { value: 'iPhone', label: 'Apple iPhone' },
    { value: 'Otro', label: 'Otro equipo homologado' },
  ],
  allowBack: true,
}, [-1080, -950]);

const configure = makeFormSet('Configurar Equipo Plataforma', {
  field: 'configuracion_plataforma',
  title: 'Consultar y configurar el {accent}',
  titleAccent: 'equipo',
  question: 'CONFIGURACIÓN DE DATOS Y RED',
  subtitle: 'Consulta el equipo en la plataforma operativa definida y aplica únicamente la configuración relacionada con datos y red.',
  tag: 'Diagnóstico · Plataforma de configuración',
  options: [{ value: 'Revisada', label: 'Configuración revisada y aplicada' }],
  allowBack: true,
}, [40, -950]);

const configResult = makeFormSet('Resultado Configuracion', {
  field: 'configuracion_funciono',
  title: 'Validar resultado de la {accent}',
  titleAccent: 'configuración',
  question: '¿FUNCIONÓ DESPUÉS DE CONFIGURAR?',
  subtitle: 'Confirma con el cliente si se recuperaron los servicios afectados.',
  tag: 'Diagnóstico · Resultado de configuración',
  options: [
    { value: 'Si', label: 'Sí, el servicio funciona' },
    { value: 'No', label: 'No funcionó' },
  ],
  allowBack: true,
}, [1160, -950]);
makeIf('IF Configuracion Funciono', '={{ $json.query.configuracion_funciono }}', 'Si', [2280, -950]);

const solvedConfig = makeFormSet('PQR Solucionada Configuracion', {
  field: 'pqr_configuracion_ok',
  title: 'Cerrar PQR por {accent}',
  titleAccent: 'configuración solucionada',
  question: 'CONFIRMACIÓN DEL CIERRE',
  subtitle: 'Confirma que el servicio fue validado con el cliente y que la PQR quedó en estado solucionado.',
  tag: 'Diagnóstico · Solución por configuración',
  buttonLabel: 'Continuar al resumen',
  options: [{ value: 'Si', label: 'PQR actualizada como solucionada' }],
  allowBack: true,
  final: true,
  outcome: 'pqr_solucionada_configuracion',
  nextStep: 'cierre_asesor',
}, [2560, -1350]);

const alternate = makeFormSet('Validar Dispositivo Alterno', {
  field: 'dispositivo_alterno',
  title: 'Validar otro {accent}',
  titleAccent: 'dispositivo',
  question: '¿HAY OTRO EQUIPO DISPONIBLE?',
  subtitle: 'Confirma si se puede realizar una prueba cruzada insertando la misma SIM en otro equipo liberado y en buen estado.',
  tag: 'Diagnóstico · Prueba cruzada',
  options: [
    { value: 'Si', label: 'Sí, hay otro dispositivo' },
    { value: 'No', label: 'No hay otro dispositivo' },
  ],
  allowBack: true,
}, [2560, 100]);
makeIfAny('IF Volver Alterno Desde Datos', '={{ $json.query.tipo_falla_equipo }}', ['DatosRed', 'Ambas'], [3680, -180]);
makeIf('IF Dispositivo Alterno', '={{ $json.query.dispositivo_alterno }}', 'Si', [3680, 100]);

const crossTest = makeFormSet('Prueba Cruzada SIM', {
  field: 'prueba_cruzada_funciono',
  title: 'Probar la SIM en {accent}',
  titleAccent: 'otro equipo',
  question: 'RESULTADO DE LA PRUEBA CRUZADA',
  subtitle: 'Retira la SIM del equipo afectado e insértala en un dispositivo liberado y en buen estado. Valida red, llamadas y datos móviles.',
  tag: 'Diagnóstico · Cambio de dispositivo',
  options: [
    { value: 'Si', label: 'Reconoce red, llamadas y datos' },
    { value: 'No', label: 'La falla continúa' },
  ],
  allowBack: true,
}, [3960, -100]);
makeIf('IF Prueba Cruzada Funciono', '={{ $json.query.prueba_cruzada_funciono }}', 'Si', [5080, -100]);

const solvedDevice = makeFormSet('PQR Solucionada Dispositivo', {
  field: 'pqr_dispositivo_ok',
  title: 'Confirmar falla del {accent}',
  titleAccent: 'dispositivo',
  question: 'CIERRE POR FALLA DEL EQUIPO',
  subtitle: 'La SIM funciona en otro equipo. Confirma al cliente que la novedad corresponde al dispositivo y deja la PQR solucionada.',
  tag: 'Diagnóstico · Error del dispositivo',
  buttonLabel: 'Continuar al resumen',
  options: [{ value: 'Si', label: 'Cliente informado y PQR solucionada' }],
  allowBack: true,
  final: true,
  outcome: 'pqr_solucionada_falla_dispositivo',
  nextStep: 'cierre_asesor',
}, [5360, -650]);

const restart = makeFormSet('Reiniciar y Reinsertar SIM', {
  field: 'reinicio_sim_resultado',
  title: 'Reiniciar y reinstalar la {accent}',
  titleAccent: 'SIM',
  question: 'RESULTADO DESPUÉS DEL REINICIO',
  subtitle: 'Apaga el equipo, retira la SIM, espera 20 segundos, insértala correctamente y enciende nuevamente. Luego valida el servicio.',
  tag: 'Diagnóstico · Reinicio del equipo',
  options: [
    { value: 'Si', label: 'Sí, el servicio funciona' },
    { value: 'No', label: 'No, la falla continúa' },
  ],
  allowBack: true,
}, [5360, 450]);
makeIf('IF Volver Reinicio Desde Prueba', '={{ $json.query.dispositivo_alterno }}', 'Si', [6480, 170]);
makeIf('IF Reinicio Funciono', '={{ $json.query.reinicio_sim_resultado }}', 'Si', [6480, 450]);

const solvedRestart = makeFormSet('PQR Solucionada Reinicio', {
  field: 'pqr_reinicio_ok',
  title: 'Cerrar PQR por {accent}',
  titleAccent: 'reinicio exitoso',
  question: 'CONFIRMACIÓN DEL CIERRE',
  subtitle: 'Confirma con el cliente que el servicio funciona y deja la PQR en estado solucionado.',
  tag: 'Diagnóstico · Solución por reinicio',
  buttonLabel: 'Continuar al resumen',
  options: [{ value: 'Si', label: 'PQR actualizada como solucionada' }],
  allowBack: true,
  final: true,
  outcome: 'pqr_solucionada_reinicio_sim',
  nextStep: 'cierre_asesor',
}, [6760, 100]);

const escalation = makeFormSet('Escalar Segundo Nivel', {
  field: 'escalamiento_segundo_nivel',
  title: 'Escalar a {accent}',
  titleAccent: 'segundo nivel',
  question: 'PLANTILLA DE ESCALAMIENTO',
  subtitle: 'Completa la plantilla operativa con servicio afectado, marca/modelo/IMEI, reportes, homologación, listas negras, bloqueos, datos de contacto, ciudad, recursos en Charging-SI y estado de pagos. No uses datos personales de ejemplo.',
  tag: 'Diagnóstico · Escalamiento técnico',
  buttonLabel: 'Continuar al resumen',
  options: [{ value: 'Si', label: 'Escalamiento enviado a segundo nivel' }],
  allowBack: true,
  final: true,
  outcome: 'escalado_segundo_nivel',
  nextStep: 'cierre_asesor',
}, [6760, 850]);

add({
  parameters: {
    jsCode: `const source = ($json && $json.query) ? $json.query : ($json || {});
const raw = (key) => {
  const current = source[key];
  if (Array.isArray(current)) return current[0] ?? null;
  return current === undefined || current === '' ? null : current;
};
const outcome = raw('__outcome') ||
  (raw('pqr_configuracion_ok') ? 'pqr_solucionada_configuracion' :
  raw('pqr_dispositivo_ok') ? 'pqr_solucionada_falla_dispositivo' :
  raw('pqr_reinicio_ok') ? 'pqr_solucionada_reinicio_sim' :
  raw('escalamiento_segundo_nivel') ? 'escalado_segundo_nivel' : 'fin_etapa_3');
const answers = {
  tipo_falla_equipo: raw('tipo_falla_equipo'),
  tipo_equipo_cliente: raw('tipo_equipo_cliente'),
  configuracion_plataforma: raw('configuracion_plataforma'),
  configuracion_funciono: raw('configuracion_funciono'),
  dispositivo_alterno: raw('dispositivo_alterno'),
  prueba_cruzada_funciono: raw('prueba_cruzada_funciono'),
  reinicio_sim_resultado: raw('reinicio_sim_resultado'),
  pqr_configuracion_ok: outcome === 'pqr_solucionada_configuracion' ? raw('pqr_configuracion_ok') : null,
  pqr_dispositivo_ok: outcome === 'pqr_solucionada_falla_dispositivo' ? raw('pqr_dispositivo_ok') : null,
  pqr_reinicio_ok: outcome === 'pqr_solucionada_reinicio_sim' ? raw('pqr_reinicio_ok') : null,
  escalamiento_segundo_nivel: outcome === 'escalado_segundo_nivel' ? raw('escalamiento_segundo_nivel') : null,
};
return [{ json: {
  workflow_session: raw('workflow_session') || raw('__workflow_session') || '',
  execution_id: String($execution.id || ''),
  workflow_version: 'etapa3-v3-responsive-homogeneo-20260715',
  resultado_etapa_3: outcome,
  next_step: raw('__next_step') || 'fin_flujo',
  ...answers,
  respuestas_json: JSON.stringify(answers),
} }];`,
  },
  id: 'etapa3-preparar-registro-sql',
  name: 'Preparar Registro Etapa 3 SQL',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [8000, 350],
});

const save = clone(mysqlTemplate);
save.id = 'etapa3-guardar-mysql';
save.name = 'Guardar Etapa 3 MySQL';
save.position = [8280, 350];
save.parameters = {
  operation: 'executeQuery',
  query: 'INSERT INTO CRM.n8n_nsf_etapa3 (workflow_session, execution_id, workflow_version, resultado_etapa_3, next_step, tipo_falla_equipo, tipo_equipo_cliente, configuracion_plataforma, configuracion_funciono, dispositivo_alterno, prueba_cruzada_funciono, reinicio_sim_resultado, pqr_configuracion_ok, pqr_dispositivo_ok, pqr_reinicio_ok, escalamiento_segundo_nivel, respuestas_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON DUPLICATE KEY UPDATE execution_id=VALUES(execution_id), workflow_version=VALUES(workflow_version), resultado_etapa_3=VALUES(resultado_etapa_3), next_step=VALUES(next_step), tipo_falla_equipo=VALUES(tipo_falla_equipo), tipo_equipo_cliente=VALUES(tipo_equipo_cliente), configuracion_plataforma=VALUES(configuracion_plataforma), configuracion_funciono=VALUES(configuracion_funciono), dispositivo_alterno=VALUES(dispositivo_alterno), prueba_cruzada_funciono=VALUES(prueba_cruzada_funciono), reinicio_sim_resultado=VALUES(reinicio_sim_resultado), pqr_configuracion_ok=VALUES(pqr_configuracion_ok), pqr_reinicio_ok=VALUES(pqr_reinicio_ok), escalamiento_segundo_nivel=VALUES(escalamiento_segundo_nivel), respuestas_json=VALUES(respuestas_json), updated_at=CURRENT_TIMESTAMP(3)',
  options: {
    queryBatching: 'single',
    queryReplacement: '={{ [ $json.workflow_session, $json.execution_id, $json.workflow_version, $json.resultado_etapa_3, $json.next_step, $json.tipo_falla_equipo, $json.tipo_equipo_cliente, $json.configuracion_plataforma, $json.configuracion_funciono, $json.dispositivo_alterno, $json.prueba_cruzada_funciono, $json.reinicio_sim_resultado, $json.pqr_configuracion_ok, $json.pqr_dispositivo_ok, $json.pqr_reinicio_ok, $json.escalamiento_segundo_nivel, $json.respuestas_json ] }}',
    replaceEmptyStrings: true,
    detailedOutput: true,
  },
};
save.notesInFlow = true;
save.notes = 'Selecciona la credencial MySQL CRM. Tabla: n8n_nsf_etapa3.';
delete save.credentials;
add(save);

const summaryQuery = clone(mysqlTemplate);
summaryQuery.id = 'etapa3-consultar-resumen-gestion';
summaryQuery.name = 'Consultar Resumen Gestion Actual';
summaryQuery.position = [8560, 350];
summaryQuery.parameters = {
  operation: 'executeQuery',
  query: `SELECT
 MAX(workflowSession) AS workflow_session,
 COUNT(*) AS etapas_registradas,
 MAX(CASE WHEN numeroEtapa = 1 THEN resultado END) AS resultado_etapa_1,
 MAX(CASE WHEN numeroEtapa = 2 THEN resultado END) AS resultado_etapa_2,
 MAX(CASE WHEN numeroEtapa = 3 THEN resultado END) AS resultado_etapa_3,
 MAX(CASE WHEN numeroEtapa = 1 THEN CAST(respuestasJson AS CHAR) END) AS respuestas_etapa_1_json,
 MAX(CASE WHEN numeroEtapa = 2 THEN CAST(respuestasJson AS CHAR) END) AS respuestas_etapa_2_json,
 MAX(CASE WHEN numeroEtapa = 3 THEN CAST(respuestasJson AS CHAR) END) AS respuestas_etapa_3_json
FROM CRM.GestionesFlujosLog
WHERE workflowSession = $1
  AND codigoFlujo = 'ningunServicioFunciona'
GROUP BY workflowSession
LIMIT 1`,
  options: {
    queryBatching: 'single',
    queryReplacement: "={{ [ $('Preparar Registro Etapa 3 SQL').item.json.workflow_session ] }}",
    replaceEmptyStrings: true,
    detailedOutput: false,
  },
};
summaryQuery.notesInFlow = true;
summaryQuery.notes = 'Consulta exclusivamente la workflowSession que acaba de cerrar su resultado tecnico. No usa una gestion general ni la ultima fila global.';
delete summaryQuery.credentials;
add(summaryQuery);

add({
  parameters: { jsCode: buildSummaryFormCode() },
  id: 'etapa3-form-resumen-observaciones',
  name: 'Form Resumen y Observaciones',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [8840, 350],
});

const summaryRespond = clone(respondTemplate);
summaryRespond.id = 'etapa3-enviar-resumen-observaciones';
summaryRespond.name = 'Enviar Resumen y Observaciones';
summaryRespond.position = [9120, 350];
summaryRespond.parameters = { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: {} };
add(summaryRespond);

const observationWait = clone(waitTemplate);
observationWait.id = 'etapa3-espera-observaciones-asesor';
observationWait.name = 'Espera Observaciones Asesor';
observationWait.webhookId = 'etapa3-observaciones-asesor';
observationWait.position = [9400, 350];
add(observationWait);

add({
  parameters: {
    jsCode: `const query = ($json && $json.query) ? $json.query : {};
const first = (value) => Array.isArray(value) ? value[0] : value;
const workflowSession = String(first(query.workflow_session) || '').trim();
const observaciones = String(first(query.observaciones_asesor) || '').trim().slice(0, 2000);
if (!workflowSession) throw new Error('No se recibio workflow_session en el cierre');
if (observaciones.length < 10) throw new Error('Las observaciones deben tener al menos 10 caracteres');
return [{ json: {
  workflow_session: workflowSession,
  observaciones_asesor: observaciones,
  fecha_cierre_asesor: new Date().toISOString(),
} }];`,
  },
  id: 'etapa3-preparar-observaciones-asesor',
  name: 'Preparar Observaciones Asesor',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [9680, 350],
});

const updateClosure = clone(mysqlTemplate);
updateClosure.id = 'etapa3-guardar-observaciones-mysql';
updateClosure.name = 'Guardar Observaciones Asesor MySQL';
updateClosure.position = [9960, 350];
updateClosure.parameters = {
  operation: 'executeQuery',
  query: `UPDATE CRM.GestionesFlujosLog
SET respuestasJson = JSON_SET(
      COALESCE(respuestasJson, JSON_OBJECT()),
      '$.observaciones_asesor', $1,
      '$.fecha_cierre_asesor', $2
    ),
    contextoJson = JSON_SET(
      COALESCE(contextoJson, JSON_OBJECT()),
      '$.observaciones_asesor', $1,
      '$.fecha_cierre_asesor', $2
    ),
    estadoGestion = CASE
      WHEN resultado = 'escalado_segundo_nivel' THEN 'Escalada'
      ELSE 'Completada'
    END,
    nextStep = 'fin_flujo',
    updatedAt = CURRENT_TIMESTAMP(3)
WHERE workflowSession = $3
  AND codigoFlujo = 'ningunServicioFunciona'
  AND codigoEtapa = 'configuracionEquipo'
  AND numeroIntento = 1`,
  options: {
    queryBatching: 'single',
    queryReplacement: '={{ [ $json.observaciones_asesor, $json.fecha_cierre_asesor, $json.workflow_session ] }}',
    replaceEmptyStrings: true,
    detailedOutput: true,
  },
};
updateClosure.notesInFlow = true;
updateClosure.notes = 'Actualiza solamente la fila de configuracionEquipo de la workflowSession recibida. Las observaciones quedan dentro del JSON de la etapa 3; no requiere columnas nuevas.';
delete updateClosure.credentials;
add(updateClosure);

add({
  parameters: { jsCode: buildFinalClosureCode() },
  id: 'etapa3-html-cierre-definitivo',
  name: 'HTML Cierre Definitivo',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [10240, 350],
});

const finalRespond = clone(respondTemplate);
finalRespond.id = 'etapa3-responder-cierre';
finalRespond.name = 'Responder Cierre Etapa 3';
finalRespond.position = [10520, 350];
finalRespond.parameters = { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: { responseCode: 200 } };
add(finalRespond);

chain('Apertura Etapa 3', 'Normalizar Entrada Etapa 3', 'Consultar Contexto Etapa 2 MySQL', 'IF Contexto Etapa 2 Valido');
connect('IF Contexto Etapa 2 Valido', 0, 'Preparar Contexto UI Etapa 3');
connect('Preparar Contexto UI Etapa 3', 0, failure.form);
connect('IF Contexto Etapa 2 Valido', 1, 'HTML Contexto Invalido Etapa 3');
connect('HTML Contexto Invalido Etapa 3', 0, 'Responder Contexto Invalido Etapa 3');

connect(failure.wait, 0, 'IF Falla Datos o Red');
connect('IF Falla Datos o Red', 0, equipment.form);
connect('IF Falla Datos o Red', 1, alternate.form);

connect(equipment.back, 0, failure.form);
connect(equipment.back, 1, configure.form);
connect(configure.back, 0, equipment.form);
connect(configure.back, 1, configResult.form);
connect(configResult.back, 0, configure.form);
connect(configResult.back, 1, 'IF Configuracion Funciono');
connect('IF Configuracion Funciono', 0, solvedConfig.form);
connect('IF Configuracion Funciono', 1, alternate.form);

connect(alternate.back, 0, 'IF Volver Alterno Desde Datos');
connect(alternate.back, 1, 'IF Dispositivo Alterno');
connect('IF Volver Alterno Desde Datos', 0, configResult.form);
connect('IF Volver Alterno Desde Datos', 1, failure.form);
connect('IF Dispositivo Alterno', 0, crossTest.form);
connect('IF Dispositivo Alterno', 1, restart.form);

connect(crossTest.back, 0, alternate.form);
connect(crossTest.back, 1, 'IF Prueba Cruzada Funciono');
connect('IF Prueba Cruzada Funciono', 0, solvedDevice.form);
connect('IF Prueba Cruzada Funciono', 1, restart.form);

connect(restart.back, 0, 'IF Volver Reinicio Desde Prueba');
connect(restart.back, 1, 'IF Reinicio Funciono');
connect('IF Volver Reinicio Desde Prueba', 0, crossTest.form);
connect('IF Volver Reinicio Desde Prueba', 1, alternate.form);
connect('IF Reinicio Funciono', 0, solvedRestart.form);
connect('IF Reinicio Funciono', 1, escalation.form);

for (const [set, previous] of [
  [solvedConfig, configResult.form],
  [solvedDevice, crossTest.form],
  [solvedRestart, restart.form],
  [escalation, restart.form],
]) {
  connect(set.back, 0, previous);
  connect(set.back, 1, 'Preparar Registro Etapa 3 SQL');
}

chain(
  'Preparar Registro Etapa 3 SQL',
  'Guardar Etapa 3 MySQL',
  'Consultar Resumen Gestion Actual',
  'Form Resumen y Observaciones',
  'Enviar Resumen y Observaciones',
  'Espera Observaciones Asesor',
  'Preparar Observaciones Asesor',
  'Guardar Observaciones Asesor MySQL',
  'HTML Cierre Definitivo',
  'Responder Cierre Etapa 3',
);

const notes = [
  { id: 'entrada', pos: [-3700, -700], size: [1450, 1500], color: 5, text: '## 01 · Entrada independiente\nWebhook `etb-form-parte-3`.\n\nValida en MySQL que la etapa 2 terminó en `continuar_parte_3`.' },
  { id: 'falla', pos: [-2200, -700], size: [1100, 1450], color: 6, text: '## 02 · Tipo de falla\nLa primera pantalla abre directamente las decisiones.\n\n- Datos/red o ambas → configuración\n- Llamadas → prueba cruzada' },
  { id: 'config', pos: [-1080, -1300], size: [3650, 750], color: 3, text: '## 03 · Configuración del equipo\nConfirmar el tipo de equipo, consultar la plataforma y validar el resultado.\n\nSi funciona → PQR solucionada. Si no → prueba cruzada.' },
  { id: 'alterno', pos: [2450, -300], size: [2800, 950], color: 4, text: '## 04 · Dispositivo alterno\nProbar la misma SIM en un equipo liberado y en buen estado.\n\nSi funciona, la falla corresponde al dispositivo original.' },
  { id: 'reinicio', pos: [5250, 250], size: [2600, 1100], color: 2, text: '## 05 · Reinicio y reinstalación SIM\nApagar, retirar SIM, esperar 20 segundos, insertar correctamente y validar.\n\nSí → PQR solucionada. No → segundo nivel.' },
  { id: 'cierres', pos: [5250, -950], size: [2600, 650], color: 5, text: '## 06 · Cierres controlados\nConfiguración solucionada, falla del dispositivo, reinicio exitoso o escalamiento a segundo nivel.' },
  { id: 'sql', pos: [7900, -100], size: [1000, 1000], color: 7, text: '## 07 · Persistencia Etapa 3\nUpsert por `workflow_session` en `CRM.GestionesFlujosLog`.\n\nEl resultado técnico queda pendiente del cierre del asesor.' },
  { id: 'cierre-asesor', pos: [9000, -100], size: [1750, 1000], color: 5, text: '## 08 · Resumen y cierre del asesor\nConsulta solo la gestión actual, muestra las tres etapas y solicita observaciones obligatorias.\n\nAl guardar, la misma fila pasa a `Completada` o `Escalada` y `nextStep = fin_flujo`.' },
];
for (const note of notes) add({
  parameters: { content: note.text, height: note.size[1], width: note.size[0], color: note.color },
  id: `nota-etapa3-${note.id}`,
  name: `Nota Etapa 3 - ${note.id}`,
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: note.pos,
});

for (const node of workflow.nodes) {
  if (node.credentials) delete node.credentials;
}

fs.writeFileSync(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
console.log(`Generado: ${path.basename(outputPath)}`);
console.log(`Nodos: ${workflow.nodes.length}`);
