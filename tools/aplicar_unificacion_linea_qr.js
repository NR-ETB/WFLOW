// Reglas del 27/10/2026: una sola validación de línea/pagos y eSIM instalada directa a soporte.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function load(stage) { return JSON.parse(fs.readFileSync(path.join(root, `Ningun Servicio Funciona - ${stage}.json`), 'utf8')); }
const save = (stage, workflow) => fs.writeFileSync(path.join(root, `Ningun Servicio Funciona - ${stage}.json`), JSON.stringify(workflow, null, 2) + '\n');
const get = (workflow, name) => {
  const node = workflow.nodes.find(n => n.name === name);
  if (!node) throw new Error('No existe ' + name);
  return node;
};
const patchCfg = (node, update) => {
  node.parameters.jsCode = node.parameters.jsCode.replace(/^const cfg = (\{.*\});$/m,
    (_, json) => 'const cfg = ' + JSON.stringify(update(JSON.parse(json))) + ';');
};
const edge = node => ({ node, type: 'main', index: 0 });
const connect = (workflow, name, ...targets) => { workflow.connections[name] = { main: targets.map(target => [edge(target)]) }; };
function put(workflow, node) {
  const old = workflow.nodes.find(n => n.name === node.name);
  if (old) Object.assign(old, node, { position: old.position }); else workflow.nodes.push(node);
}
const w1 = load(1);
const first = get(w1, 'Form Verificar Linea');
patchCfg(first, cfg => ({ ...cfg, title: 'Verificar estado de la línea y {accent}', titleAccent: 'pagos',
  subtitle: 'Confirma si la línea está activa o suspendida y valida si el cliente tiene saldos pendientes de pago.',
  tag: 'Diagnóstico · Línea y pagos', errorMsg: 'Selecciona el estado de la línea y el estado de pagos antes de continuar' }));
if (!first.parameters.jsCode.includes('function unifiedPaymentOptions()')) {
  const helper = `function unifiedPaymentOptions() {
  if (cfg.field !== 'linea_activa') return '';
  const selected = fieldValue('pago_al_dia');
  const options = [['Si','Sí, está al día / ya realizó el pago'],['No','No, tiene saldo pendiente']];
  return '<div class="label" id="paymentLabel">ESTADO DE PAGOS</div><div class="radio-group" role="radiogroup" aria-labelledby="paymentLabel">' + options.map(([value,label]) => '<div class="radio"><input type="radio" id="pago-' + value + '" name="pago_al_dia" value="' + value + '" required' + (selected === value ? ' checked' : '') + '><label for="pago-' + value + '">' + esc(label) + '</label></div>').join('') + '</div>';
}
`;
  first.parameters.jsCode = first.parameters.jsCode.replace('function renderForm(){', helper + 'function renderForm(){');
  first.parameters.jsCode = first.parameters.jsCode.replace(
    "key === cfg.field || key === '__workflow_session'", "key === cfg.field || (cfg.field === 'linea_activa' && key === 'pago_al_dia') || key === '__workflow_session'");
  const marker = "+ optionHtml() + '</div><div class=\"actions\">'";
  if (!first.parameters.jsCode.includes(marker)) throw new Error('No se encontró el grupo de opciones del formulario inicial.');
  first.parameters.jsCode = first.parameters.jsCode.replace(marker,
    "+ optionHtml() + '</div>' + unifiedPaymentOptions() + '<div class=\"actions\">'");
}
// La misma fuente se usa para clonar el aviso de pago: el segundo grupo solo
// se renderiza cuando cfg.field es linea_activa, nunca en las otras pantallas.
const notice = get(w1, 'Form Saldo Pendiente');
patchCfg(notice, cfg => ({ ...cfg, buttonLabel: 'Continuar', options: [
  { value: 'Si', label: 'Cliente informado; aún debe realizar el pago' },
  { value: 'PagoRealizado', label: 'El cliente confirma que ya realizó el pago' },
] }));
const obsolete = new Set(['Form Confirmar Pago', 'Enviar Confirmar Pago', 'Espera Confirmar Pago', 'IF Volver Confirmar Pago']);
w1.nodes = w1.nodes.filter(n => !obsolete.has(n.name));
for (const name of obsolete) delete w1.connections[name];
connect(w1, 'Espera Verificar Linea', 'IF pago_al_dia');
connect(w1, 'IF pago_al_dia', 'IF linea_activa', 'Form Saldo Pendiente');
connect(w1, 'IF linea_activa', 'Form Validar Cobertura y Viaje', 'Marcar Pago Reportado Cliente');
connect(w1, 'IF Volver Validar Cobertura y Viaje', 'Form Verificar Linea', 'Form Validar ICCID');
connect(w1, 'IF Volver Saldo Pendiente', 'Form Verificar Linea', 'IF Cliente Reporta Pago');
put(w1, { id: 'cliente-reporta-pago', name: 'IF Cliente Reporta Pago', type: 'n8n-nodes-base.if', typeVersion: 2.3,
  position: [0, 0], parameters: { conditions: {
    options: { caseSensitive: true, typeValidation: 'strict', version: 3 }, combinator: 'and',
    conditions: [{ id: 'pago-reportado-cliente', leftValue: '={{ $json.query.pago_pendiente_informado }}', rightValue: 'PagoRealizado', operator: { type: 'string', operation: 'equals' } }],
  }, options: {} } });
put(w1, { id: 'marcar-pago-cliente', name: 'Marcar Pago Reportado Cliente', type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [0, 0], parameters: { jsCode: `const query = { ...($json.query || {}) };
delete query.__outcome;
delete query.__next_step;
delete query.__back;
query.pago_confirmado_cliente = 'Si';
return [{ json: { ...$json, query } }];` } });
connect(w1, 'IF Cliente Reporta Pago', 'Marcar Pago Reportado Cliente', 'Preparar Registro SQL');
connect(w1, 'Marcar Pago Reportado Cliente', 'Form Escalar GESTFAC');
for (const outputs of Object.values(w1.connections)) for (const branch of outputs.main || []) {
  for (const current of branch) if (obsolete.has(current.node)) current.node = 'Form Verificar Linea';
}
const prepared = get(w1, 'Preparar Registro SQL');
if (!prepared.parameters.jsCode.includes('pago_confirmado_cliente:')) prepared.parameters.jsCode = prepared.parameters.jsCode.replace(
  "  pago_pendiente_informado: value('pago_pendiente_informado'),",
  "  pago_pendiente_informado: value('pago_pendiente_informado'),\n  pago_confirmado_cliente: value('pago_confirmado_cliente'),");
w1.versionId = 'postgres-flujo-1-20261027-linea-pagos';
prepared.parameters.jsCode = prepared.parameters.jsCode.replace(/workflow_version: '[^']*'/,
  "workflow_version: 'postgres-flujo-1-20261027-linea-pagos'");
save(1, w1);
const w2 = load(2);
put(w2, { id: 'qr-ya-instalado', name: 'IF QR Ya Instalado', type: 'n8n-nodes-base.if', typeVersion: 2.3,
  position: [0, 0], parameters: { conditions: {
    options: { caseSensitive: true, typeValidation: 'strict', version: 3 }, combinator: 'and',
    conditions: [{ id: 'qr-instalado-directo', leftValue: '={{ $json.query.qr_estado }}', rightValue: 'Instalado', operator: { type: 'string', operation: 'equals' } }],
  }, options: {} } });
connect(w2, 'IF Volver Gestionar QR', 'Form Gestionar QR', 'IF QR Ya Instalado');
connect(w2, 'IF QR Ya Instalado', 'Form Linea Portada', 'IF QR Cumplio 24 Horas');
patchCfg(get(w2, 'Form Gestionar QR'), cfg => ({ ...cfg,
  subtitle: 'Si la eSIM quedó instalada, continúa al soporte normal. Si el QR no funciona, reutiliza el código antes de 24 horas o escala cuando se cumpla ese plazo.' }));
w2.versionId = 'postgres-flujo-2-20261027-esim-instalada';
get(w2, 'Preparar Registro Etapa 2 SQL').parameters.jsCode = get(w2, 'Preparar Registro Etapa 2 SQL').parameters.jsCode.replace(
  /workflow_version: '[^']*'/, "workflow_version: 'postgres-flujo-2-20261027-esim-instalada'");
save(2, w2);
const w3 = load(3);
w3.versionId = 'postgres-flujo-3-20261027-reinicio';
const thirdPrepare = get(w3, 'Preparar Registro Etapa 3 SQL');
thirdPrepare.parameters.jsCode = thirdPrepare.parameters.jsCode.replace(/workflow_version: '[^']*'/,
  "workflow_version: 'postgres-flujo-3-20261027-reinicio'");
save(3, w3);
console.log('Línea/pagos unificados; pago reportado deriva a GESTFAC; eSIM instalada continúa directamente a soporte.');
