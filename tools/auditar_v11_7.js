const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowFile = path.join(root, 'Ningun Servicio Funciona - v11.7 Auditada CRM Responsive SQL.json');
const workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
const errors = [];
const checks = [];
const ok = (message) => checks.push(message);
const fail = (message) => errors.push(message);

const nodes = new Map();
const ids = new Set();
for (const node of workflow.nodes) {
  if (nodes.has(node.name)) fail(`Nombre de nodo duplicado: ${node.name}`);
  if (ids.has(node.id)) fail(`ID de nodo duplicado: ${node.id}`);
  nodes.set(node.name, node);
  ids.add(node.id);
  if (node.credentials) fail(`El JSON contiene una credencial incrustada: ${node.name}`);
}

const functional = workflow.nodes.filter((node) => node.type !== 'n8n-nodes-base.stickyNote');
const outgoing = new Map([...nodes.keys()].map((name) => [name, []]));
const incoming = new Map([...nodes.keys()].map((name) => [name, []]));
for (const [source, connectionSet] of Object.entries(workflow.connections || {})) {
  if (!nodes.has(source)) fail(`Conexión con origen inexistente: ${source}`);
  (connectionSet.main || []).forEach((branch, branchIndex) => {
    (branch || []).forEach((connection) => {
      if (!nodes.has(connection.node)) fail(`Conexión a destino inexistente: ${connection.node}`);
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

const reachable = traverse('Apertura del Flujo', outgoing);
for (const node of functional) {
  if (!reachable.has(node.name)) fail(`Nodo funcional inalcanzable: ${node.name}`);
  if (node.name !== 'Apertura del Flujo' && (incoming.get(node.name) || []).length === 0) {
    fail(`Nodo funcional sin entrada: ${node.name}`);
  }
}

const reverse = new Map([...nodes.keys()].map((name) => [name, []]));
for (const [target, edges] of incoming) reverse.set(target, edges.map((edge) => ({ node: edge.node })));
const canReachSql = traverse('Guardar Respuestas MySQL', reverse);
for (const node of functional) {
  if (!canReachSql.has(node.name)) fail(`Nodo sin camino hacia MySQL: ${node.name}`);
}

const terminals = functional.filter((node) => (outgoing.get(node.name) || []).length === 0);
if (terminals.length !== 1 || terminals[0].name !== 'Guardar Respuestas MySQL') {
  fail(`Terminales inesperados: ${terminals.map((node) => node.name).join(', ')}`);
}

const forms = functional.filter((node) => node.type === 'n8n-nodes-base.code' && node.name.startsWith('Form '));
const formConfig = new Map();
for (const form of forms) {
  const match = form.parameters.jsCode.match(/^const cfg = (\{.*\});$/m);
  if (!match) {
    fail(`Formulario sin configuración cfg: ${form.name}`);
    continue;
  }
  const cfg = JSON.parse(match[1]);
  formConfig.set(form.name, cfg);
  if (!cfg.field || !Array.isArray(cfg.options) || cfg.options.length === 0) fail(`Formulario incompleto: ${form.name}`);
  if (cfg.rendererVersion !== 'v11.7') fail(`Renderer incorrecto en ${form.name}`);
  const optionValues = cfg.options.map((option) => String(option.value));
  if (new Set(optionValues).size !== optionValues.length) fail(`Opciones duplicadas en ${form.name}`);
  try {
    const render = new Function('$execution', '$json', form.parameters.jsCode);
    for (const mode of ['test', 'production']) {
      const result = render(
        { id: 'audit-100', mode, resumeUrl: 'https://n8n.example.com/prefix/webhook-waiting/audit-100' },
        { query: { __workflow_session: 'audit-session', linea_activa: 'Si' } },
      );
      const html = result?.[0]?.json?.html_response || '';
      for (const marker of [
        '<!DOCTYPE html>', 'lang="es"', 'viewport-fit=cover', 'method="GET"',
        'https://n8n.example.com/prefix/webhook-waiting/audit-100',
        '@media(max-width:900px)', '@media(max-width:480px)', '@media(max-width:360px)',
        '@media(min-width:1200px)', '@media(min-width:1800px)', '100svh', '100dvh',
        'safe-area-inset-top', 'prefers-reduced-motion', 'role="radiogroup"', 'role="alert"',
      ]) {
        if (!html.includes(marker)) fail(`${form.name} no contiene ${marker}`);
      }
      if (cfg.allowBack && !html.includes('name="__back"')) fail(`${form.name} no renderiza Volver`);
      if (!cfg.allowBack && html.includes('name="__back"')) fail(`${form.name} renderiza Volver indebidamente`);
      for (const value of optionValues) {
        if (!html.includes(`value="${value}"`)) fail(`${form.name} no renderiza la opción ${value}`);
      }
      if (mode === 'test' && !html.includes('var isTestMode=true')) fail(`${form.name} no detecta modo test`);
      if (mode === 'production' && !html.includes('var isTestMode=false')) fail(`${form.name} no detecta producción`);
    }
  } catch (error) {
    fail(`JavaScript inválido en ${form.name}: ${error.message}`);
  }

  const sendName = `Enviar ${form.name.slice(5)}`;
  const waitName = `Espera ${form.name.slice(5)}`;
  const first = (outgoing.get(form.name) || []).map((edge) => edge.node);
  if (first.length !== 1 || first[0] !== sendName) fail(`Cadena de envío incorrecta para ${form.name}`);
  const send = nodes.get(sendName);
  const wait = nodes.get(waitName);
  if (!send || send.type !== 'n8n-nodes-base.respondToWebhook') fail(`Falta ${sendName}`);
  if (!wait || wait.type !== 'n8n-nodes-base.wait') fail(`Falta ${waitName}`);
  if (send && send.parameters.responseBody !== '={{ $json.html_response }}') fail(`Respuesta HTML incorrecta en ${sendName}`);
  if (wait && (wait.parameters.resume !== 'webhook' || wait.parameters.responseMode !== 'responseNode')) {
    fail(`Espera webhook incorrecta en ${waitName}`);
  }
}

const expectedBack = {
  'IF Volver Confirmar Pago': 'Form Verificar Linea',
  'IF Volver Escalar GESTFAC': 'Form Verificar Linea',
  'IF Volver Validar ICCID': 'Form Confirmar Pago',
  'IF Volver Confirmar ICCID': 'Form Validar ICCID',
  'IF Volver Escalar Gestor': 'Form Confirmar ICCID',
  'IF Volver Validar IMEI': 'Form Validar ICCID',
  'IF Volver Consultar Registro IMEI': 'Form Validar IMEI',
  'IF Volver Confirmar Proceso': 'Form Consultar Registro IMEI',
  'IF Volver Verificar Bloqueo': 'Form Consultar Registro IMEI',
  'IF Volver Enviar Doc': 'Form Verificar Bloqueo',
  'IF Volver Tipo SIM': 'Form Verificar Bloqueo',
};
for (const [ifName, target] of Object.entries(expectedBack)) {
  const ifNode = nodes.get(ifName);
  const condition = ifNode?.parameters?.conditions?.conditions?.[0];
  const trueTarget = (outgoing.get(ifName) || []).find((edge) => edge.branch === 0)?.node;
  if (!condition?.leftValue?.includes('__back') || condition.rightValue !== '1') fail(`Condición Volver incorrecta: ${ifName}`);
  if (trueTarget !== target) fail(`Volver incorrecto: ${ifName} conduce a ${trueTarget} y debe conducir a ${target}`);
}

const scenarios = [
  { name: 'pago pendiente', answers: { linea_activa: 'Si', pago_al_dia: 'No' }, outcome: 'pago_pendiente', next: 'fin_etapa_1' },
  { name: 'GESTFAC', answers: { linea_activa: 'No', escalado_ok: 'Si' }, outcome: 'gestfac', next: 'fin_etapa_1' },
  { name: 'gestor ICCID', answers: { linea_activa: 'Si', pago_al_dia: 'Si', iccid_valido: 'No', iccid_confirmado: 'Si', gestor_ok: 'Si' }, outcome: 'gestor_sincronizacion', next: 'fin_etapa_1' },
  { name: 'registro IMEI', answers: { linea_activa: 'Si', pago_al_dia: 'Si', iccid_valido: 'Si', imei_suma_validado: 'Si', registro_imei_ok: 'No', proceso_ok: 'Si' }, outcome: 'registro_imei_gestionado', next: 'fin_etapa_1' },
  { name: 'documentación', answers: { linea_activa: 'Si', pago_al_dia: 'Si', iccid_valido: 'Si', imei_suma_validado: 'Si', registro_imei_ok: 'Si', bloqueado: 'Si', doc_enviada: 'Si' }, outcome: 'documentacion_bloqueo', next: 'fin_etapa_1' },
  { name: 'segunda parte SIM', answers: { linea_activa: 'Si', pago_al_dia: 'Si', iccid_valido: 'Si', imei_suma_validado: 'Si', registro_imei_ok: 'Si', bloqueado: 'No', tipo_sim: 'Fisica' }, outcome: 'continuar_parte_2', next: 'parte_2_tipo_sim' },
];

function branchTarget(name, branch) {
  return (outgoing.get(name) || []).find((edge) => edge.branch === branch)?.node;
}

function simulate(scenario) {
  let current = 'Apertura del Flujo';
  let query = { __workflow_session: `audit-${scenario.name.replace(/\W+/g, '-')}` };
  const visited = [];
  for (let guard = 0; guard < 100; guard += 1) {
    visited.push(current);
    if (current === 'Guardar Respuestas MySQL') return { query, visited };
    const node = nodes.get(current);
    if (!node) throw new Error(`Nodo inexistente durante simulación: ${current}`);
    if (formConfig.has(current)) {
      const cfg = formConfig.get(current);
      const selected = scenario.answers[cfg.field];
      if (!selected || !cfg.options.some((option) => String(option.value) === selected)) {
        throw new Error(`${scenario.name}: falta una respuesta válida para ${cfg.field}`);
      }
      const internalFree = Object.fromEntries(Object.entries(query).filter(([key]) => !['__back', '__outcome', '__next_step', cfg.field].includes(key)));
      query = { ...internalFree, [cfg.field]: selected };
      if (cfg.outcome) query.__outcome = cfg.outcome;
      if (cfg.nextStep) query.__next_step = cfg.nextStep;
    }
    if (node.type === 'n8n-nodes-base.if') {
      const condition = node.parameters.conditions.conditions[0];
      const fieldMatch = condition.leftValue.match(/\$json\.query\.([A-Za-z0-9_]+)/);
      if (!fieldMatch) throw new Error(`${scenario.name}: condición no interpretable en ${current}`);
      const actual = fieldMatch[1] === '__back' ? undefined : query[fieldMatch[1]];
      current = branchTarget(current, actual === condition.rightValue ? 0 : 1);
    } else {
      const edges = outgoing.get(current) || [];
      if (edges.length !== 1) throw new Error(`${scenario.name}: ${current} tiene ${edges.length} salidas`);
      current = edges[0].node;
    }
  }
  throw new Error(`${scenario.name}: posible ciclo infinito`);
}

const prepare = nodes.get('Preparar Registro SQL');
const prepareFn = new Function('$json', '$execution', prepare.parameters.jsCode);
const routeCoverage = new Set();
for (const scenario of scenarios) {
  try {
    const simulation = simulate(scenario);
    simulation.visited.forEach((name) => routeCoverage.add(name));
    const prepared = prepareFn({ query: simulation.query }, { id: 'audit-execution' })?.[0]?.json;
    if (prepared.resultado_etapa_1 !== scenario.outcome) fail(`${scenario.name}: resultado ${prepared.resultado_etapa_1}`);
    if (prepared.next_step !== scenario.next) fail(`${scenario.name}: next_step ${prepared.next_step}`);
    if (prepared.workflow_session !== simulation.query.__workflow_session) fail(`${scenario.name}: perdió workflow_session`);
    const stored = JSON.parse(prepared.respuestas_json);
    for (const [field, value] of Object.entries(scenario.answers)) {
      if (stored[field] !== value) fail(`${scenario.name}: no persiste ${field}`);
    }
    ok(`Ruta ${scenario.name}: ${simulation.visited.length} nodos → ${scenario.outcome}`);
  } catch (error) {
    fail(`Simulación ${scenario.name}: ${error.message}`);
  }
}

for (const node of functional) {
  if (!routeCoverage.has(node.name) && !node.name.startsWith('IF Volver ')) {
    fail(`Las rutas principales no cubren ${node.name}`);
  }
}

const mysql = nodes.get('Guardar Respuestas MySQL');
if (!mysql || mysql.type !== 'n8n-nodes-base.mySql' || mysql.parameters.operation !== 'executeQuery') {
  fail('Nodo MySQL final ausente o mal configurado');
} else {
  const insertMatch = mysql.parameters.query.match(/INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!insertMatch) fail('INSERT MySQL no interpretable');
  else {
    const table = insertMatch[1];
    const columns = insertMatch[2].split(',').map((value) => value.trim());
    const placeholders = insertMatch[3].split(',').map((value) => value.trim());
    if (table !== 'n8n_nsf_respuestas') fail(`Tabla MySQL inesperada: ${table}`);
    if (columns.length !== 18 || placeholders.length !== 18) fail('El INSERT no contiene 18 columnas/parámetros');
    placeholders.forEach((placeholder, index) => {
      if (placeholder !== `$${index + 1}`) fail(`Placeholder SQL fuera de orden: ${placeholder}`);
    });
    const replacements = mysql.parameters.options.queryReplacement.match(/\$json\.([A-Za-z0-9_]+)/g) || [];
    if (replacements.length !== 18) fail(`Query Parameters contiene ${replacements.length} valores`);
    if (!/ON DUPLICATE KEY UPDATE/i.test(mysql.parameters.query)) fail('El guardado no es idempotente');

    const ddl = fs.readFileSync(path.join(root, 'database', '01_create_table_nsf.sql'), 'utf8');
    for (const column of columns) {
      if (!new RegExp(`\\b${column}\\b`, 'i').test(ddl)) fail(`La tabla local no define ${column}`);
    }
    if (!/UNIQUE KEY\s+uq_nsf_workflow_session\s*\(workflow_session\)/i.test(ddl)) {
      fail('Falta la clave única idempotente de workflow_session');
    }
  }
}

for (const sqlFile of ['00_workbench_setup_completo.sql', '01_create_table_nsf.sql', '02_create_view_nsf.sql']) {
  const sql = fs.readFileSync(path.join(root, 'database', sqlFile), 'utf8');
  if (!/USE\s+CRM\s*;/i.test(sql)) fail(`${sqlFile} no selecciona CRM`);
}
const diagnostic = fs.readFileSync(path.join(root, 'database', '03_diagnostico_acceso_n8n.sql'), 'utf8');
if (!/TABLE_SCHEMA\s*=\s*'CRM'/i.test(diagnostic)) fail('El diagnóstico SQL no consulta CRM');

const webhook = nodes.get('Apertura del Flujo');
if (webhook?.type !== 'n8n-nodes-base.webhook' || webhook.parameters.path !== 'etb-form' || webhook.parameters.responseMode !== 'responseNode') {
  fail('Webhook inicial incorrecto');
}
if (workflow.active !== false) fail('El JSON debe importarse inactivo para evitar colisión de webhook');

const positions = new Map();
for (const node of functional) {
  const key = node.position.join(',');
  if (positions.has(key)) fail(`Nodos funcionales superpuestos: ${positions.get(key)} y ${node.name}`);
  positions.set(key, node.name);
}

if (!errors.length) {
  ok(`${functional.length} nodos funcionales alcanzables y con salida a MySQL`);
  ok(`${forms.length} formularios compilados en test y producción`);
  ok('6 salidas de negocio simuladas con persistencia completa');
  ok('Contrato SQL de 18 parámetros alineado con la tabla');
  ok('Scripts de Workbench alineados con el esquema CRM');
  console.log('AUDITORÍA OK');
  checks.forEach((message) => console.log(`✓ ${message}`));
} else {
  console.error('AUDITORÍA FALLIDA');
  errors.forEach((message) => console.error(`✗ ${message}`));
  process.exit(1);
}
