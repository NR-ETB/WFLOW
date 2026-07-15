const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowFile = path.join(root, 'Ningun Servicio Funciona - 2.json');
const workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
const errors = [];
const successes = [];
const fail = (message) => errors.push(message);
const pass = (message) => successes.push(message);

const nodes = new Map();
const ids = new Set();
for (const node of workflow.nodes) {
  if (nodes.has(node.name)) fail(`Nombre duplicado: ${node.name}`);
  if (ids.has(node.id)) fail(`ID duplicado: ${node.id}`);
  if (node.credentials) fail(`Credencial incrustada: ${node.name}`);
  nodes.set(node.name, node);
  ids.add(node.id);
}

const functional = workflow.nodes.filter((node) => node.type !== 'n8n-nodes-base.stickyNote');
const waitIds = new Set();
for (const node of functional.filter((item) => item.type === 'n8n-nodes-base.wait')) {
  if (!node.webhookId) fail(`Wait sin webhookId: ${node.name}`);
  if (waitIds.has(node.webhookId)) fail(`webhookId de Wait duplicado: ${node.webhookId}`);
  waitIds.add(node.webhookId);
}
const outgoing = new Map([...nodes.keys()].map((name) => [name, []]));
const incoming = new Map([...nodes.keys()].map((name) => [name, []]));
for (const [source, connectionSet] of Object.entries(workflow.connections || {})) {
  if (!nodes.has(source)) fail(`Origen inexistente: ${source}`);
  const edgeKeys = new Set();
  (connectionSet.main || []).forEach((branch, branchIndex) => {
    (branch || []).forEach((connection) => {
      const edgeKey = `${branchIndex}:${connection.node}`;
      if (edgeKeys.has(edgeKey)) fail(`Conexión duplicada: ${source} → ${connection.node}`);
      edgeKeys.add(edgeKey);
      if (!nodes.has(connection.node)) fail(`Destino inexistente: ${connection.node}`);
      else {
        outgoing.get(source).push({ node: connection.node, branch: branchIndex });
        incoming.get(connection.node).push({ node: source, branch: branchIndex });
      }
    });
  });
}

function traverse(start, graph) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of graph.get(current) || []) queue.push(edge.node);
  }
  return seen;
}

const roots = ['Apertura Etapa 2', 'Continuar directamente a Diagnostico de Equipo'];
const reachable = new Set(roots.flatMap((rootName) => [...traverse(rootName, outgoing)]));
for (const node of functional) {
  if (!reachable.has(node.name)) fail(`Nodo inalcanzable: ${node.name}`);
  if (!roots.includes(node.name) && (incoming.get(node.name) || []).length === 0) fail(`Nodo sin entrada: ${node.name}`);
}

const terminals = functional.filter((node) => (outgoing.get(node.name) || []).length === 0).map((node) => node.name).sort();
const expectedTerminals = ['Redirigir a Etapa 3', 'Responder Cierre Etapa 2', 'Responder Contexto Invalido'].sort();
if (JSON.stringify(terminals) !== JSON.stringify(expectedTerminals)) fail(`Terminales inesperados: ${terminals.join(', ')}`);

const reverse = new Map([...nodes.keys()].map((name) => [name, []]));
for (const [target, edges] of incoming) reverse.set(target, edges.map((edge) => ({ node: edge.node })));
const reachesSave = traverse('Responder Cierre Etapa 2', reverse);
for (const node of functional) {
  if (!reachesSave.has(node.name) && !['HTML Contexto Invalido', 'Responder Contexto Invalido', 'Redirigir a Etapa 3'].includes(node.name)) {
    fail(`Nodo sin camino al guardado: ${node.name}`);
  }
}

const forms = functional.filter((node) => node.type === 'n8n-nodes-base.code' && node.name.startsWith('Form '));
const formConfig = new Map();
for (const form of forms) {
  const match = form.parameters.jsCode.match(/^const cfg = (\{.*\});$/m);
  if (!match) {
    fail(`Formulario sin cfg: ${form.name}`);
    continue;
  }
  const cfg = JSON.parse(match[1]);
  formConfig.set(form.name, cfg);
  if (cfg.rendererVersion !== 'etapa2-v1') fail(`Renderer incorrecto: ${form.name}`);
  if (cfg.startPath !== 'etb-form-parte-2') fail(`Webhook de retorno incorrecto: ${form.name}`);
  if (!cfg.field || !Array.isArray(cfg.options) || !cfg.options.length) fail(`Formulario incompleto: ${form.name}`);
  if (cfg.finishMode === 'complete' && (!cfg.outcome || !cfg.nextStep || !cfg.finishToStart)) fail(`Cierre incompleto: ${form.name}`);

  try {
    const render = new Function('$execution', '$json', form.parameters.jsCode);
    for (const mode of ['test', 'production']) {
      const result = render(
        { id: 'etapa2-test', mode, resumeUrl: 'https://n8n.example.test/webhook-waiting/etapa2-test' },
        { query: { workflow_session: 'session-test', tipo_sim: 'eSIM' } },
      );
      const html = result?.[0]?.json?.html_response || '';
      for (const marker of [
        '<!DOCTYPE html>', 'viewport-fit=cover', 'role="radiogroup"', 'role="alert"',
        '@media(max-width:900px)', '@media(max-width:480px)', '@media(max-width:360px)',
        '@media(min-width:1200px)', '100svh', '100dvh', 'safe-area-inset-top',
        'prefers-reduced-motion', 'etb-form-parte-2',
      ]) {
        if (!html.includes(marker)) fail(`${form.name} no contiene ${marker}`);
      }
      if (cfg.finishMode === 'complete' && !html.includes('var finishComplete=true')) fail(`${form.name} no cierra sin redirección`);
      if (cfg.allowBack && !html.includes('name="__back"')) fail(`${form.name} no renderiza Volver`);
      if (!cfg.allowBack && html.includes('name="__back"')) fail(`${form.name} renderiza Volver indebidamente`);
      for (const option of cfg.options) {
        if (!html.includes(`value="${option.value}"`)) fail(`${form.name} no renderiza ${option.value}`);
      }
    }
  } catch (error) {
    fail(`JavaScript inválido en ${form.name}: ${error.message}`);
  }

  const label = form.name.slice(5);
  const sendName = `Enviar ${label}`;
  const waitName = `Espera ${label}`;
  const send = nodes.get(sendName);
  const wait = nodes.get(waitName);
  if (!send || send.type !== 'n8n-nodes-base.respondToWebhook') fail(`Falta ${sendName}`);
  if (!wait || wait.type !== 'n8n-nodes-base.wait') fail(`Falta ${waitName}`);
  if (send?.parameters.responseBody !== '={{ $json.html_response }}') fail(`HTML no mapeado en ${sendName}`);
  if (wait && (wait.parameters.resume !== 'webhook' || wait.parameters.responseMode !== 'responseNode')) fail(`Espera incorrecta en ${waitName}`);
}

if (forms.length !== 11) fail(`Cantidad inesperada de formularios: ${forms.length}`);

const expectedBack = {
  'IF Volver Gestionar QR': 'Form Validar QR',
  'IF Volver Confirmar Reposicion QR': 'Form Gestionar QR',
  'IF Volver Verificar Portacion': 'Form Linea Portada',
  'IF Volver Estado NIP': 'Form Verificar Portacion',
  'IF Volver Confirmar Espera NIP': 'Form Estado NIP',
  'IF Volver Escalar Gestor NIP': 'Form Estado NIP',
  'IF Volver Validar SUMA': 'Form Linea Portada',
  'IF Volver Escalar Gestor SUMA': 'Form Validar SUMA',
};
for (const [name, expected] of Object.entries(expectedBack)) {
  const condition = nodes.get(name)?.parameters?.conditions?.conditions?.[0];
  const target = (outgoing.get(name) || []).find((edge) => edge.branch === 0)?.node;
  if (!condition?.leftValue?.includes('__back') || condition.rightValue !== '1') fail(`Condición Volver incorrecta: ${name}`);
  if (target !== expected) fail(`${name} vuelve a ${target}; se esperaba ${expected}`);
}

function target(name, branch) {
  return (outgoing.get(name) || []).find((edge) => edge.branch === branch)?.node;
}

function simulate(scenario) {
  let current = 'IF Tipo SIM eSIM';
  let query = { workflow_session: `audit-${scenario.name.replace(/\W+/g, '-')}`, tipo_sim: scenario.tipo_sim };
  const answerIndex = {};
  const visited = [];
  for (let guard = 0; guard < 140; guard += 1) {
    visited.push(current);
    if (current === 'Guardar Etapa 2 MySQL') return { query, visited };
    const node = nodes.get(current);
    if (!node) throw new Error(`Nodo inexistente: ${current}`);
    if (formConfig.has(current)) {
      const cfg = formConfig.get(current);
      const configured = scenario.answers[cfg.field];
      const values = Array.isArray(configured) ? configured : [configured];
      const index = answerIndex[cfg.field] || 0;
      const selected = values[Math.min(index, values.length - 1)];
      answerIndex[cfg.field] = index + 1;
      if (!selected || !cfg.options.some((option) => String(option.value) === selected)) {
        throw new Error(`Falta respuesta válida para ${cfg.field} en ${current}`);
      }
      const cleaned = Object.fromEntries(Object.entries(query).filter(([key]) => !['__back', '__outcome', '__next_step', cfg.field].includes(key)));
      query = { ...cleaned, [cfg.field]: selected };
      if (cfg.outcome) query.__outcome = cfg.outcome;
      if (cfg.nextStep) query.__next_step = cfg.nextStep;
    }
    if (node.type === 'n8n-nodes-base.if') {
      const condition = node.parameters.conditions.conditions[0];
      const fieldMatch = condition.leftValue.match(/\$json\.query\.([A-Za-z0-9_]+)/);
      if (!fieldMatch) throw new Error(`IF no interpretable: ${current}`);
      const actual = fieldMatch[1] === '__back' ? undefined : query[fieldMatch[1]];
      current = target(current, actual === condition.rightValue ? 0 : 1);
    } else {
      const edges = outgoing.get(current) || [];
      if (edges.length !== 1) throw new Error(`${current} tiene ${edges.length} salidas`);
      current = edges[0].node;
    }
  }
  throw new Error('Posible ciclo infinito');
}

const scenarios = [
  {
    name: 'eSIM reposición QR', tipo_sim: 'eSIM', outcome: 'reposicion_qr', next: 'fin_etapa_2',
    answers: { inicio_etapa2: 'Si', qr_escaneo_ok: 'No', qr_gestion: 'Reposicion', reposicion_ok: 'Si' },
  },
  {
    name: 'eSIM espera NIP', tipo_sim: 'eSIM', outcome: 'espera_nip', next: 'revisar_nip',
    answers: { inicio_etapa2: 'Si', qr_escaneo_ok: 'Si', linea_portada: 'Si', portacion_completada: 'No', nip_estado: 'Pendiente', espera_nip_confirmada: 'Si' },
  },
  {
    name: 'eSIM NIP vencido', tipo_sim: 'eSIM', outcome: 'gestor_nip_vencido', next: 'fin_etapa_2',
    answers: { inicio_etapa2: 'Si', qr_escaneo_ok: 'Si', linea_portada: 'Si', portacion_completada: 'No', nip_estado: 'Vencido', gestor_nip_ok: 'Si' },
  },
  {
    name: 'física continúa etapa 3', tipo_sim: 'Fisica', outcome: 'continuar_parte_3', next: 'parte_3_configuracion_equipo',
    answers: { inicio_etapa2: 'Si', linea_portada: 'No', suma_ok: 'Si' },
  },
  {
    name: 'física escalamiento SUMA', tipo_sim: 'Fisica', outcome: 'gestor_sincronizacion_suma', next: 'fin_etapa_2',
    answers: { inicio_etapa2: 'Si', linea_portada: 'No', suma_ok: 'No', gestor_suma_ok: 'Si' },
  },
  {
    name: 'MultiSIM virtual', tipo_sim: 'MultiSIM', outcome: 'continuar_parte_3', next: 'parte_3_configuracion_equipo',
    answers: { inicio_etapa2: 'Si', ruta_multisim: 'Virtual', qr_escaneo_ok: 'Si', linea_portada: 'No', suma_ok: 'Si' },
  },
  {
    name: 'MultiSIM física portada', tipo_sim: 'MultiSIM', outcome: 'continuar_parte_3', next: 'parte_3_configuracion_equipo',
    answers: { inicio_etapa2: 'Si', ruta_multisim: 'Fisica', linea_portada: 'Si', portacion_completada: 'Si', suma_ok: 'Si' },
  },
  {
    name: 'NIP recibido y revalidado', tipo_sim: 'Fisica', outcome: 'continuar_parte_3', next: 'parte_3_configuracion_equipo',
    answers: { inicio_etapa2: 'Si', linea_portada: 'Si', portacion_completada: ['No', 'Si'], nip_estado: 'Recibido', suma_ok: 'Si' },
  },
];

const prepare = nodes.get('Preparar Registro Etapa 2 SQL');
const prepareFn = new Function('$json', '$execution', prepare.parameters.jsCode);
const coverage = new Set();
for (const scenario of scenarios) {
  try {
    const simulation = simulate(scenario);
    simulation.visited.forEach((name) => coverage.add(name));
    const prepared = prepareFn(
      { query: simulation.query },
      { id: 'execution-test', resumeUrl: 'https://n8n.example.test/webhook-waiting/etapa2-audit' },
    )?.[0]?.json;
    if (prepared.resultado_etapa_2 !== scenario.outcome) fail(`${scenario.name}: resultado ${prepared.resultado_etapa_2}`);
    if (prepared.next_step !== scenario.next) fail(`${scenario.name}: next_step ${prepared.next_step}`);
    if (prepared.tipo_sim !== scenario.tipo_sim) fail(`${scenario.name}: perdió tipo_sim`);
    JSON.parse(prepared.respuestas_json);
    pass(`${scenario.name}: ${simulation.visited.length} nodos → ${scenario.outcome}`);
  } catch (error) {
    fail(`${scenario.name}: ${error.message}`);
  }
}

for (const form of forms) {
  if (!coverage.has(form.name)) fail(`Ningún escenario cubre ${form.name}`);
}

const lookup = nodes.get('Consultar Contexto Etapa 1 MySQL');
if (!lookup?.parameters?.query?.includes('WHERE workflow_session = $1')) fail('La consulta no valida workflow_session');
if (!lookup?.parameters?.query?.includes("MAX(resultado_etapa_1) = 'continuar_parte_2'")) fail('La consulta no audita resultado_etapa_1');
if (!lookup?.parameters?.query?.includes("MAX(next_step) = 'parte_2_tipo_sim'")) fail('La consulta no audita next_step');
if (!lookup?.parameters?.query?.includes("MAX(tipo_sim) IS NOT NULL")) fail('La consulta no exige tipo_sim');
if (!lookup?.parameters?.query?.includes('AS contrato_canonico')) fail('La consulta no expone contrato_canonico');
if (lookup?.parameters?.options?.queryReplacement !== '={{ [ $json.workflow_session, $json.transition_mode, $json.handoff_query_json, $json.public_base ] }}') fail('La consulta de contexto no está parametrizada');

const save = nodes.get('Guardar Etapa 2 MySQL');
const placeholders = save?.parameters?.query?.match(/\$\d+/g) || [];
const maxPlaceholder = Math.max(...placeholders.map((value) => Number(value.slice(1))));
const replacements = save?.parameters?.options?.queryReplacement?.match(/\$json\.[A-Za-z0-9_]+/g) || [];
if (maxPlaceholder !== 19 || replacements.length !== 19) fail(`Contrato MySQL inesperado: $${maxPlaceholder}, ${replacements.length} reemplazos`);
if (!save.parameters.query.includes('ON DUPLICATE KEY UPDATE')) fail('El guardado no es idempotente');

if (nodes.has('Form Confirmar Servicio Normalizado') || nodes.has('Espera Confirmar Servicio Normalizado')) {
  fail('La etapa 2 conserva el cierre redundante de servicio normalizado');
}
if (nodes.has('Form Iniciar Etapa 2') || nodes.has('Espera Iniciar Etapa 2')) {
  fail('El flujo conserva la pantalla intermedia de inicio de etapa 2');
}
for (const [name, cfg] of formConfig) {
  if (String(cfg.tag || '').toLowerCase().includes('etapa 2')) fail(`${name} muestra el rótulo Etapa 2`);
}
const sumaCfg = formConfig.get('Form Validar SUMA');
if (sumaCfg?.handoffPath !== 'etb-form-parte-2-handoff' || sumaCfg?.handoffWhen?.suma_ok !== 'Si') {
  fail('Validar SUMA no publica la ruta positiva en el webhook puente');
}
const handoffWebhook = nodes.get('Continuar directamente a Diagnostico de Equipo');
if (handoffWebhook?.parameters?.path !== 'etb-form-parte-2-handoff' || handoffWebhook?.parameters?.responseMode !== 'responseNode') {
  fail('Webhook puente de continuidad incorrecto');
}
const redirect = nodes.get('Redirigir a Etapa 3');
if (redirect?.parameters?.respondWith !== 'redirect' || !String(redirect?.parameters?.redirectURL || '').includes('handoff_url')) {
  fail('Redirect nativo hacia etapa 3 ausente');
}
if (!prepare?.parameters?.jsCode?.includes("'/webhook/etb-form-parte-3?workflow_session='")) {
  fail('Preparar Registro Etapa 2 SQL no construye la URL de etapa 3');
}

const ddl = fs.readFileSync(path.join(root, 'database', '10_etapa2_workbench_setup.sql'), 'utf8');
for (const marker of [
  'USE CRM;', 'CREATE TABLE IF NOT EXISTS n8n_nsf_etapa2',
  'UNIQUE KEY uq_nsf_etapa2_workflow_session', 'FOREIGN KEY (workflow_session)',
  'REFERENCES n8n_nsf_respuestas (workflow_session)', 'CREATE OR REPLACE VIEW vw_n8n_nsf_etapa2',
]) {
  if (!ddl.includes(marker)) fail(`DDL incompleto: ${marker}`);
}

const webhook = nodes.get('Apertura Etapa 2');
if (webhook?.parameters?.path !== 'etb-form-parte-2' || webhook.parameters.responseMode !== 'responseNode') fail('Webhook independiente incorrecto');
if (workflow.active !== false) fail('El workflow debe importarse inactivo');

if (errors.length) {
  console.error('VALIDACIÓN ETAPA 2 FALLIDA');
  errors.forEach((message) => console.error(`✗ ${message}`));
  process.exit(1);
}

console.log('VALIDACIÓN ETAPA 2 OK');
successes.forEach((message) => console.log(`✓ ${message}`));
console.log(`✓ ${functional.length} nodos funcionales, ${forms.length} formularios, ${workflow.nodes.length - functional.length} notas`);
console.log('✓ Contrato entre etapas, MySQL parametrizado y responsive verificados');
