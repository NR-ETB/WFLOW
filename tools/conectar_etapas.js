const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, 'Ningun Servicio Funciona - 1.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
workflow.name = 'Ningun Servicio Funciona - 1';
const stage1Save = workflow.nodes.find((node) => node.name === 'Guardar Respuestas MySQL');
if (stage1Save?.parameters?.query) {
  stage1Save.parameters.query = stage1Save.parameters.query.replace(
    'INSERT INTO n8n_nsf_respuestas',
    'INSERT INTO CRM.n8n_nsf_respuestas',
  );
}
const slug = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

for (const node of workflow.nodes.filter((item) => item.type === 'n8n-nodes-base.wait')) {
  node.webhookId = `etapa1-${slug(node.name)}`;
}
const form = workflow.nodes.find((node) => node.name === 'Form Tipo SIM');

if (!form?.parameters?.jsCode) {
  throw new Error('No se encontró el nodo Form Tipo SIM de la etapa 1.');
}

let code = form.parameters.jsCode;
const cfgMatch = code.match(/^const cfg = (\{.*\});$/m);
if (!cfgMatch) throw new Error('No se encontró la configuración del formulario Tipo SIM.');

const cfg = JSON.parse(cfgMatch[1]);
cfg.startPath = 'etb-form-parte-2';
cfg.handoffSession = true;
cfg.finishToStart = false;
cfg.submitPath = 'etb-form-handoff';
cfg.allowBack = false;
cfg.rendererVersion = 'v11.9-handoff-responsive';
code = code.replace(cfgMatch[0], `const cfg = ${JSON.stringify(cfg)};`);

if (!code.includes('let handoffSubmitUrl =')) {
  const marker = "const incomingQuery = (typeof $json === 'object' && $json && $json.query) ? $json.query : {};";
  const replacement = `${marker}
const incomingHeaders = (typeof $json === 'object' && $json && $json.headers) ? $json.headers : {};
let handoffSubmitUrl = '';
try {
  const proto = String(incomingHeaders['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(incomingHeaders['x-forwarded-host'] || incomingHeaders.host || '').split(',')[0].trim();
  const prefix = String(incomingHeaders['x-forwarded-prefix'] || '').replace(/\\/$/, '');
  if (host) handoffSubmitUrl = proto + '://' + host + prefix + '/webhook/etb-form-handoff';
  else if (resumeUrl) {
    const parsedSubmit = new URL(String(resumeUrl));
    const submitMarkers = ['/webhook-waiting/', '/webhook-test/', '/webhook/'];
    let submitBasePath = '';
    for (const submitMarker of submitMarkers) {
      const submitIndex = parsedSubmit.pathname.indexOf(submitMarker);
      if (submitIndex >= 0) { submitBasePath = parsedSubmit.pathname.slice(0, submitIndex); break; }
    }
    parsedSubmit.pathname = submitBasePath + '/webhook/etb-form-handoff';
    parsedSubmit.search = '';
    parsedSubmit.hash = '';
    handoffSubmitUrl = parsedSubmit.toString();
  }
} catch (e) {}`;
  if (!code.includes(marker)) throw new Error('No se encontró la entrada del formulario Tipo SIM.');
  code = code.replace(marker, replacement);
}

const waitAction = "action=\"' + esc(resumeUrl || '') + '\"";
const handoffAction = "action=\"' + esc(handoffSubmitUrl || resumeUrl || '') + '\"";
if (code.includes(waitAction)) code = code.replace(waitAction, handoffAction);
if (!code.includes(handoffAction)) throw new Error('No se pudo asignar el webhook dedicado al formulario Tipo SIM.');

const testPrefix = "const prefix = executionMode === 'test' ? 'webhook-test' : 'webhook';";
const handoffPrefix = "const prefix = cfg.handoffSession ? 'webhook' : (executionMode === 'test' ? 'webhook-test' : 'webhook');";
if (code.includes(testPrefix)) code = code.replace(testPrefix, handoffPrefix);
if (!code.includes(handoffPrefix)) throw new Error('No se pudo configurar el webhook de producción para la transición.');

if (!code.includes('const handoffFlag =')) {
  const source = "  const testFlag = executionMode === 'test' ? 'true' : 'false';";
  const replacement = `${source}\n  const handoffFlag = cfg.handoffSession ? 'true' : 'false';`;
  if (!code.includes(source)) throw new Error('No se encontró el indicador del modo de ejecución.');
  code = code.replace(source, replacement);
}

if (!code.includes("var handoffSession=' + handoffFlag + ';")) {
  const source = "var startUrl=' + startUrlJson + ';var isTestMode=' + testFlag + ';function showCompletion()";
  const replacement = "var startUrl=' + startUrlJson + ';var isTestMode=' + testFlag + ';var handoffSession=' + handoffFlag + ';function showCompletion()";
  if (!code.includes(source)) throw new Error('No se encontró el inicio del controlador del formulario.');
  code = code.replace(source, replacement);
}

const oldTransition = 'if(isTestMode||!startUrl){showCompletion();return;}window.location.href=startUrl;';
const newTransition = 'if((isTestMode&&!handoffSession)||!startUrl){showCompletion();return;}var targetUrl=startUrl;if(handoffSession){try{var target=new URL(startUrl);var session=data.get("__workflow_session")||data.get("workflow_session");if(session)target.searchParams.set("workflow_session",session);targetUrl=target.toString();}catch(e){}}window.location.href=targetUrl;';
if (code.includes(oldTransition)) code = code.replace(oldTransition, newTransition);
if (!code.includes(newTransition)) throw new Error('No se pudo instalar la transición entre etapas.');

form.parameters.jsCode = code;

workflow.nodes = workflow.nodes.filter((node) => !['Espera Tipo SIM', 'IF Volver Tipo SIM'].includes(node.name));
delete workflow.connections['Espera Tipo SIM'];
delete workflow.connections['IF Volver Tipo SIM'];
workflow.connections['Form Tipo SIM'] = {
  main: [[{ node: 'Enviar Tipo SIM', type: 'main', index: 0 }]],
};
delete workflow.connections['Enviar Tipo SIM'];

let handoffWebhook = workflow.nodes.find((node) => node.name === 'Continuar a Etapa 2');
if (!handoffWebhook) {
  const webhookTemplate = workflow.nodes.find((node) => node.name === 'Apertura del Flujo');
  if (!webhookTemplate) throw new Error('No se encontró el webhook principal de la etapa 1.');
  handoffWebhook = JSON.parse(JSON.stringify(webhookTemplate));
  handoffWebhook.id = 'webhook-handoff-etapa2-v11';
  handoffWebhook.name = 'Continuar a Etapa 2';
  workflow.nodes.push(handoffWebhook);
}
handoffWebhook.webhookId = 'etb-form-handoff';
handoffWebhook.position = [5630, -700];
handoffWebhook.parameters.httpMethod = 'GET';
handoffWebhook.parameters.path = 'etb-form-handoff';
handoffWebhook.parameters.responseMode = 'responseNode';
handoffWebhook.parameters.options = { allowedOrigins: '*' };

let handoffInputIf = workflow.nodes.find((node) => node.name === 'IF Entrada Handoff Valida');
if (!handoffInputIf) {
  const template = workflow.nodes.find((node) => node.name === 'IF bloqueado');
  if (!template) throw new Error('No se encontró un nodo IF para validar el handoff.');
  handoffInputIf = JSON.parse(JSON.stringify(template));
  handoffInputIf.id = 'if-entrada-handoff-valida-v11';
  handoffInputIf.name = 'IF Entrada Handoff Valida';
  workflow.nodes.push(handoffInputIf);
}
handoffInputIf.position = [5850, -700];
handoffInputIf.parameters.conditions.conditions = [
  {
    id: 'cond-handoff-outcome-v11',
    leftValue: '={{ $json.query.__outcome }}',
    rightValue: 'continuar_parte_2',
    operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
  },
  {
    id: 'cond-handoff-next-v11',
    leftValue: '={{ $json.query.__next_step }}',
    rightValue: 'parte_2_tipo_sim',
    operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
  },
  {
    id: 'cond-handoff-session-v11',
    leftValue: '={{ $json.query.__workflow_session }}',
    rightValue: '',
    operator: { type: 'string', operation: 'notEmpty', singleValue: true },
  },
  {
    id: 'cond-handoff-sim-v11',
    leftValue: '={{ $json.query.tipo_sim }}',
    rightValue: '',
    operator: { type: 'string', operation: 'notEmpty', singleValue: true },
  },
];
handoffInputIf.parameters.conditions.combinator = 'and';

let invalidHandoff = workflow.nodes.find((node) => node.name === 'Responder Handoff Invalido');
if (!invalidHandoff) {
  invalidHandoff = {
    parameters: {},
    id: 'responder-handoff-invalido-v11',
    name: 'Responder Handoff Invalido',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.4,
    position: [6070, -700],
  };
  workflow.nodes.push(invalidHandoff);
}
invalidHandoff.position = [6070, -700];
invalidHandoff.parameters = {
  respondWith: 'text',
  responseBody: 'No fue posible validar la transición hacia la etapa 2.',
  options: { responseCode: 400 },
};

workflow.connections['Continuar a Etapa 2'] = {
  main: [[{ node: 'IF Entrada Handoff Valida', type: 'main', index: 0 }]],
};
workflow.connections['IF Entrada Handoff Valida'] = {
  main: [
    [{ node: 'Preparar Registro SQL', type: 'main', index: 0 }],
    [{ node: 'Responder Handoff Invalido', type: 'main', index: 0 }],
  ],
};

let finalRespond = workflow.nodes.find((node) => node.name === 'Responder Cierre Etapa 1');
if (!finalRespond) {
  finalRespond = {
    parameters: {
      respondWith: 'text',
      responseBody: 'OK',
      options: { responseCode: 200 },
    },
    id: 'responder-cierre-etapa1-v11',
    name: 'Responder Cierre Etapa 1',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.4,
    position: [6510, 220],
  };
  workflow.nodes.push(finalRespond);
}
finalRespond.position = [6510, 220];
finalRespond.parameters = {
  respondWith: 'text',
  responseBody: 'OK',
  options: { responseCode: 200 },
};

let handoffIf = workflow.nodes.find((node) => node.name === 'IF Continuar Etapa 2');
if (!handoffIf) {
  const template = workflow.nodes.find((node) => node.name === 'IF bloqueado');
  if (!template) throw new Error('No se encontró un nodo IF para crear la transición.');
  handoffIf = JSON.parse(JSON.stringify(template));
  handoffIf.id = 'if-continuar-etapa2-v11';
  handoffIf.name = 'IF Continuar Etapa 2';
  workflow.nodes.push(handoffIf);
}
handoffIf.position = [6290, 0];
handoffIf.parameters.conditions.conditions = [{
  id: 'cond-continuar-etapa2-v11',
  leftValue: "={{ $('Preparar Registro SQL').first().json.resultado_etapa_1 }}",
  rightValue: 'continuar_parte_2',
  operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
}];
handoffIf.parameters.conditions.combinator = 'or';

let redirect = workflow.nodes.find((node) => node.name === 'Redirigir a Etapa 2');
if (!redirect) {
  redirect = {
    parameters: {},
    id: 'responder-redireccion-etapa2-v11',
    name: 'Redirigir a Etapa 2',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.4,
    position: [6510, -220],
  };
  workflow.nodes.push(redirect);
}
redirect.position = [6510, -220];
redirect.parameters = {
  respondWith: 'redirect',
  redirectURL: "={{ $('Preparar Registro SQL').first().json.handoff_url }}",
  options: {},
};

workflow.connections['Guardar Respuestas MySQL'] = {
  main: [[{ node: 'IF Continuar Etapa 2', type: 'main', index: 0 }]],
};
workflow.connections['IF Continuar Etapa 2'] = {
  main: [
    [{ node: 'Redirigir a Etapa 2', type: 'main', index: 0 }],
    [{ node: 'Responder Cierre Etapa 1', type: 'main', index: 0 }],
  ],
};

const persistenceNote = workflow.nodes.find((node) => node.name === '11 - Persistencia MySQL');
if (persistenceNote) {
  persistenceNote.position = [5740, -360];
  persistenceNote.parameters.width = 1000;
  persistenceNote.parameters.height = 720;
}

const prepare = workflow.nodes.find((node) => node.name === 'Preparar Registro SQL');
if (prepare?.parameters?.jsCode) {
  let prepareCode = prepare.parameters.jsCode.replace(
    /workflow_version: '[^']+',/,
    "workflow_version: 'v11.9-responsive-homogeneo-20260715',",
  );
  if (!prepareCode.includes('const workflowSession =')) {
    const marker = "return [{ json: {\n  workflow_session: value('__workflow_session') || String($execution.id || ''),";
    const replacement = `const workflowSession = value('__workflow_session') || String($execution.id || '');
let handoffUrl = '';
try {
  const parsed = new URL(String($execution.resumeUrl || ''));
  const markers = ['/webhook-waiting/', '/webhook-test/', '/webhook/'];
  let basePath = '';
  for (const marker of markers) {
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) { basePath = parsed.pathname.slice(0, markerIndex); break; }
  }
  parsed.pathname = basePath + '/webhook/etb-form-parte-2';
  parsed.search = '';
  parsed.hash = '';
  parsed.searchParams.set('workflow_session', workflowSession);
  handoffUrl = parsed.toString();
} catch (e) {}
return [{ json: {
  workflow_session: workflowSession,`;
    if (!prepareCode.includes(marker)) throw new Error('No se pudo preparar la URL de transición.');
    prepareCode = prepareCode.replace(marker, replacement);
  }
  if (!prepareCode.includes('handoff_url: handoffUrl')) {
    prepareCode = prepareCode.replace('  next_step: nextStep,', '  next_step: nextStep,\n  handoff_url: handoffUrl,');
  }
  prepareCode = prepareCode.replace(
    /let handoffUrl = '';[\s\S]*?\} catch \(e\) \{\}/,
    `const requestHeaders = ($json && $json.headers) ? $json.headers : {};
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
let publicBase = absoluteBase(($json && $json.webhookUrl) || '');
if (!publicBase) {
  const proto = String(requestHeaders['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(requestHeaders['x-forwarded-host'] || requestHeaders.host || '').split(',')[0].trim();
  const prefix = String(requestHeaders['x-forwarded-prefix'] || '').replace(/\\/$/, '');
  if (host) publicBase = proto + '://' + host + prefix;
}
if (!publicBase) publicBase = absoluteBase($execution.resumeUrl || '');
const handoffUrl = publicBase
  ? publicBase.replace(/\\/$/, '') + '/webhook/etb-form-parte-2?workflow_session=' + encodeURIComponent(workflowSession)
  : '';`,
  );
  prepare.parameters.jsCode = prepareCode;
}

fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');

console.log('Conexión instalada: Etapa 1 → Etapa 2');
console.log('Parámetro transferido: workflow_session');
