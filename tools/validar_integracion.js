const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const stage1 = load('Ningun Servicio Funciona - 1.json');
const stage2 = load('Ningun Servicio Funciona - 2.json');
const stage3 = load('Ningun Servicio Funciona - 3.json');
const errors = [];
const checks = [];
const ok = (message) => checks.push(message);
const fail = (message) => errors.push(message);

const nodes1 = new Map(stage1.nodes.map((node) => [node.name, node]));
const nodes2 = new Map(stage2.nodes.map((node) => [node.name, node]));
const nodes3 = new Map(stage3.nodes.map((node) => [node.name, node]));
const form = nodes1.get('Form Tipo SIM');
const code = form?.parameters?.jsCode || '';
const cfgMatch = code.match(/^const cfg = (\{.*\});$/m);
const cfg = cfgMatch ? JSON.parse(cfgMatch[1]) : {};

if (cfg.submitPath !== 'etb-form-handoff') fail('Form Tipo SIM no apunta al webhook puente.');
if (cfg.handoffSession !== true) fail('Form Tipo SIM no tiene habilitada la transferencia de sesión.');
if (cfg.finishToStart !== false) fail('Form Tipo SIM todavía intercepta el cierre en el navegador.');
if (cfg.allowBack !== false) fail('Form Tipo SIM todavía ofrece volver a una ejecución ya cerrada.');
if (!code.includes('handoffSubmitUrl')) fail('El formulario no construye la URL del webhook puente.');
if (!errors.length) ok('El formulario Tipo SIM entrega el cierre al webhook puente de n8n');

for (const mode of ['production', 'test']) {
  try {
    const rendered = new Function('$execution', '$json', code)(
      { id: 'integracion', mode, resumeUrl: 'https://n8n.example.test/webhook-waiting/integracion' },
      {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'n8n.example.test',
        },
        query: { __workflow_session: 'sesion-integracion' },
      },
    );
    const html = rendered?.[0]?.json?.html_response || '';
    if (!html.includes('action="https://n8n.example.test/webhook/etb-form-handoff"')) {
      fail(`Destino del formulario puente incorrecto en modo ${mode}.`);
    }
    if (html.includes('/webhook-waiting/undefined')) fail(`El HTML conserva un Wait indefinido en modo ${mode}.`);
  } catch (error) {
    fail(`No fue posible renderizar la transición en modo ${mode}: ${error.message}`);
  }
}
if (!errors.some((error) => error.includes('modo production') || error.includes('modo test'))) {
  ok('El frontend publica directamente al webhook puente en prueba y producción');
}

const webhook1 = nodes1.get('Apertura del Flujo');
const handoffWebhook = nodes1.get('Continuar a Etapa 2');
const webhook2 = nodes2.get('Apertura Etapa 2');
const handoffWebhook2 = nodes2.get('Continuar directamente a Diagnostico de Equipo');
const webhook3 = nodes3.get('Apertura Etapa 3');
if (webhook1?.parameters?.path !== 'etb-form') fail('Webhook de etapa 1 inesperado.');
if (handoffWebhook?.parameters?.httpMethod !== 'GET' ||
    handoffWebhook?.parameters?.path !== 'etb-form-handoff' ||
    handoffWebhook?.parameters?.responseMode !== 'responseNode') {
  fail('Webhook puente de etapa 1 inesperado.');
}
if (webhook2?.parameters?.path !== 'etb-form-parte-2') fail('Webhook de etapa 2 inesperado.');
if (handoffWebhook2?.parameters?.httpMethod !== 'GET' ||
    handoffWebhook2?.parameters?.path !== 'etb-form-parte-2-handoff' ||
    handoffWebhook2?.parameters?.responseMode !== 'responseNode') {
  fail('Webhook puente de etapa 2 inesperado.');
}
if (webhook3?.parameters?.path !== 'etb-form-parte-3') fail('Webhook de etapa 3 inesperado.');
const triggerIds = [webhook1?.webhookId, handoffWebhook?.webhookId, webhook2?.webhookId, handoffWebhook2?.webhookId, webhook3?.webhookId];
if (triggerIds.some((id) => !id) || new Set(triggerIds).size !== triggerIds.length) {
  fail('Los triggers de ambas etapas no tienen webhookId independientes.');
}
if (webhook1?.parameters?.path === 'etb-form' &&
    handoffWebhook?.parameters?.path === 'etb-form-handoff' &&
    webhook2?.parameters?.path === 'etb-form-parte-2' &&
    handoffWebhook2?.parameters?.path === 'etb-form-parte-2-handoff' &&
    webhook3?.parameters?.path === 'etb-form-parte-3') {
  ok('Cinco webhooks independientes y sin colisión');
}

const lookup = nodes2.get('Consultar Contexto Etapa 1 MySQL');
const query = lookup?.parameters?.query || '';
for (const token of [
  'workflow_session = $1',
  "MAX(resultado_etapa_1) = 'continuar_parte_2'",
  "MAX(next_step) = 'parte_2_tipo_sim'",
  'MAX(tipo_sim) IS NOT NULL',
  'AS contrato_canonico',
]) {
  if (!query.includes(token)) fail(`Contrato SQL incompleto: falta ${token}`);
}
if (!errors.some((error) => error.startsWith('Contrato SQL'))) ok('Etapa 2 acepta sesiones existentes y audita el contrato de la etapa 1');

function outgoing(workflow, nodeName) {
  return (workflow.connections[nodeName]?.main || []).flat().map((edge) => edge.node);
}

function reaches(workflow, start, target) {
  const queue = [start];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...outgoing(workflow, current));
  }
  return false;
}

if (!reaches(stage1, 'Form Tipo SIM', 'Enviar Tipo SIM')) {
  fail('El formulario Tipo SIM no se entrega al navegador.');
} else {
  ok('La ejecución inicial termina después de entregar el formulario Tipo SIM');
}

if (nodes1.has('Espera Tipo SIM') || nodes1.has('IF Volver Tipo SIM')) {
  fail('El cierre Tipo SIM conserva el Wait que generaba /webhook-waiting/undefined.');
}

if (!reaches(stage1, 'Continuar a Etapa 2', 'Guardar Respuestas MySQL')) {
  fail('El webhook puente no alcanza la persistencia de la etapa 1.');
} else {
  ok('El webhook puente guarda la sesión antes de redirigir');
}

if (!reaches(stage1, 'IF Entrada Handoff Valida', 'Responder Handoff Invalido')) {
  fail('El webhook puente no responde de forma controlada a entradas inválidas.');
}

if (!reaches(stage1, 'Guardar Respuestas MySQL', 'Responder Cierre Etapa 1')) {
  fail('La rama normal de la etapa 1 no responde después de guardar en MySQL.');
} else {
  ok('Las salidas normales responden después de persistir la gestión');
}

const prepare1 = nodes1.get('Preparar Registro SQL');
const redirect1 = nodes1.get('Redirigir a Etapa 2');
if (!prepare1?.parameters?.jsCode?.includes("'/webhook/etb-form-parte-2?workflow_session='")) {
  fail('Preparar Registro SQL no construye la URL absoluta de la etapa 2.');
}
if (prepare1?.parameters?.jsCode?.includes('new URL(')) {
  fail('Preparar Registro SQL depende del constructor URL no disponible en todos los sandboxes de n8n.');
}
if (redirect1?.parameters?.respondWith !== 'redirect' ||
    !String(redirect1?.parameters?.redirectURL || '').includes('handoff_url')) {
  fail('Falta la respuesta Redirect nativa hacia la etapa 2.');
}
if (!reaches(stage1, 'Guardar Respuestas MySQL', 'Redirigir a Etapa 2')) {
  fail('La salida continuar_parte_2 no alcanza la redirección nativa.');
}
if (!errors.some((error) => error.includes('URL absoluta') || error.includes('Redirect nativa') || error.includes('redirección nativa'))) {
  ok('n8n responde con Redirect después de guardar y conserva workflow_session');
}

try {
  const prepared = new Function('$execution', '$json', prepare1.parameters.jsCode)(
    {
      id: 'integracion-4152',
      resumeUrl: 'https://n8n.example.test/webhook-waiting/integracion-4152',
    },
    {
      webhookUrl: 'https://n8n.example.test/webhook/etb-form-handoff',
      headers: {
        host: 'n8n.example.test',
        'x-forwarded-proto': 'https',
      },
      query: {
        __workflow_session: 'sesion-esim-prueba',
        __outcome: 'continuar_parte_2',
        __next_step: 'parte_2_tipo_sim',
        tipo_sim: 'eSIM',
      },
    },
  )?.[0]?.json;
  const expectedUrl = 'https://n8n.example.test/webhook/etb-form-parte-2?workflow_session=sesion-esim-prueba';
  if (prepared?.handoff_url !== expectedUrl) fail(`URL de handoff inesperada: ${prepared?.handoff_url || 'vacía'}`);
  if (prepared?.tipo_sim !== 'eSIM') fail('El tipo de SIM no se conserva durante el handoff.');
  if (prepared?.resultado_etapa_1 !== 'continuar_parte_2') fail('El resultado de la etapa 1 cambió durante el handoff.');
} catch (error) {
  fail(`No fue posible simular el handoff: ${error.message}`);
}
if (!errors.some((error) => error.includes('handoff'))) ok('Handoff eSIM simulado con URL absoluta y sesión intacta');

if (!reaches(stage2, 'Apertura Etapa 2', 'Consultar Contexto Etapa 1 MySQL')) {
  fail('La apertura de etapa 2 no consulta la etapa 1.');
} else {
  ok('La etapa 2 recupera la gestión anterior desde MySQL');
}

if (!reaches(stage2, 'Guardar Etapa 2 MySQL', 'Responder Cierre Etapa 2')) {
  fail('La etapa 2 no confirma al navegador después de guardar en MySQL.');
} else {
  ok('La etapa 2 responde al navegador después de persistir el cierre');
}

if (nodes2.has('Form Confirmar Servicio Normalizado') || nodes2.has('Espera Confirmar Servicio Normalizado')) {
  fail('La etapa 2 conserva la pantalla redundante de servicio normalizado.');
}
if (nodes2.has('Form Iniciar Etapa 2') || nodes2.has('Espera Iniciar Etapa 2')) {
  fail('La etapa 2 conserva una pantalla intermedia antes de las decisiones.');
}
if (!reaches(stage2, 'Continuar directamente a Diagnostico de Equipo', 'Guardar Etapa 2 MySQL')) {
  fail('El webhook puente de SUMA no alcanza la persistencia.');
}
if (!reaches(stage2, 'Continuar directamente a Diagnostico de Equipo', 'Redirigir a Etapa 3')) {
  fail('El webhook puente de SUMA no alcanza el redirect al diagnóstico del equipo.');
}
if (!reaches(stage2, 'IF SUMA Activo y Recursos', 'Redirigir a Etapa 3')) {
  fail('La rama SUMA correcta no alcanza la etapa 3.');
} else {
  ok('SUMA correcto guarda y redirige sin pantalla intermedia');
}

const prepare2 = nodes2.get('Preparar Registro Etapa 2 SQL');
const redirect2 = nodes2.get('Redirigir a Etapa 3');
const sumaForm = nodes2.get('Form Validar SUMA');
const sumaCfgMatch = String(sumaForm?.parameters?.jsCode || '').match(/^const cfg = (\{.*\});$/m);
const sumaCfg = sumaCfgMatch ? JSON.parse(sumaCfgMatch[1]) : {};
if (sumaCfg.handoffPath !== 'etb-form-parte-2-handoff' || sumaCfg.handoffWhen?.suma_ok !== 'Si') {
  fail('El formulario SUMA no entrega su respuesta positiva al webhook puente.');
}
try {
  const html = new Function('$execution', '$json', sumaForm.parameters.jsCode)(
    { id: 'suma-ui', mode: 'production', resumeUrl: 'https://n8n.example.test/webhook-waiting/434' },
    { query: { workflow_session: 'sesion-etapa3-prueba', tipo_sim: 'Fisica' } },
  )?.[0]?.json?.html_response || '';
  if (!html.includes('https://n8n.example.test/webhook/etb-form-parte-2-handoff')) {
    fail('El frontend SUMA no construye la URL absoluta del webhook puente.');
  }
  if (!html.includes('shouldUseHandoff(data)')) {
    fail('El frontend SUMA no cambia de destino al seleccionar Sí.');
  }
  if (!html.includes('name="__workflow_session" value="sesion-etapa3-prueba"')) {
    fail('El frontend SUMA no conserva la sesión original.');
  }
  if (html.includes('name="workflow_session"')) {
    fail('El frontend SUMA duplica workflow_session en la URL.');
  }
} catch (error) {
  fail(`No fue posible renderizar el handoff SUMA: ${error.message}`);
}
if (redirect2?.parameters?.respondWith !== 'redirect' || !String(redirect2?.parameters?.redirectURL || '').includes('handoff_url')) {
  fail('Redirect nativo de etapa 2 a etapa 3 ausente.');
}
try {
  const normalizeHandoff = nodes2.get('Normalizar Handoff a Diagnostico de Equipo');
  const prepareHandoff = nodes2.get('Preparar Handoff SQL y Continuidad');
  const normalized = new Function('$json', normalizeHandoff.parameters.jsCode)({
    headers: { host: 'n8n.example.test', 'x-forwarded-proto': 'https' },
    query: { __workflow_session: 'sesion-etapa3-prueba', tipo_sim: 'Fisica', suma_ok: 'Si' },
  })?.[0]?.json;
  const handoffContext = new Function('$json', prepareHandoff.parameters.jsCode)({
    ...normalized,
    contexto_valido: 'Si',
    workflow_session: 'sesion-etapa3-prueba',
  })?.[0]?.json;
  const preparedFromBridge = new Function('$json', '$execution', prepare2.parameters.jsCode)(
    handoffContext,
    { id: 'integracion-puente-etapa2', resumeUrl: '' },
  )?.[0]?.json;
  if (preparedFromBridge?.handoff_url !== 'https://n8n.example.test/webhook/etb-form-parte-3?workflow_session=sesion-etapa3-prueba') {
    fail(`El puente real construye una URL inesperada: ${preparedFromBridge?.handoff_url || 'vacía'}`);
  }
} catch (error) {
  fail(`No fue posible simular el webhook puente de SUMA: ${error.message}`);
}
try {
  const prepared2 = new Function('$json', '$execution', prepare2.parameters.jsCode)(
    { query: { workflow_session: 'sesion-etapa3-prueba', tipo_sim: 'Fisica', suma_ok: 'Si' } },
    { id: 'integracion-etapa2', resumeUrl: 'https://n8n.example.test/webhook-waiting/etapa2-integracion' },
  )?.[0]?.json;
  const expectedStage3Url = 'https://n8n.example.test/webhook/etb-form-parte-3?workflow_session=sesion-etapa3-prueba';
  if (prepared2?.resultado_etapa_2 !== 'continuar_parte_3') fail('Etapa 2 no persiste continuar_parte_3.');
  if (prepared2?.next_step !== 'parte_3_configuracion_equipo') fail('Etapa 2 no persiste el next_step de etapa 3.');
  if (prepared2?.handoff_url !== expectedStage3Url) fail(`URL de etapa 3 inesperada: ${prepared2?.handoff_url || 'vacía'}`);
} catch (error) {
  fail(`No fue posible simular etapa 2 → etapa 3: ${error.message}`);
}
if (!errors.some((error) => error.includes('etapa 2 → etapa 3') || error.includes('etapa 3 inesperada'))) {
  ok('Handoff etapa 2 → etapa 3 conserva workflow_session');
}

const lookup3 = nodes3.get('Consultar Contexto Etapa 2 MySQL');
for (const token of [
  "resultado_etapa_2 = 'continuar_parte_3'",
  "next_step = 'parte_3_configuracion_equipo'",
  "suma_ok = 'Si'",
]) {
  if (!lookup3?.parameters?.query?.includes(token)) fail(`Contrato etapa 3 incompleto: ${token}`);
}
if (nodes3.has('Form Iniciar Etapa 3')) fail('La etapa 3 contiene una pantalla de inicio redundante.');
if (!reaches(stage3, 'Preparar Contexto UI Etapa 3', 'Form Verificar Configuracion Equipo')) {
  fail('La etapa 3 no abre directamente la primera decisión.');
} else {
  ok('Etapa 3 inicia directamente con la configuración del equipo');
}
if (!reaches(stage3, 'Guardar Etapa 3 MySQL', 'Responder Cierre Etapa 3')) {
  fail('La etapa 3 no responde después de persistir.');
} else {
  ok('Etapa 3 persiste todos sus cierres antes de responder');
}

const sticky = stage2.nodes.filter((node) => node.type === 'n8n-nodes-base.stickyNote');
for (let i = 0; i < sticky.length; i += 1) {
  for (let j = i + 1; j < sticky.length; j += 1) {
    const a = sticky[i];
    const b = sticky[j];
    const aw = Number(a.parameters.width || 0);
    const ah = Number(a.parameters.height || 0);
    const bw = Number(b.parameters.width || 0);
    const bh = Number(b.parameters.height || 0);
    const overlap = a.position[0] < b.position[0] + bw &&
      a.position[0] + aw > b.position[0] &&
      a.position[1] < b.position[1] + bh &&
      a.position[1] + ah > b.position[1];
    if (overlap) fail(`Bloques visuales superpuestos: ${a.name} / ${b.name}`);
  }
}
if (!errors.some((error) => error.startsWith('Bloques visuales'))) ok('Siete bloques visuales separados, sin superposición');

const functional2 = stage2.nodes.filter((node) => node.type !== 'n8n-nodes-base.stickyNote');
for (let i = 0; i < functional2.length; i += 1) {
  for (let j = i + 1; j < functional2.length; j += 1) {
    const a = functional2[i];
    const b = functional2[j];
    const dx = Math.abs(a.position[0] - b.position[0]);
    const dy = Math.abs(a.position[1] - b.position[1]);
    if (dx < 200 && dy < 140) fail(`Nodos demasiado próximos: ${a.name} / ${b.name}`);
  }
}
if (!errors.some((error) => error.startsWith('Nodos demasiado'))) ok('Nodos funcionales con separación visual suficiente');

if (errors.length) {
  console.error('VALIDACIÓN DE INTEGRACIÓN FALLÓ');
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}

console.log('VALIDACIÓN DE INTEGRACIÓN OK');
for (const check of checks) console.log(`✓ ${check}`);
