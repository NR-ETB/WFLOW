// Paso informativo de pago y enlace IMEI explícito. No realiza pagos ni reconexiones.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'Ningun Servicio Funciona - 1.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
const get = name => {
  const node = workflow.nodes.find(n => n.name === name);
  if (!node) throw new Error('No existe ' + name);
  return node;
};
const patchCfg = (node, update) => {
  node.parameters.jsCode = node.parameters.jsCode.replace(/^const cfg = (\{.*\});$/m,
    (_, json) => 'const cfg = ' + JSON.stringify(update(JSON.parse(json))) + ';');
};
const put = node => {
  const old = workflow.nodes.find(n => n.name === node.name);
  if (old) Object.assign(old, node, { position: old.position }); else workflow.nodes.push(node);
};
const edge = node => ({ node, type: 'main', index: 0 });
const connect = (name, ...targets) => { workflow.connections[name] = { main: targets.map(target => [edge(target)]) }; };
const payment = workflow.nodes.find(node => node.name === 'Form Confirmar Pago');
if (payment) {
  patchCfg(payment, cfg => ({ ...cfg, finishToStart: false, finishToStartWhen: {}, outcome: null, nextStep: null }));
  payment.parameters.jsCode = payment.parameters.jsCode.replaceAll('Confirmar y reconectar', 'Continuar');
}
const message = 'Si el cliente presenta saldos pendientes de pago, deberá realizar el pago correspondiente para poder continuar con la gestión y contar nuevamente con el servicio.';
const form = { id: 'saldo-pendiente-form', name: 'Form Saldo Pendiente', type: 'n8n-nodes-base.code',
  typeVersion: 2, position: [0, 0], parameters: { jsCode: get('Form Verificar Linea').parameters.jsCode } };
patchCfg(form, cfg => ({ ...cfg, field: 'pago_pendiente_informado', title: 'Pago pendiente para continuar la {accent}',
  titleAccent: 'gestión', subtitle: message, question: 'INFORMACIÓN AL CLIENTE', tag: 'Diagnóstico · Saldo pendiente',
  allowBack: true, buttonLabel: 'Finalizar gestión', options: [{ value: 'Si', label: 'Cliente informado del pago pendiente' }],
  finishToStart: false, finishToStartWhen: {}, outcome: 'pago_pendiente', nextStep: 'fin_etapa_1' }));
put(form);
put({ id: 'saldo-pendiente-enviar', name: 'Enviar Saldo Pendiente', type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.5, position: [0, 0], parameters: { respondWith: 'text', responseBody: '={{ $json.html_response }}', options: {} } });
put({ id: 'saldo-pendiente-espera', name: 'Espera Saldo Pendiente', type: 'n8n-nodes-base.wait', typeVersion: 1.1,
  webhookId: workflow.nodes.find(n => n.name === 'Espera Saldo Pendiente')?.webhookId || require('node:crypto').randomUUID(),
  position: [0, 0], parameters: { resume: 'webhook', responseMode: 'responseNode', options: {} } });
put({ id: 'saldo-pendiente-volver', name: 'IF Volver Saldo Pendiente', type: 'n8n-nodes-base.if', typeVersion: 2.3,
  position: [0, 0], parameters: { conditions: {
    options: { caseSensitive: true, typeValidation: 'strict', version: 3 },
    conditions: [{ id: 'saldo-volver', leftValue: '={{ $json.query.__back }}', rightValue: '1',
      operator: { type: 'string', operation: 'equals' } }], combinator: 'and',
  }, options: {} } });
workflow.connections['IF pago_al_dia'].main[1] = [edge(form.name)];
connect(form.name, 'Enviar Saldo Pendiente');
connect('Enviar Saldo Pendiente', 'Espera Saldo Pendiente');
connect('Espera Saldo Pendiente', 'IF Volver Saldo Pendiente');
connect('IF Volver Saldo Pendiente', 'Form Confirmar Pago', 'Preparar Registro SQL');
const imei = get('Form Consultar Registro IMEI');
patchCfg(get('Form Validar Cobertura y Viaje'), cfg => ({ ...cfg,
  title: 'Validar mapa de cobertura y condición de {accent}' }));
patchCfg(imei, cfg => ({ ...cfg, titleAccent: 'IMEI Colombia',
  subtitle: 'Abre IMEI Colombia, consulta el IMEI y luego confirma el resultado. El flujo no permite continuar sin abrir el enlace.',
  errorMsg: 'Primero abre IMEI Colombia y selecciona el resultado', requiredLink: 'https://www.imeicolombia.com.co/',
  requiredLinkLabel: 'Abrir IMEI Colombia' }));
let code = get('Preparar Registro SQL').parameters.jsCode;
if (!code.includes('pago_pendiente_informado:')) code = code.replace("  pago_al_dia: value('pago_al_dia'),",
  "  pago_al_dia: value('pago_al_dia'),\n  pago_pendiente_informado: value('pago_pendiente_informado'),");
code = code.replace("const estadoGestion = outcome === 'continuar_parte_2' ? 'EnCurso' :",
  "const estadoGestion = outcome === 'pago_pendiente' ? 'Pendiente' : outcome === 'continuar_parte_2' ? 'EnCurso' :");
workflow.versionId = 'postgres-flujo-1-20261026-pago-imei';
code = code.replace(/workflow_version: '[^']*'/, "workflow_version: 'postgres-flujo-1-20261026-pago-imei'");
get('Preparar Registro SQL').parameters.jsCode = code;
fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
console.log('Etapa 1: saldo pendiente informativo y enlace exacto IMEI Colombia aplicados.');
