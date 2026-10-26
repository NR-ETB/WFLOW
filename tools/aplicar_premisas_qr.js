// Cambios operativos del 26/10/2026. No envía QR ni ejecuta acciones en SUMA.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'Ningun Servicio Funciona - 2.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
const get = name => {
  const node = workflow.nodes.find(n => n.name === name);
  if (!node) throw new Error('No existe ' + name);
  return node;
};
const edge = node => ({ node, type: 'main', index: 0 });
const connect = (from, ...to) => { workflow.connections[from] = { main: to.map(name => [edge(name)]) }; };
const put = node => {
  const old = workflow.nodes.find(n => n.name === node.name);
  if (old) Object.assign(old, node, { position: old.position }); else workflow.nodes.push(node);
};
const patchCfg = (node, update) => {
  node.parameters.jsCode = node.parameters.jsCode.replace(/^const cfg = (\{.*\});$/m,
    (_, json) => 'const cfg = ' + JSON.stringify(update(JSON.parse(json))) + ';');
};
const base = get('Form Linea Portada').parameters.jsCode;
const styles = '.premisas{padding:18px;margin:0 0 22px;border:1px solid #225473;border-radius:14px;background:#081a34;color:#c4d3e6;font-size:14px;line-height:1.6}.premisas h2{font-size:17px;color:#38c7ff;margin-bottom:14px}.premisas h3{font-size:14px;color:#f0f6ff;margin:16px 0 8px}.premisas ul,.premisas ol{padding-left:22px}.premisas li{margin:7px 0}.premisas details{border:1px solid #24496c;border-radius:10px;padding:12px;margin:10px 0}.premisas summary{cursor:pointer;color:#38c7ff;font-weight:700}.premisas p{margin:8px 0}.reenvio-confirmacion{display:flex;align-items:flex-start;gap:10px;padding:14px;background:#081a34;border:1px solid #225473;border-radius:12px;margin:0 0 20px;color:#c4d3e6;font-size:14px;line-height:1.5}.reenvio-confirmacion input{width:18px;height:18px;margin-top:3px;flex:none;accent-color:#1da1f2}';
function addForm(name, field, title, subtitle, question, panel, confirmation = false) {
  const node = { id: 'qr-' + field, name, type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [0, 0], parameters: { jsCode: base } };
  patchCfg(node, cfg => ({ ...cfg, field, title, titleAccent: '', subtitle, question,
    tag: confirmation ? 'Diagnóstico · Reenvío de QR' : 'Diagnóstico · Premisas SIM Virtual',
    allowBack: true, options: [{ value: 'Si', label: 'SÍ FUNCIONA' }, { value: 'No', label: 'NO FUNCIONA' }],
    finishToStart: false, finishToStartWhen: {}, finishMode: 'continue', outcome: null, nextStep: null,
    handoffPath: '', handoffWhen: {} }));
  if (!confirmation) {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "const incomingQuery = (typeof $json === 'object' && $json && $json.query) ? $json.query : {};",
      "const incomingQuery = { ...((typeof $json === 'object' && $json && $json.query) ? $json.query : {}) };\nfor (const key of ['qr_reenvio_ok', 'qr_reenvio_confirmado', 'gestor_qr_ok']) delete incomingQuery[key];");
  } else {
    node.parameters.jsCode = node.parameters.jsCode.replace("new Set(['__back','__outcome','__next_step'])",
      "new Set(['__back','__outcome','__next_step','qr_reenvio_confirmado'])");
  }
  const checkbox = '<label class="reenvio-confirmacion" for="qrReenvioConfirmado"><input id="qrReenvioConfirmado" type="checkbox" name="qr_reenvio_confirmado" value="Si" required>Confirmo que realicé el reenvío del código QR desde SUMA y se lo informé al cliente.</label>';
  const client = '<script>(function(){var form=document.getElementById("f"),check=document.getElementById("qrReenvioConfirmado"),error=document.getElementById("errBanner");form.addEventListener("submit",function(event){if((event.submitter&&event.submitter.name==="__back")||form.dataset.intent==="back"){check.disabled=true;return;}if(!check.checked){event.preventDefault();event.stopImmediatePropagation();error.textContent="Confirma el reenvío manual desde SUMA antes de continuar.";error.classList.add("is-visible");error.style.display="flex";}},true);})();</script>';
  const ending = `let html = renderForm().replace('</style>', ${JSON.stringify(styles)} + '</style>')
  .replace('<div class="err-banner"', ${JSON.stringify(panel)} + '<div class="err-banner"');
${confirmation ? `html = html.replace('<div class="label"', ${JSON.stringify(checkbox)} + '<div class="label"').replace('</body>', ${JSON.stringify(client)} + '</body>');` : ''}
return [{ json: { html_response: html } }];`;
  node.parameters.jsCode = node.parameters.jsCode.replace('return [{ json: { html_response: renderForm() } }];', ending);
  put(node);
  const suffix = name.replace(/^Form /, '');
  for (const [prefix, type, parameters, version] of [
    ['Enviar ', 'respondToWebhook', { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: {} }, 1.5],
    ['Espera ', 'wait', { resume: 'webhook', responseMode: 'responseNode', options: {} }, 1.1],
  ]) put({ id: 'qr-' + prefix.trim().toLowerCase() + '-' + field, name: prefix + suffix,
    type: 'n8n-nodes-base.' + type, typeVersion: version, position: [0, 0], parameters,
    ...(type === 'wait' ? { webhookId: workflow.nodes.find(n => n.name === prefix + suffix)?.webhookId || require('node:crypto').randomUUID() } : {}) });
  connect(name, 'Enviar ' + suffix);
  connect('Enviar ' + suffix, 'Espera ' + suffix);
  connect('Espera ' + suffix, 'IF Volver ' + suffix);
}
function addIf(name, field, value, yes, no) {
  put({ id: 'qr-if-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name,
    type: 'n8n-nodes-base.if', typeVersion: 2.3, position: [0, 0], parameters: {
      conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 3 },
        conditions: [{ id: 'qr-cond-' + field + '-' + value, leftValue: '={{ $json.query.' + field + ' }}',
          rightValue: value, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} } });
  connect(name, yes, no);
}
addForm('Form Premisas SIM Virtual', 'qr_premisas_ok', 'Premisas para instalar la SIM Virtual ETB',
  'Verifica los requisitos y guía al cliente en los pasos de instalación. Si el QR funciona, continúa al soporte normal de la eSIM.',
  '¿EL QR FUNCIONA DESPUÉS DE APLICAR LAS PREMISAS?',
  fs.readFileSync(path.join(__dirname, 'premisas_sim_virtual.html'), 'utf8'));
addForm('Form Reenvio QR SUMA', 'qr_reenvio_ok', 'Reenviar el código QR desde SUMA',
  'El asesor debe realizar el reenvío manual del QR desde SUMA. Este flujo no envía el código automáticamente.',
  '¿EL QR FUNCIONA DESPUÉS DEL REENVÍO?',
  '<section class="premisas"><h2>Confirma el reenvío al cliente</h2><p>Realiza el reenvío desde SUMA e informa al cliente que el código QR fue reenviado. Pídele revisar su recepción y escanearlo nuevamente, con conexión Wi-Fi.</p><p>Marca la confirmación solamente después de completar el reenvío. Si el QR funciona, continúa al soporte normal. Si no funciona, crea el trámite de renovación mediante escalamiento al gestor.</p></section>', true);
addIf('IF Volver Premisas SIM Virtual', '__back', '1', 'Form Confirmar Funcionalidad Post QR', 'IF QR Funciona Tras Premisas');
addIf('IF QR Funciona Tras Premisas', 'qr_premisas_ok', 'Si', 'Form Linea Portada', 'Form Reenvio QR SUMA');
addIf('IF Volver Reenvio QR SUMA', '__back', '1', 'Form Premisas SIM Virtual', 'IF Reenvio QR Confirmado');
addIf('IF Reenvio QR Confirmado', 'qr_reenvio_confirmado', 'Si', 'IF QR Funciona Tras Reenvio', 'Form Reenvio QR SUMA');
addIf('IF QR Funciona Tras Reenvio', 'qr_reenvio_ok', 'Si', 'Form Linea Portada', 'Form Escalar Gestor QR');
workflow.connections['IF Servicio Post QR Funciona'].main[1] = [edge('Form Premisas SIM Virtual')];
workflow.connections['IF Volver Escalar Gestor QR'].main[0] = [edge('IF Renovacion Desde Reenvio QR')];
addIf('IF Renovacion Desde Reenvio QR', 'qr_reenvio_ok', 'No', 'Form Reenvio QR SUMA', 'Form Gestionar QR');
const escalation = get('Form Escalar Gestor QR');
patchCfg(escalation, cfg => ({ ...cfg, title: 'Crear trámite de renovación del {accent}',
  subtitle: 'El QR superó las 24 horas. Crea el trámite de renovación y confirma el escalamiento al gestor mediante la siguiente plantilla.' }));
if (!escalation.parameters.jsCode.includes('cfg.outcome = \'gestor_qr_renovacion\'')) {
  escalation.parameters.jsCode = escalation.parameters.jsCode.replace(/^(const cfg = \{.*\};)$/m,
    `$1\nif (incomingQuery.qr_reenvio_ok === 'No' && incomingQuery.qr_reenvio_confirmado === 'Si') {
  cfg.outcome = 'gestor_qr_renovacion';
  cfg.subtitle = 'El QR continúa sin funcionar después de aplicar las premisas y realizar el reenvío desde SUMA. Crea el trámite de renovación y confirma el escalamiento al gestor con esta plantilla.';
}`);
}
patchCfg(get('Form Confirmar Funcionalidad Post QR'), cfg => ({ ...cfg,
  subtitle: 'Después de instalar o reutilizar el QR, confirma si el servicio ya funciona. Si funciona, finaliza la gestión. Si la falla continúa, revisa las premisas de instalación de la SIM Virtual.' }));
patchCfg(get('Form Validar SUMA'), cfg => ({ ...cfg,
  options: [...cfg.options.filter(o => o.value !== 'PospagoSinRecursos'),
    { value: 'PospagoSinRecursos', label: 'Activo sin recursos o recursos incompletos (pospago)' }],
  handoffWhen: { suma_ok: ['PospagoConRecursos', 'PrepagoConRecursos', 'PrepagoSinRecursos', 'PospagoSinRecursos'] } }));
const sumaForm = get('Form Validar SUMA');
if (!sumaForm.parameters.jsCode.includes('suma-four-options')) {
  const css = '.suma-four-options{display:none}@media(min-width:901px){.radio-group{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  sumaForm.parameters.jsCode = sumaForm.parameters.jsCode.replace('html_response: renderForm()',
    'html_response: renderForm().replace(\'</style>\', ' + JSON.stringify(css) + ' + \'</style>\')');
}
for (const [name, rightValue] of [['IF SUMA Activo y Recursos', 'PospagoSinRecursos'], ['IF Mostrar Cierre Sin Recursos', 'PospagoSinRecursos:']]) {
  const conditions = get(name).parameters.conditions;
  if (!conditions.conditions.some(c => c.rightValue === rightValue)) conditions.conditions.push({
    ...conditions.conditions[0], id: 'pospago-' + name, rightValue,
  });
  conditions.combinator = 'or';
}
const prepare = get('Preparar Registro Etapa 2 SQL');
let code = prepare.parameters.jsCode;
code = code.replace("const finalQr = outcome === 'gestor_qr_vencido';", "const finalQr = ['gestor_qr_vencido', 'gestor_qr_renovacion'].includes(outcome);");
code = code.replace("['gestor_qr_vencido','gestor_nip_vencido'", "['gestor_qr_vencido','gestor_qr_renovacion','gestor_nip_vencido'");
if (!code.includes('qr_premisas_ok:')) code = code.replace("  servicio_post_qr: rutaVirtual ? raw('servicio_post_qr') : null,",
  "  servicio_post_qr: rutaVirtual ? raw('servicio_post_qr') : null,\n  qr_premisas_ok: rutaVirtual ? raw('qr_premisas_ok') : null,\n  qr_reenvio_confirmado: rutaVirtual && raw('qr_premisas_ok') === 'No' ? raw('qr_reenvio_confirmado') : null,\n  qr_reenvio_ok: rutaVirtual && raw('qr_premisas_ok') === 'No' ? raw('qr_reenvio_ok') : null,");
prepare.parameters.jsCode = code;
workflow.versionId = 'postgres-flujo-2-20261026-qr-premisas';
prepare.parameters.jsCode = prepare.parameters.jsCode.replace(/workflow_version: '[^']*'/,
  "workflow_version: 'postgres-flujo-2-20261026-qr-premisas'");
fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
const thirdFile = path.join(root, 'Ningun Servicio Funciona - 3.json');
const third = JSON.parse(fs.readFileSync(thirdFile, 'utf8'));
const summary = third.nodes.find(n => n.name === 'Form Resumen y Observaciones');
third.versionId = 'postgres-flujo-3-20261026-resumen-qr';
const thirdPrepare = third.nodes.find(n => n.name === 'Preparar Registro Etapa 3 SQL');
thirdPrepare.parameters.jsCode = thirdPrepare.parameters.jsCode.replace(/workflow_version: '[^']*'/,
  "workflow_version: 'postgres-flujo-3-20261026-resumen-qr'");
if (!summary.parameters.jsCode.includes('PospagoSinRecursos:')) summary.parameters.jsCode = summary.parameters.jsCode.replace("  Si:'Sí', No:'No',", "  PospagoSinRecursos:'Activo sin recursos o recursos incompletos (pospago)',\n  Si:'Sí', No:'No',");
if (!summary.parameters.jsCode.includes("['Premisas QR'")) summary.parameters.jsCode = summary.parameters.jsCode.replace("['SUMA',a2.suma_ok]", "['SUMA',a2.suma_ok],['Premisas QR',a2.qr_premisas_ok],['Reenvío QR confirmado',a2.qr_reenvio_confirmado],['QR después del reenvío',a2.qr_reenvio_ok]");
fs.writeFileSync(thirdFile, JSON.stringify(third, null, 2) + '\n');
console.log('Premisas, reenvío manual SUMA, renovación QR y pospago sin recursos aplicados.');
