const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'Ningun Servicio Funciona - v11.7 Auditada CRM Responsive SQL.json');
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

const queue = ['Apertura del Flujo'];
const reached = new Set();
while (queue.length) {
  const current = queue.shift();
  if (reached.has(current)) continue;
  reached.add(current);
  queue.push(...(adjacency.get(current) || []));
}

const functional = workflow.nodes.filter((node) => node.type !== 'n8n-nodes-base.stickyNote');
for (const node of functional) {
  if (!reached.has(node.name)) errors.push(`Nodo funcional inalcanzable: ${node.name}`);
  if (node.name !== 'Apertura del Flujo' && incoming.get(node.name).length === 0) {
    errors.push(`Nodo sin entrada: ${node.name}`);
  }
}

const terminals = functional.filter((node) => adjacency.get(node.name).length === 0).map((node) => node.name);
if (terminals.length !== 1 || terminals[0] !== 'Guardar Respuestas MySQL') {
  errors.push(`Terminales inesperados: ${terminals.join(', ')}`);
}

const mysql = names.get('Guardar Respuestas MySQL');
if (!mysql || mysql.type !== 'n8n-nodes-base.mySql') errors.push('Falta el nodo MySQL final');
else {
  const placeholders = mysql.parameters.query.match(/\$\d+/g) || [];
  const maxPlaceholder = Math.max(...placeholders.map((value) => Number(value.slice(1))));
  if (maxPlaceholder !== 18) errors.push(`Cantidad de parámetros SQL inesperada: ${maxPlaceholder}`);
  if (!mysql.parameters.query.includes('ON DUPLICATE KEY UPDATE')) errors.push('El INSERT no es idempotente');
  if (!mysql.parameters.options.queryReplacement.startsWith('={{ [')) errors.push('Los parámetros SQL no usan una matriz de expresiones');
}

for (const node of functional.filter((item) => item.type === 'n8n-nodes-base.code' && item.name.startsWith('Form '))) {
  const match = node.parameters.jsCode.match(/^const cfg = (\{.*\});$/m);
  if (!match) errors.push(`Formulario sin cfg: ${node.name}`);
  else {
    const cfg = JSON.parse(match[1]);
    if (cfg.rendererVersion !== 'v11.7') errors.push(`Renderer desactualizado: ${node.name}`);
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
  for (const responsiveMarker of ['100svh', '@media(max-width:900px)', '@media(max-width:480px)', 'orientation:landscape', 'prefers-reduced-motion', 'safe-area-inset-top', 'max-width:1040px', 'grid-template-columns:1fr']) {
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
    if (!html.includes('@media(min-width:1200px)')) errors.push(`HTML sin escala Full HD: ${node.name}`);
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

const serialized = JSON.stringify(workflow);
for (const forbidden of ["require('fs')", '/files/respuestas_', 'excel_saved']) {
  if (serialized.includes(forbidden)) errors.push(`Contenido heredado no permitido: ${forbidden}`);
}
if (workflow.active !== false) errors.push('La v11 debe importarse inactiva');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`OK: ${functional.length} nodos funcionales, ${workflow.nodes.length - functional.length} notas, un único cierre MySQL.`);
