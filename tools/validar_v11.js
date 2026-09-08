const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'Ningun Servicio Funciona - 1.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];

const names = new Map();
const ids = new Map();
for (const node of workflow.nodes) {
  if (names.has(node.name)) errors.push(`Nombre duplicado: ${node.name}`);
  if (ids.has(node.id)) errors.push(`ID duplicado: ${node.id}`);
  names.set(node.name, node);
  ids.set(node.id, node);
  if (node.credentials) errors.push(`Credencial incrustada: ${node.name}`);
}

const adjacency = new Map([...names.keys()].map((name) => [name, []]));
const incoming = new Map([...names.keys()].map((name) => [name, []]));
for (const [source, value] of Object.entries(workflow.connections)) {
  if (!names.has(source)) errors.push(`Origen inexistente: ${source}`);
  for (const branch of value.main || []) {
    for (const connection of branch || []) {
      if (!names.has(connection.node)) errors.push(`Destino inexistente: ${connection.node}`);
      else {
        adjacency.get(source).push(connection.node);
        incoming.get(connection.node).push(source);
      }
    }
  }
}

const roots = ['Apertura del Flujo', 'Continuar a Etapa 2'];
for (const rootName of roots) {
  if (!names.has(rootName)) errors.push(`Entrada inexistente: ${rootName}`);
}
const queue = [...roots];
const reached = new Set();
while (queue.length) {
  const current = queue.shift();
  if (reached.has(current)) continue;
  reached.add(current);
  queue.push(...(adjacency.get(current) || []));
}

const functional = workflow.nodes.filter((node) => node.type !== 'n8n-nodes-base.stickyNote');
const waitIds = new Set();
for (const node of functional.filter((item) => item.type === 'n8n-nodes-base.wait')) {
  if (!node.webhookId) errors.push(`Wait sin webhookId: ${node.name}`);
  if (waitIds.has(node.webhookId)) errors.push(`webhookId de Wait duplicado: ${node.webhookId}`);
  waitIds.add(node.webhookId);
}
for (const node of functional) {
  if (!reached.has(node.name)) errors.push(`Nodo funcional inalcanzable: ${node.name}`);
  if (!roots.includes(node.name) && incoming.get(node.name).length === 0) {
    errors.push(`Nodo sin entrada: ${node.name}`);
  }
}

const terminals = functional.filter((node) => adjacency.get(node.name).length === 0).map((node) => node.name);
const expectedTerminals = [
  'Enviar Tipo SIM',
  'Redirigir a Etapa 2',
  'Responder Cierre Etapa 1',
  'Responder Handoff Invalido',
].sort();
if (JSON.stringify(terminals.sort()) !== JSON.stringify(expectedTerminals)) {
  errors.push(`Terminales inesperados: ${terminals.join(', ')}`);
}

const mysql = names.get('Guardar Respuestas MySQL');
if (!mysql || mysql.type !== 'n8n-nodes-base.mySql') errors.push('Falta el nodo MySQL final');
else {
  const placeholders = mysql.parameters.query.match(/\$\d+/g) || [];
  const maxPlaceholder = Math.max(...placeholders.map((value) => Number(value.slice(1))));
  if (maxPlaceholder !== 14) errors.push(`Cantidad de parámetros SQL inesperada: ${maxPlaceholder}`);
  if (!mysql.parameters.query.includes('INSERT INTO CRM.GestionesFlujosLog')) errors.push('El guardado no fija el log general del esquema CRM');
  if (!mysql.parameters.query.includes('(workflowSession, codigoFlujo, nombreFlujo, codigoEtapa')) errors.push('El guardado no usa el contrato general de flujo/etapa');
  if (!mysql.parameters.query.includes('ON DUPLICATE KEY UPDATE')) errors.push('El INSERT no es idempotente');
  if (!mysql.parameters.options.queryReplacement.startsWith('={{ [')) errors.push('Los parámetros SQL no usan una matriz de expresiones');
}

if (names.has('Espera Tipo SIM') || names.has('IF Volver Tipo SIM')) {
  errors.push('El cierre Tipo SIM todavia depende de un Wait final');
}
const handoff = names.get('Continuar a Etapa 2');
if (handoff?.type !== 'n8n-nodes-base.webhook' ||
    handoff?.parameters?.httpMethod !== 'GET' ||
    handoff?.parameters?.path !== 'etb-form-handoff' ||
    handoff?.parameters?.responseMode !== 'responseNode') {
  errors.push('Webhook puente de la etapa 2 ausente o mal configurado');
}
if (names.get('Preparar Registro SQL')?.parameters?.jsCode?.includes('new URL(')) {
  errors.push('Preparar Registro SQL conserva una dependencia incompatible de URL');
}

for (const node of functional.filter((item) => item.type === 'n8n-nodes-base.code' && item.name.startsWith('Form '))) {
  const match = node.parameters.jsCode.match(/^const cfg = (\{.*\});$/m);
  if (!match) errors.push(`Formulario sin cfg: ${node.name}`);
  else {
    const cfg = JSON.parse(match[1]);
    const expectedRenderer = node.name === 'Form Tipo SIM' ? 'v11.9-handoff-responsive' : 'v11.9-responsive-homogeneo';
    if (cfg.rendererVersion !== expectedRenderer) errors.push(`Renderer desactualizado: ${node.name}`);
    if (cfg.allowBack && !node.parameters.jsCode.includes('class="back-icon"')) {
      errors.push(`Botón Volver sin estilo v11.3: ${node.name}`);
    }
  }
  const outcomeLines = (node.parameters.jsCode.match(/if \(cfg\.outcome\) rows\.push/g) || []).length;
  if (outcomeLines !== 1) errors.push(`Marcador de salida repetido o ausente en ${node.name}: ${outcomeLines}`);
  if (!node.parameters.jsCode.includes('$execution.mode')) errors.push(`Formulario sin detección de modo: ${node.name}`);
  if (!node.parameters.jsCode.includes('Modo de prueba: vuelve a n8n')) errors.push(`Formulario sin cierre de prueba: ${node.name}`);
  if (node.parameters.jsCode.includes('function getStartUrl()')) errors.push(`Redirección antigua presente: ${node.name}`);
  if (!node.parameters.jsCode.includes('height:56px')) errors.push(`Altura uniforme ausente: ${node.name}`);
  for (const responsiveMarker of ['100svh', '@media(max-width:900px)', '@media(max-width:480px)', '@media(min-width:901px) and (max-width:1600px)', 'orientation:landscape', 'prefers-reduced-motion', 'safe-area-inset-top', 'max-width:620px', 'grid-template-columns:1fr']) {
    if (!node.parameters.jsCode.includes(responsiveMarker)) errors.push(`Responsive incompleto (${responsiveMarker}): ${node.name}`);
  }
  try {
    const render = new Function('$execution', '$json', node.parameters.jsCode);
    const result = render(
      { id: 'test-validation', mode: 'test', resumeUrl: 'https://n8n.example.test/webhook-waiting/test-validation' },
      { query: {} },
    );
    const html = result?.[0]?.json?.html_response || '';
    if (!html.includes('viewport-fit=cover')) errors.push(`Viewport incompleto: ${node.name}`);
    if (!html.includes('@media(max-width:360px)')) errors.push(`HTML sin soporte 320/360 px: ${node.name}`);
    if (!html.includes('@media(min-width:901px) and (max-width:1600px)')) errors.push(`HTML sin modo portátil compacto: ${node.name}`);
    if (html.includes('max-width:1040px') || html.includes('max-width:1100px')) errors.push(`HTML conserva ampliación excesiva de escritorio: ${node.name}`);
  } catch (error) {
    errors.push(`JavaScript inválido en ${node.name}: ${error.message}`);
  }
}

const expectedConditions = {
  'IF linea_activa': ['linea_activa', 'Si'],
  'IF pago_al_dia': ['pago_al_dia', 'Si'],
  'IF iccid_valido': ['iccid_valido', 'Si'],
  'IF registro_imei_ok': ['registro_imei_ok', 'Si'],
  'IF bloqueado': ['bloqueado', 'Si'],
};
for (const [name, [field, expected]] of Object.entries(expectedConditions)) {
  const condition = names.get(name)?.parameters?.conditions?.conditions?.[0];
  if (!condition || !condition.leftValue.includes(field) || condition.rightValue !== expected) {
    errors.push(`Condición incorrecta: ${name}`);
  }
}

const target = (source, branch) => workflow.connections[source]?.main?.[branch]?.[0]?.node;
for (const required of [
  'Form Validar Cobertura y Viaje', 'Enviar Validar Cobertura y Viaje',
  'Espera Validar Cobertura y Viaje', 'IF Volver Validar Cobertura y Viaje',
]) {
  if (!names.has(required)) errors.push(`Falta el paso obligatorio de cobertura: ${required}`);
}
if (target('IF linea_activa', 0) !== 'Form Validar Cobertura y Viaje' ||
    target('IF Volver Validar Cobertura y Viaje', 1) !== 'Form Confirmar Pago') {
  errors.push('La cobertura no está ubicada entre la línea activa y la validación de pagos');
}
const coverageForm = names.get('Form Validar Cobertura y Viaje');
const coverageCfgMatch = coverageForm?.parameters?.jsCode?.match(/^const cfg = (\{.*\});$/m);
const coverageCfg = coverageCfgMatch ? JSON.parse(coverageCfgMatch[1]) : null;
if (coverageCfg?.field !== 'cobertura_viaje' || coverageCfg?.options?.length !== 4) {
  errors.push('La validación de cobertura/viaje no tiene el contrato esperado');
}
const expectedCoverageValues = [
  'NoViajeConCobertura', 'ViajeConCobertura',
  'ViajeSinCobertura', 'NoViajeSinCobertura',
];
if (JSON.stringify(coverageCfg?.options?.map((option) => option.value)) !== JSON.stringify(expectedCoverageValues)) {
  errors.push('La cobertura no contempla las cuatro combinaciones de viaje y señal');
}
if (coverageCfg?.title !== 'Validar sin cobertura y condición de {accent}') {
  errors.push('El título de la validación no usa "sin cobertura"');
}
if (coverageCfg?.options?.some((option) => /roaming/i.test(option.label))) {
  errors.push('La validación de cobertura todavía menciona roaming');
}
for (const marker of ['https://etb.com/cobertura4g.aspx', 'id="coverageMapLink"']) {
  if (!coverageForm?.parameters?.jsCode?.includes(marker)) {
    errors.push(`La validación de cobertura no muestra el mapa oficial ETB: falta ${marker}`);
  }
}
const paymentForm = names.get('Form Confirmar Pago');
const paymentCode = paymentForm?.parameters?.jsCode || '';
for (const marker of ['function syncPaymentButton()', '"Confirmar y reconectar":"Siguiente"']) {
  if (!paymentCode.includes(marker)) errors.push(`El botón de pagos no cambia según el saldo: falta ${marker}`);
}

const imeiPublic = names.get('Form Consultar Registro IMEI');
const imeiCode = imeiPublic?.parameters?.jsCode || '';
for (const marker of [
  'https://tramitescrcom.gov.co/consultaestadoequipo/',
  'id="imeiPublicLink"', 'name="consulta_imei_abierta"',
  'data.get("consulta_imei_abierta")!=="Si"',
]) {
  if (!imeiCode.includes(marker)) errors.push(`Consulta IMEI no obligatoria: falta ${marker}`);
}
if (target('IF registro_imei_ok', 1) !== 'Form Enviar Doc') {
  errors.push('El IMEI no registrado no se transfiere directamente a documentación');
}
if (target('IF bloqueado', 0) !== 'Form Enviar Doc') {
  errors.push('El IMEI bloqueado no se transfiere directamente a documentación');
}
const documentationForm = names.get('Form Enviar Doc');
const documentationMatch = documentationForm?.parameters?.jsCode?.match(/^const cfg = (\{.*\});$/m);
const documentationCfg = documentationMatch ? JSON.parse(documentationMatch[1]) : null;
const expectedDocumentationValues = [
  'TransferirDocumentacion', 'GestionarCanalDigital', 'GestionDigitalRealizada',
];
if (JSON.stringify(documentationCfg?.options?.map((option) => option.value)) !== JSON.stringify(expectedDocumentationValues)) {
  errors.push('La transferencia documental no contiene las tres rutas operativas');
}
if (!documentationCfg?.options?.every((option) => option.description) ||
    !documentationForm?.parameters?.jsCode?.includes('class="radio-description"')) {
  errors.push('Las rutas documentales no muestran su condición de uso');
}
for (const obsolete of [
  'Form Confirmar Proceso', 'Enviar Confirmar Proceso',
  'Espera Confirmar Proceso', 'IF Volver Confirmar Proceso',
]) {
  if (names.has(obsolete)) errors.push(`Ruta antigua de IMEI todavía presente: ${obsolete}`);
}

const simCfgMatch = names.get('Form Tipo SIM')?.parameters?.jsCode?.match(/^const cfg = (\{.*\});$/m);
const simCfg = simCfgMatch ? JSON.parse(simCfgMatch[1]) : null;
if (simCfg?.options?.some((option) => option.value === 'MultiSIM') || simCfg?.options?.length !== 2) {
  errors.push('Tipo de SIM todavía muestra MultiSIM');
}
const prepareCode = names.get('Preparar Registro SQL')?.parameters?.jsCode || '';
for (const marker of ["cobertura_viaje: value('cobertura_viaje')", "consulta_imei_abierta: value('consulta_imei_abierta')"]) {
  if (!prepareCode.includes(marker)) errors.push(`Persistencia incompleta: ${marker}`);
}

const serialized = JSON.stringify(workflow);
if (serialized.includes('MultiSIM')) errors.push('MultiSIM todavía está presente en el JSON de la etapa 1');
for (const forbidden of ["require('fs')", '/files/respuestas_', 'excel_saved']) {
  if (serialized.includes(forbidden)) errors.push(`Contenido heredado no permitido: ${forbidden}`);
}
if (workflow.active !== false) errors.push('La v11 debe importarse inactiva');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`OK: ${functional.length} nodos funcionales, ${workflow.nodes.length - functional.length} notas, persistencia y respuesta final verificadas.`);
