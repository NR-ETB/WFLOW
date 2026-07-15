const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'Ningun Servicio Funciona - 3.json'), 'utf8'));
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
const outgoing = new Map([...nodes.keys()].map((name) => [name, []]));
const incoming = new Map([...nodes.keys()].map((name) => [name, []]));
for (const [source, connectionSet] of Object.entries(workflow.connections || {})) {
  for (const [branchIndex, branch] of (connectionSet.main || []).entries()) {
    for (const connection of branch || []) {
      if (!nodes.has(connection.node)) fail(`Destino inexistente: ${connection.node}`);
      else {
        outgoing.get(source).push({ node: connection.node, branch: branchIndex });
        incoming.get(connection.node).push({ node: source, branch: branchIndex });
      }
    }
  }
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

const reachable = traverse('Apertura Etapa 3', outgoing);
for (const node of functional) {
  if (!reachable.has(node.name)) fail(`Nodo inalcanzable: ${node.name}`);
  if (node.name !== 'Apertura Etapa 3' && !(incoming.get(node.name) || []).length) fail(`Nodo sin entrada: ${node.name}`);
}

const terminals = functional.filter((node) => !(outgoing.get(node.name) || []).length).map((node) => node.name).sort();
const expectedTerminals = ['Responder Cierre Etapa 3', 'Responder Contexto Invalido Etapa 3'].sort();
if (JSON.stringify(terminals) !== JSON.stringify(expectedTerminals)) fail(`Terminales inesperados: ${terminals.join(', ')}`);

const waitIds = new Set();
for (const node of functional.filter((item) => item.type === 'n8n-nodes-base.wait')) {
  if (!node.webhookId) fail(`Wait sin webhookId: ${node.name}`);
  if (waitIds.has(node.webhookId)) fail(`webhookId de Wait duplicado: ${node.webhookId}`);
  waitIds.add(node.webhookId);
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
  if (cfg.rendererVersion !== 'etapa3-v1') fail(`Renderer incorrecto: ${form.name}`);
  if (cfg.startPath !== 'etb-form-parte-3') fail(`Webhook incorrecto: ${form.name}`);
  if (!cfg.field || !Array.isArray(cfg.options) || !cfg.options.length) fail(`Formulario incompleto: ${form.name}`);
  if (cfg.finishMode === 'complete' && (!cfg.outcome || cfg.nextStep !== 'fin_flujo')) fail(`Cierre incompleto: ${form.name}`);
  try {
    const result = new Function('$execution', '$json', form.parameters.jsCode)(
      { id: 'etapa3-test', mode: 'production', resumeUrl: 'https://n8n.example.test/webhook-waiting/etapa3-test' },
      { query: { workflow_session: 'session-test', tipo_sim: 'Fisica' } },
    );
    const html = result?.[0]?.json?.html_response || '';
    for (const marker of [
      '<!DOCTYPE html>', 'viewport-fit=cover', 'role="radiogroup"', '@media(max-width:900px)',
      '@media(max-width:480px)', '@media(min-width:901px) and (max-width:1600px)', '100svh', 'safe-area-inset-top',
      'prefers-reduced-motion', 'etb-form-parte-3',
    ]) {
      if (!html.includes(marker)) fail(`${form.name} no contiene ${marker}`);
    }
    if (html.includes('max-width:1040px') || html.includes('max-width:1100px')) fail(`${form.name} conserva ampliación excesiva de escritorio`);
    if (cfg.allowBack !== html.includes('name="__back"')) fail(`Botón Volver inconsistente: ${form.name}`);
  } catch (error) {
    fail(`JavaScript inválido en ${form.name}: ${error.message}`);
  }
}
if (forms.length !== 11) fail(`Cantidad inesperada de formularios: ${forms.length}`);
if (formConfig.get('Form Verificar Configuracion Equipo')?.allowBack !== false) fail('La primera decisión no debe volver a la etapa 2');

const forbiddenNames = ['Form Iniciar Etapa 3', 'Form Confirmar Servicio Normalizado'];
for (const name of forbiddenNames) if (nodes.has(name)) fail(`Nodo redundante presente: ${name}`);

const lookup = nodes.get('Consultar Contexto Etapa 2 MySQL');
if (!lookup?.parameters?.query?.includes('FROM CRM.n8n_nsf_etapa2')) fail('La consulta no fija CRM.n8n_nsf_etapa2');
for (const marker of [
  "resultado_etapa_2 = 'continuar_parte_3'",
  "next_step = 'parte_3_configuracion_equipo'",
  "suma_ok = 'Si'",
]) {
  if (!lookup?.parameters?.query?.includes(marker)) fail(`Contrato de entrada incompleto: ${marker}`);
}
if (lookup?.parameters?.options?.queryReplacement !== '={{ [ $json.workflow_session ] }}') fail('Consulta de contexto no parametrizada');

function target(name, branch) {
  return (outgoing.get(name) || []).find((edge) => edge.branch === branch)?.node;
}

function simulate(scenario) {
  let current = 'Form Verificar Configuracion Equipo';
  let query = { workflow_session: `audit-${scenario.name.replace(/\W+/g, '-')}`, tipo_sim: 'Fisica' };
  const visited = [];
  for (let guard = 0; guard < 120; guard += 1) {
    visited.push(current);
    if (current === 'Guardar Etapa 3 MySQL') return { query, visited };
    const node = nodes.get(current);
    if (!node) throw new Error(`Nodo inexistente: ${current}`);
    if (formConfig.has(current)) {
      const cfg = formConfig.get(current);
      const selected = scenario.answers[cfg.field];
      if (!selected || !cfg.options.some((option) => String(option.value) === selected)) {
        throw new Error(`Falta respuesta válida para ${cfg.field} en ${current}`);
      }
      query = Object.fromEntries(Object.entries(query).filter(([key]) => !['__back', '__outcome', '__next_step', cfg.field].includes(key)));
      query[cfg.field] = selected;
      if (cfg.outcome) query.__outcome = cfg.outcome;
      if (cfg.nextStep) query.__next_step = cfg.nextStep;
    }
    if (node.type === 'n8n-nodes-base.if') {
      const conditions = node.parameters.conditions.conditions;
      const actualMatches = conditions.some((condition) => {
        const field = condition.leftValue.match(/\$json\.query\.([A-Za-z0-9_]+)/)?.[1];
        const actual = field === '__back' ? undefined : query[field];
        return actual === condition.rightValue;
      });
      current = target(current, actualMatches ? 0 : 1);
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
    name: 'datos configurados', outcome: 'pqr_solucionada_configuracion',
    answers: { tipo_falla_equipo: 'DatosRed', tipo_equipo_cliente: 'Android', configuracion_plataforma: 'Revisada', configuracion_funciono: 'Si', pqr_configuracion_ok: 'Si' },
  },
  {
    name: 'llamadas falla dispositivo', outcome: 'pqr_solucionada_falla_dispositivo',
    answers: { tipo_falla_equipo: 'Llamadas', dispositivo_alterno: 'Si', prueba_cruzada_funciono: 'Si', pqr_dispositivo_ok: 'Si' },
  },
  {
    name: 'ambas reinicio exitoso', outcome: 'pqr_solucionada_reinicio_sim',
    answers: { tipo_falla_equipo: 'Ambas', tipo_equipo_cliente: 'iPhone', configuracion_plataforma: 'Revisada', configuracion_funciono: 'No', dispositivo_alterno: 'Si', prueba_cruzada_funciono: 'No', reinicio_sim_resultado: 'Si', pqr_reinicio_ok: 'Si' },
  },
  {
    name: 'llamadas segundo nivel', outcome: 'escalado_segundo_nivel',
    answers: { tipo_falla_equipo: 'Llamadas', dispositivo_alterno: 'No', reinicio_sim_resultado: 'No', escalamiento_segundo_nivel: 'Si' },
  },
];

const prepare = nodes.get('Preparar Registro Etapa 3 SQL');
const prepareFn = new Function('$json', '$execution', prepare.parameters.jsCode);
const coverage = new Set();
for (const scenario of scenarios) {
  try {
    const simulated = simulate(scenario);
    simulated.visited.forEach((name) => coverage.add(name));
    const prepared = prepareFn({ query: simulated.query }, { id: 'execution-test' })?.[0]?.json;
    if (prepared.resultado_etapa_3 !== scenario.outcome) fail(`${scenario.name}: resultado ${prepared.resultado_etapa_3}`);
    if (prepared.next_step !== 'fin_flujo') fail(`${scenario.name}: next_step ${prepared.next_step}`);
    JSON.parse(prepared.respuestas_json);
    pass(`${scenario.name}: ${simulated.visited.length} nodos → ${scenario.outcome}`);
  } catch (error) {
    fail(`${scenario.name}: ${error.message}`);
  }
}
for (const form of forms) if (!coverage.has(form.name)) fail(`Ningún escenario cubre ${form.name}`);

const save = nodes.get('Guardar Etapa 3 MySQL');
const placeholders = save?.parameters?.query?.match(/\$\d+/g) || [];
const maxPlaceholder = Math.max(...placeholders.map((value) => Number(value.slice(1))));
const replacements = save?.parameters?.options?.queryReplacement?.match(/\$json\.[A-Za-z0-9_]+/g) || [];
if (maxPlaceholder !== 17 || replacements.length !== 17) fail(`Contrato MySQL inesperado: $${maxPlaceholder}, ${replacements.length} reemplazos`);
if (!save?.parameters?.query?.includes('INSERT INTO CRM.n8n_nsf_etapa3')) fail('El guardado no fija CRM.n8n_nsf_etapa3');
if (!save?.parameters?.query?.includes('ON DUPLICATE KEY UPDATE')) fail('Guardado no idempotente');

const ddl = fs.readFileSync(path.join(root, 'database', '20_etapa3_workbench_setup.sql'), 'utf8');
for (const marker of [
  'USE CRM;', 'CREATE TABLE IF NOT EXISTS n8n_nsf_etapa3',
  'UNIQUE KEY uq_nsf_etapa3_workflow_session', 'REFERENCES n8n_nsf_etapa2 (workflow_session)',
  'CREATE OR REPLACE VIEW vw_n8n_nsf_etapa3',
]) {
  if (!ddl.includes(marker)) fail(`DDL incompleto: ${marker}`);
}

const serialized = JSON.stringify(workflow);
for (const forbidden of ['LUIS FELIPE', '3186305157', '863507063889737']) {
  if (serialized.includes(forbidden)) fail(`Dato personal de ejemplo incrustado: ${forbidden}`);
}

const webhook = nodes.get('Apertura Etapa 3');
if (webhook?.parameters?.httpMethod !== 'GET' || webhook?.parameters?.path !== 'etb-form-parte-3' || webhook?.parameters?.responseMode !== 'responseNode') fail('Webhook etapa 3 incorrecto');
if (workflow.active !== false) fail('El workflow debe importarse inactivo');

const sticky = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.stickyNote');
for (let i = 0; i < sticky.length; i += 1) {
  for (let j = i + 1; j < sticky.length; j += 1) {
    const a = sticky[i];
    const b = sticky[j];
    const overlap = a.position[0] < b.position[0] + Number(b.parameters.width || 0) &&
      a.position[0] + Number(a.parameters.width || 0) > b.position[0] &&
      a.position[1] < b.position[1] + Number(b.parameters.height || 0) &&
      a.position[1] + Number(a.parameters.height || 0) > b.position[1];
    if (overlap) fail(`Bloques visuales superpuestos: ${a.name} / ${b.name}`);
  }
}

for (let i = 0; i < functional.length; i += 1) {
  for (let j = i + 1; j < functional.length; j += 1) {
    const dx = Math.abs(functional[i].position[0] - functional[j].position[0]);
    const dy = Math.abs(functional[i].position[1] - functional[j].position[1]);
    if (dx < 200 && dy < 140) fail(`Nodos demasiado próximos: ${functional[i].name} / ${functional[j].name}`);
  }
}

if (errors.length) {
  console.error('VALIDACIÓN ETAPA 3 FALLIDA');
  errors.forEach((message) => console.error(`✗ ${message}`));
  process.exit(1);
}

console.log('VALIDACIÓN ETAPA 3 OK');
successes.forEach((message) => console.log(`✓ ${message}`));
console.log(`✓ ${functional.length} nodos funcionales, ${forms.length} formularios, ${workflow.nodes.length - functional.length} notas`);
console.log('✓ Contrato etapa 2 → etapa 3, SQL y responsive verificados');
