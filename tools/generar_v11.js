const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'Ningun Servicio Funciona - v10 Etiquetas con Imagenes.json');
const outputPath = path.join(root, 'Ningun Servicio Funciona - 1.json');

const workflow = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const obsoleteNodes = new Set([
  'Form Verificar Estado',
  'Enviar Verificar Estado',
  'Espera Verificar Estado',
  'IF estado_linea',
  'IF Volver Verificar Estado',
  'IF Volver Validar ICCID desde Pago',
  'IF Volver Escalar Gestor desde GESTFAC',
]);

workflow.nodes = workflow.nodes.filter((node) => !obsoleteNodes.has(node.name));

function getNode(name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No se encontró el nodo: ${name}`);
  return node;
}

function cloneNode(sourceName, overrides) {
  const clone = JSON.parse(JSON.stringify(getNode(sourceName)));
  Object.assign(clone, overrides);
  workflow.nodes.push(clone);
  return clone;
}

function slug(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function patchForm(nodeName, changes) {
  const node = getNode(nodeName);
  const code = node.parameters.jsCode;
  const match = code.match(/^const cfg = (\{.*\});$/m);
  if (!match) throw new Error(`No se encontró cfg en ${nodeName}`);

  const cfg = Object.assign(JSON.parse(match[1]), changes, {
    rendererVersion: 'v11.7',
    startPath: changes.startPath || 'etb-form',
    backButtonLabel: 'Volver',
  });

  let updated = code.replace(match[0], `const cfg = ${JSON.stringify(cfg)};`);
  if (!updated.includes("'__outcome','__next_step'")) {
    updated = updated.replace(
      "const internal = new Set(['__back']);",
      "const internal = new Set(['__back','__outcome','__next_step']);",
    );
  }
  if (!updated.includes('if (cfg.outcome) rows.push')) {
    updated = updated.replace(
      '  Object.keys(incomingQuery || {}).forEach(function(key){',
      "  if (cfg.outcome) rows.push('<input type=\"hidden\" name=\"__outcome\" value=\"' + esc(cfg.outcome) + '\">');\n" +
        "  if (cfg.nextStep) rows.push('<input type=\"hidden\" name=\"__next_step\" value=\"' + esc(cfg.nextStep) + '\">');\n" +
        '  Object.keys(incomingQuery || {}).forEach(function(key){',
    );
  }
  if (!updated.includes('el.name==="__outcome"')) {
    updated = updated.replace(
      'if(el.name===form.dataset.field)el.disabled=true;',
      'if(el.name===form.dataset.field||el.name==="__outcome"||el.name==="__next_step")el.disabled=true;',
    );
  }

  // Botón Volver con mayor jerarquía visual y área de interacción.
  updated = updated.replace(
    `const backButton = cfg.allowBack ? '<button class="btn btn-secondary" type="submit" name="__back" value="1" formnovalidate><span aria-hidden="true">&#8592;</span> Volver</button>' : '';`,
    `const backButton = cfg.allowBack ? '<button class="btn btn-secondary" type="submit" name="__back" value="1" formnovalidate><span class="back-icon" aria-hidden="true">&#8592;</span><span class="back-text">' + esc(cfg.backButtonLabel || 'Volver') + '</span></button>' : '';`,
  );
  updated = updated.replace(
    `const actionCols = cfg.allowBack ? 'minmax(140px,.38fr) minmax(180px,1fr)' : '1fr';`,
    `const actionCols = cfg.allowBack ? 'minmax(180px,.52fr) minmax(220px,1fr)' : '1fr';`,
  );
  updated = updated.replace(
    '.btn{position:relative;width:100%;padding:16px 20px;',
    '.btn{position:relative;width:100%;height:56px;padding:0 18px;display:flex;align-items:center;justify-content:center;',
  );
  updated = updated.replace(
    '.btn-secondary{background:transparent;border:1px solid var(--border);color:var(--muted);box-shadow:none;font-size:14px;font-weight:600}.btn-secondary:hover{background:rgba(29,161,242,.06);border-color:rgba(29,161,242,.4);color:var(--white);box-shadow:none;filter:none}',
    '.btn-secondary{gap:9px;background:linear-gradient(135deg,rgba(73,120,182,.42),rgba(10,31,62,.92));border:1px solid rgba(111,188,255,.68);color:#eaf6ff;box-shadow:0 10px 26px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.1);font-size:14px;font-weight:700}.btn-secondary:hover{background:linear-gradient(135deg,rgba(42,145,218,.5),rgba(13,51,93,.95));border-color:var(--blue-glow);color:#fff;box-shadow:0 14px 34px rgba(29,161,242,.3),inset 0 1px 0 rgba(255,255,255,.14);filter:none}.back-icon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 24px;border-radius:50%;background:rgba(29,161,242,.2);border:1px solid rgba(111,205,255,.45);font-size:15px;line-height:1;transition:transform .18s ease,background .18s ease}.btn-secondary:hover .back-icon{transform:translateX(-2px);background:rgba(29,161,242,.34)}',
  );
  updated = updated.replace(
    '.btn{padding:14px 16px;font-size:14px}',
    '.btn{height:54px;padding:0 14px;font-size:14px}',
  );
  updated = updated.replace(
    '*{box-sizing:border-box;margin:0;padding:0}:root{--navy:#10284a;--border:#1a3461;--blue:#1da1f2;--blue-glow:#38c7ff;--muted:rgba(240,246,255,.58);--white:#f0f6ff;--danger:#ff5c7a;--danger-soft:rgba(255,92,122,.12)}html,body{min-height:100%}body{background:#071830;font-family:DM Sans,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--white);padding:16px}.page{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%}',
    '*{box-sizing:border-box;margin:0;padding:0}:root{--navy:#10284a;--border:#1a3461;--blue:#1da1f2;--blue-glow:#38c7ff;--muted:rgba(240,246,255,.64);--white:#f0f6ff;--danger:#ff5c7a;--danger-soft:rgba(255,92,122,.12);color-scheme:dark}html{min-height:100%;-webkit-text-size-adjust:100%;text-size-adjust:100%}body{background:#071830;font-family:DM Sans,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;width:100%;min-height:100vh;min-height:100svh;display:flex;align-items:center;justify-content:center;color:var(--white);overflow-x:hidden;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}.page{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;width:100%;min-width:0;min-height:calc(100svh - 24px)}',
  );
  updated = updated.replace(
    '.card{width:100%;max-width:720px;background:var(--navy);border-radius:20px;border:1px solid rgba(29,161,242,.18);padding:32px 36px;',
    '.card{width:min(100%,760px);max-width:760px;min-width:0;background:var(--navy);border-radius:clamp(16px,2.5vw,22px);border:1px solid rgba(29,161,242,.18);padding:clamp(20px,4vw,38px);',
  );
  updated = updated.replace(
    '.card-title{font-family:Syne,system-ui,sans-serif;font-size:clamp(20px,3vw,30px);line-height:1.2;margin-bottom:10px;word-wrap:break-word}',
    '.card-title{font-family:Syne,system-ui,sans-serif;font-size:clamp(22px,4.5vw,32px);line-height:1.18;margin-bottom:10px;overflow-wrap:anywhere}',
  );
  updated = updated.replace(
    '.card-sub{font-size:clamp(13px,1.2vw,15px);color:var(--muted);margin-bottom:22px;line-height:1.5}',
    '.card-sub{font-size:clamp(13px,2.2vw,15px);color:var(--muted);margin-bottom:clamp(18px,3vw,24px);line-height:1.55;overflow-wrap:anywhere}',
  );
  updated = updated.replace(
    '.radio-group{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}.radio{position:relative;flex:1 1 auto;min-width:120px}',
    '.radio-group{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:clamp(18px,3vw,24px);width:100%}.radio{position:relative;min-width:0}',
  );
  updated = updated.replace(
    '.radio label{display:flex;align-items:center;justify-content:center;padding:12px 18px;width:100%;min-height:52px;',
    '.radio label{display:flex;align-items:center;justify-content:center;padding:12px clamp(12px,3vw,18px);width:100%;min-height:54px;overflow-wrap:anywhere;',
  );
  updated = updated.replace(
    `.actions{display:grid;grid-template-columns:' + actionCols + ';gap:12px;align-items:center}`,
    `.actions{display:grid;grid-template-columns:' + actionCols + ';gap:12px;align-items:center;width:100%;min-width:0}`,
  );
  updated = updated.replace(
    '@media(max-width:640px){.card{padding:22px 16px;border-radius:16px}.radio-group{flex-direction:column}.radio{width:100%}.actions{grid-template-columns:1fr}.btn{height:54px;padding:0 14px;font-size:14px}}',
    '@media(max-width:900px){.card{padding:clamp(20px,5vw,32px)}.radio-group{grid-template-columns:1fr}.actions{grid-template-columns:1fr;gap:10px}.btn{width:100%;height:56px;padding:0 16px;font-size:15px}}@media(max-width:480px){body{align-items:flex-start}.page{justify-content:center;padding-block:4px}.card{padding:22px 16px;border-radius:16px}.tag{font-size:10px;padding:5px 11px;margin-bottom:14px}.card-title{font-size:clamp(23px,7.4vw,30px)}.card-sub{font-size:14px}.radio label{min-height:56px}.actions{grid-template-columns:1fr}.btn{width:100%;height:54px}.footer{font-size:11px}}@media(max-width:360px){body{padding:8px}.card{padding:19px 13px}.radio label{padding:11px 10px;font-size:13px}.btn{font-size:13px}.back-icon{width:22px;height:22px;flex-basis:22px}}@media(max-height:620px) and (orientation:landscape){body{align-items:flex-start}.page{justify-content:flex-start}.card{max-width:900px;padding:18px 24px}.tag{margin-bottom:10px}.card-title{font-size:22px;margin-bottom:6px}.card-sub{margin-bottom:12px}.label{margin-bottom:8px}.radio-group{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:12px}.radio label{min-height:46px;padding:8px 12px}.actions{grid-template-columns:minmax(150px,.65fr) minmax(190px,1fr)}.btn{height:48px}.footer{padding:2px 0}}@media(min-width:1200px){.card{width:min(100%,1040px);max-width:1040px;padding:48px 52px}.tag{font-size:12px;padding:7px 16px;margin-bottom:20px}.card-title{font-size:40px;margin-bottom:14px}.card-sub{font-size:17px;margin-bottom:28px}.label{font-size:12px;margin-bottom:14px}.radio-group{gap:14px;margin-bottom:28px}.radio label{min-height:64px;font-size:16px}.actions{gap:16px}.btn{height:64px;font-size:18px}.back-icon{width:28px;height:28px;flex-basis:28px;font-size:17px}.footer{font-size:13px}}@media(min-width:1800px) and (min-height:1000px){.card{width:min(100%,1100px);max-width:1100px;padding:52px 58px}.card-title{font-size:43px}.card-sub{font-size:18px}.radio label{min-height:66px}.btn{height:66px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}.btn:hover,.radio label:hover{transform:none}}@supports(height:100dvh){body{min-height:100dvh}.page{min-height:calc(100dvh - 24px)}}',
  );
  updated = updated.replace(
    '.err-banner{display:none;',
    '.completion{text-align:center;padding:18px 4px 8px}.completion-icon{display:flex;align-items:center;justify-content:center;width:64px;height:64px;margin:0 auto 20px;border-radius:50%;background:rgba(40,199,111,.14);border:1px solid rgba(66,230,139,.5);color:#63e89e;font-size:32px;box-shadow:0 0 32px rgba(40,199,111,.18)}.completion-title{font-family:Syne,system-ui,sans-serif;font-size:28px;margin-bottom:12px}.completion-copy{color:var(--muted);font-size:15px;line-height:1.6}.completion-hint{margin-top:14px;color:rgba(240,246,255,.78);font-size:13px}.err-banner{display:none;',
  );

  // La URL inicial se calcula en el servidor con el modo real de ejecución.
  // En modo test no se intenta reabrir el webhook, porque n8n deja de
  // registrarlo al consumir la ejecución manual; se muestra una pantalla final.
  updated = updated.replace(
    `const startPath = esc(cfg.startPath || 'etb-form');`,
    `const executionMode = String($execution.mode || 'production');
  const cleanStartPath = String(cfg.startPath || 'etb-form').replace(/^\\/+/, '');
  let startUrl = '';
  try {
    const parsed = new URL(String(resumeUrl || ''));
    const markers = ['/webhook-waiting/', '/webhook-test/', '/webhook/'];
    let basePath = '';
    for (const marker of markers) {
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex >= 0) { basePath = parsed.pathname.slice(0, markerIndex); break; }
    }
    const prefix = cfg.handoffSession ? 'webhook' : (executionMode === 'test' ? 'webhook-test' : 'webhook');
    parsed.pathname = basePath + '/' + prefix + '/' + cleanStartPath;
    parsed.search = '';
    parsed.hash = '';
    startUrl = parsed.toString();
  } catch (e) {}
  const startUrlJson = JSON.stringify(startUrl);
  const testFlag = executionMode === 'test' ? 'true' : 'false';
  const handoffFlag = cfg.handoffSession ? 'true' : 'false';`,
  );
  updated = updated.replace(
    /function getStartUrl\(\)\{.*?\}var cfgFinishToStart=/,
    `var startUrl=' + startUrlJson + ';var isTestMode=' + testFlag + ';var handoffSession=' + handoffFlag + ';function showCompletion(){var card=document.querySelector(".card");if(!card)return;card.innerHTML="<div class=\\'completion\\'><div class=\\'completion-icon\\' aria-hidden=\\'true\\'>&#10003;</div><h1 class=\\'completion-title\\'>Proceso finalizado</h1><p class=\\'completion-copy\\'>Las respuestas fueron procesadas y enviadas al cierre del flujo.</p><p class=\\'completion-hint\\'>Modo de prueba: vuelve a n8n y pulsa <strong>Test workflow</strong> para iniciar una nueva ejecución.</p></div>";}var cfgFinishToStart=`,
  );
  updated = updated.replace(
    /fetch\(form\.action\+joiner\+qs,\{method:"GET",credentials:"same-origin"\}\)\.catch\(function\(\)\{\}\)\.finally\(function\(\)\{window\.location\.href=getStartUrl\(\);\}\);/,
    `fetch(form.action+joiner+qs,{method:"GET",credentials:"same-origin"}).then(function(response){if(!response.ok)throw new Error("HTTP "+response.status);if((isTestMode&&!handoffSession)||!startUrl){showCompletion();return;}var targetUrl=startUrl;if(handoffSession){try{var target=new URL(startUrl);var session=data.get("__workflow_session")||data.get("workflow_session");if(session)target.searchParams.set("workflow_session",session);targetUrl=target.toString();}catch(e){}}window.location.href=targetUrl;}).catch(function(){err.textContent="No fue posible finalizar el proceso. Verifica la ejecución en n8n e inténtalo nuevamente.";err.classList.add("is-visible");err.style.display="flex";submitBtn.disabled=false;submitBtn.setAttribute("aria-disabled","false");if(ft){ft.textContent="Reintentar";}});`,
  );
  node.parameters.jsCode = updated;
}

function setIfCondition(nodeName, field, rightValue) {
  const node = getNode(nodeName);
  node.parameters.conditions.conditions = [{
    id: `cond-${field}-v11`,
    leftValue: `={{ $json.query.${field} }}`,
    rightValue,
    operator: {
      type: 'string',
      operation: 'equals',
      name: 'filter.operator.equals',
    },
  }];
  node.parameters.conditions.combinator = 'or';
}

function setPosition(name, x, y) {
  getNode(name).position = [x, y];
}

patchForm('Form Verificar Linea', {
  field: 'linea_activa',
  titleAccent: 'suspendida',
  title: 'Verificar que la línea no esté {accent}',
  question: 'ESTADO ACTUAL DE LA LÍNEA',
  subtitle: 'Confirma si la línea está activa o se encuentra suspendida.',
  tag: 'Etapa 1 · Paso 1',
  options: [
    { value: 'Si', label: 'Activa / no suspendida' },
    { value: 'No', label: 'Suspendida o cortada' },
  ],
  allowBack: false,
  finishToStart: false,
  finishToStartWhen: {},
});

patchForm('Form Confirmar Pago', {
  field: 'pago_al_dia',
  titleAccent: 'pagos',
  title: '¿El cliente está al día en {accent}?',
  question: 'ESTADO DE PAGOS',
  subtitle: 'Valida el estado de cuenta antes de continuar con el diagnóstico.',
  tag: 'Etapa 1 · Paso 2',
  options: [
    { value: 'Si', label: 'Sí, está al día' },
    { value: 'No', label: 'No, tiene saldo pendiente' },
  ],
  allowBack: true,
  finishToStart: false,
  finishToStartWhen: { pago_al_dia: 'No' },
  outcome: 'pago_pendiente',
  nextStep: 'fin_etapa_1',
});

patchForm('Form Escalar GESTFAC', {
  field: 'escalado_ok',
  titleAccent: 'GESTFAC',
  title: 'Enviar el caso por {accent}',
  question: 'RESULTADO DEL ESCALAMIENTO',
  subtitle: 'La línea está suspendida o cortada. Registra el envío del caso por GESTFAC.',
  tag: 'Etapa 1 · Salida GESTFAC',
  options: [
    { value: 'Si', label: 'Caso enviado a GESTFAC' },
    { value: 'No', label: 'No fue posible enviarlo' },
  ],
  allowBack: true,
  finishToStart: true,
  finishToStartWhen: {},
  outcome: 'gestfac',
  nextStep: 'fin_etapa_1',
});

patchForm('Form Validar ICCID', {
  field: 'iccid_valido',
  titleAccent: 'ICCID',
  title: 'Validar {accent} en SUMA Móvil',
  question: '¿EL ICCID COINCIDE?',
  subtitle: 'Compara el ICCID de la SIM del cliente con el registrado en SUMA Móvil.',
  tag: 'Etapa 1 · Paso 3',
  options: [
    { value: 'Si', label: 'Sí, coincide' },
    { value: 'No', label: 'No coincide' },
  ],
  allowBack: true,
  finishToStart: false,
  finishToStartWhen: {},
});

patchForm('Form Confirmar ICCID', {
  field: 'iccid_confirmado',
  titleAccent: 'ICCID',
  title: 'Confirmar el {accent} con el cliente',
  question: 'CONFIRMACIÓN DEL ICCID',
  subtitle: 'Solicita nuevamente el ICCID correcto antes de escalar al gestor de sincronización.',
  tag: 'Etapa 1 · ICCID no coincide',
  options: [{ value: 'Si', label: 'ICCID confirmado con el cliente' }],
  allowBack: true,
  finishToStart: false,
  finishToStartWhen: {},
});

patchForm('Form Escalar Gestor', {
  field: 'gestor_ok',
  titleAccent: 'sincronización',
  title: 'Escalar al gestor de {accent}',
  question: 'RESULTADO DEL ESCALAMIENTO',
  subtitle: 'Registra el resultado del escalamiento por inconsistencia del ICCID.',
  tag: 'Etapa 1 · Salida gestor',
  options: [
    { value: 'Si', label: 'Escalamiento realizado' },
    { value: 'No', label: 'No fue posible escalar' },
  ],
  allowBack: true,
  finishToStart: true,
  finishToStartWhen: {},
  outcome: 'gestor_sincronizacion',
  nextStep: 'fin_etapa_1',
});

patchForm('Form Validar IMEI', {
  field: 'imei_suma_validado',
  titleAccent: 'SUMA',
  title: 'Validar el último equipo en {accent}',
  question: 'VALIDACIÓN DEL IMEI EN SUMA',
  subtitle: 'Consulta el último equipo asociado a la línea y verifica su IMEI.',
  tag: 'Etapa 1 · Paso 4',
  options: [{ value: 'Si', label: 'Consulta completada' }],
  allowBack: true,
  finishToStart: false,
  finishToStartWhen: {},
});

const formRegistro = cloneNode('Form Validar IMEI', {
  id: 'form-consultar-registro-imei-v11',
  name: 'Form Consultar Registro IMEI',
  position: [6150, -420],
});
const enviarRegistro = cloneNode('Enviar Validar IMEI', {
  id: 'enviar-consultar-registro-imei-v11',
  name: 'Enviar Consultar Registro IMEI',
  position: [6550, -420],
});
const esperaRegistro = cloneNode('Espera Validar IMEI', {
  id: 'espera-consultar-registro-imei-v11',
  name: 'Espera Consultar Registro IMEI',
  position: [6950, -420],
});
const volverRegistro = cloneNode('IF Volver Validar IMEI', {
  id: 'if-volver-consultar-registro-imei-v11',
  name: 'IF Volver Consultar Registro IMEI',
  position: [7350, -420],
});

patchForm(formRegistro.name, {
  field: 'registro_imei_ok',
  titleAccent: 'SRTM',
  title: 'Consultar el IMEI en {accent}',
  question: '¿EL REGISTRO DEL IMEI ESTÁ CORRECTO?',
  subtitle: 'Consulta el IMEI en la Consulta Pública SRTM y confirma el resultado del registro.',
  tag: 'Etapa 1 · Paso 5',
  options: [
    { value: 'Si', label: 'Sí, registro correcto' },
    { value: 'No', label: 'No está registrado correctamente' },
  ],
  allowBack: true,
  finishToStart: false,
  finishToStartWhen: {},
});

const ifRegistro = getNode('IF imei_coincide');
ifRegistro.name = 'IF registro_imei_ok';
ifRegistro.position = [7750, -420];
setIfCondition('IF registro_imei_ok', 'registro_imei_ok', 'Si');

patchForm('Form Confirmar Proceso', {
  field: 'proceso_ok',
  titleAccent: 'registro',
  title: 'Confirmar proceso de {accent}',
  question: 'RESULTADO DEL REGISTRO',
  subtitle: 'Brinda el enlace https://etb.com/registroimei.aspx. Si tarda más de 24 horas, indica la opción *700 y confirma el resultado.',
  tag: 'Etapa 1 · Registro IMEI',
  options: [
    { value: 'Si', label: 'Proceso confirmado' },
    { value: 'No', label: 'Pendiente de confirmación' },
  ],
  allowBack: true,
  finishToStart: true,
  finishToStartWhen: {},
  outcome: 'registro_imei_gestionado',
  nextStep: 'fin_etapa_1',
});

patchForm('Form Verificar Bloqueo', {
  field: 'bloqueado',
  titleAccent: 'bloqueado',
  title: '¿El equipo está {accent}?',
  question: 'ESTADO DE BLOQUEO',
  subtitle: 'Valida si el equipo está bloqueado después de confirmar el registro del IMEI.',
  tag: 'Etapa 1 · Paso 6',
  options: [
    { value: 'Si', label: 'Sí, está bloqueado' },
    { value: 'No', label: 'No está bloqueado' },
  ],
  allowBack: true,
  finishToStart: false,
  finishToStartWhen: {},
});

patchForm('Form Enviar Doc', {
  field: 'doc_enviada',
  titleAccent: 'documentación',
  title: 'Enviar la {accent}',
  question: 'DOCUMENTACIÓN DEL CASO',
  subtitle: 'Reúne en un solo PDF: factura de compra, foto del IMEI, Anexo 1, Anexo 2 y cédula a color por ambos lados. Envía el archivo por correo al área definida.',
  tag: 'Etapa 1 · Salida bloqueado',
  options: [
    { value: 'Si', label: 'Documentación enviada' },
    { value: 'No', label: 'Envío pendiente' },
  ],
  allowBack: true,
  finishToStart: true,
  finishToStartWhen: {},
  outcome: 'documentacion_bloqueo',
  nextStep: 'fin_etapa_1',
});

patchForm('Form Tipo SIM', {
  field: 'tipo_sim',
  titleAccent: 'SIM',
  title: '¿Qué tipo de {accent} maneja el cliente?',
  question: 'TIPO DE SIM',
  subtitle: 'Selecciona el tipo de SIM para transferir el caso a la segunda parte del flujo.',
  tag: 'Etapa 1 · Transferencia',
  options: [
    { value: 'Fisica', label: 'SIM física' },
    { value: 'eSIM', label: 'eSIM' },
    { value: 'MultiSIM', label: 'MultiSIM' },
  ],
  allowBack: true,
  finishToStart: false,
  finishToStartWhen: {},
  outcome: 'continuar_parte_2',
  nextStep: 'parte_2_tipo_sim',
  startPath: 'etb-form-parte-2',
  handoffSession: true,
});

setIfCondition('IF linea_activa', 'linea_activa', 'Si');
setIfCondition('IF pago_al_dia', 'pago_al_dia', 'Si');
setIfCondition('IF iccid_valido', 'iccid_valido', 'Si');
setIfCondition('IF bloqueado', 'bloqueado', 'Si');

const prepareNode = getNode('Guardar Respuestas Excel');
prepareNode.name = 'Preparar Registro SQL';
prepareNode.position = [10450, -60];
prepareNode.parameters.jsCode = `// Contrato único de persistencia de la etapa 1.
const source = ($json && $json.query) ? $json.query : ($json || {});
const value = (key) => {
  const current = source[key];
  if (Array.isArray(current)) return current[0] ?? null;
  return current === undefined || current === '' ? null : current;
};
const outcome = value('__outcome') ||
  (value('tipo_sim') ? 'continuar_parte_2' :
  value('doc_enviada') ? 'documentacion_bloqueo' :
  value('proceso_ok') ? 'registro_imei_gestionado' :
  value('gestor_ok') ? 'gestor_sincronizacion' :
  value('escalado_ok') ? 'gestfac' :
  value('pago_al_dia') === 'No' ? 'pago_pendiente' : 'fin_etapa_1');
const nextStep = value('__next_step') || (outcome === 'continuar_parte_2' ? 'parte_2_tipo_sim' : 'fin_etapa_1');
const answers = {
  linea_activa: value('linea_activa'),
  pago_al_dia: value('pago_al_dia'),
  escalado_ok: value('escalado_ok'),
  iccid_valido: value('iccid_valido'),
  iccid_confirmado: value('iccid_confirmado'),
  gestor_ok: value('gestor_ok'),
  imei_suma_validado: value('imei_suma_validado'),
  registro_imei_ok: value('registro_imei_ok'),
  proceso_ok: value('proceso_ok'),
  bloqueado: value('bloqueado'),
  doc_enviada: value('doc_enviada'),
  tipo_sim: value('tipo_sim'),
};
const workflowSession = value('__workflow_session') || String($execution.id || '');
const requestHeaders = ($json && $json.headers) ? $json.headers : {};
const absoluteBase = (candidate) => {
  const match = String(candidate || '').match(/^(https?:\/\/[^/]+)(\/[^?#]*)?/i);
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
  const prefix = String(requestHeaders['x-forwarded-prefix'] || '').replace(/\/$/, '');
  if (host) publicBase = proto + '://' + host + prefix;
}
if (!publicBase) publicBase = absoluteBase($execution.resumeUrl || '');
const handoffUrl = publicBase
  ? publicBase.replace(/\/$/, '') + '/webhook/etb-form-parte-2?workflow_session=' + encodeURIComponent(workflowSession)
  : '';
return [{ json: {
  workflow_session: workflowSession,
  execution_id: String($execution.id || ''),
  workflow_version: 'v11.8-conexion-etapa2-20260714',
  resultado_etapa_1: outcome,
  next_step: nextStep,
  handoff_url: handoffUrl,
  ...answers,
  respuestas_json: JSON.stringify(answers),
} }];`;

const mysqlNode = {
  parameters: {
    operation: 'executeQuery',
    query: 'INSERT INTO n8n_nsf_respuestas (workflow_session, execution_id, workflow_version, resultado_etapa_1, next_step, linea_activa, pago_al_dia, escalado_ok, iccid_valido, iccid_confirmado, gestor_ok, imei_suma_validado, registro_imei_ok, proceso_ok, bloqueado, doc_enviada, tipo_sim, respuestas_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON DUPLICATE KEY UPDATE execution_id=VALUES(execution_id), workflow_version=VALUES(workflow_version), resultado_etapa_1=VALUES(resultado_etapa_1), next_step=VALUES(next_step), linea_activa=VALUES(linea_activa), pago_al_dia=VALUES(pago_al_dia), escalado_ok=VALUES(escalado_ok), iccid_valido=VALUES(iccid_valido), iccid_confirmado=VALUES(iccid_confirmado), gestor_ok=VALUES(gestor_ok), imei_suma_validado=VALUES(imei_suma_validado), registro_imei_ok=VALUES(registro_imei_ok), proceso_ok=VALUES(proceso_ok), bloqueado=VALUES(bloqueado), doc_enviada=VALUES(doc_enviada), tipo_sim=VALUES(tipo_sim), respuestas_json=VALUES(respuestas_json), updated_at=CURRENT_TIMESTAMP(3)',
    options: {
      queryBatching: 'single',
      queryReplacement: '={{ [ $json.workflow_session, $json.execution_id, $json.workflow_version, $json.resultado_etapa_1, $json.next_step, $json.linea_activa, $json.pago_al_dia, $json.escalado_ok, $json.iccid_valido, $json.iccid_confirmado, $json.gestor_ok, $json.imei_suma_validado, $json.registro_imei_ok, $json.proceso_ok, $json.bloqueado, $json.doc_enviada, $json.tipo_sim, $json.respuestas_json ] }}',
      replaceEmptyStrings: true,
      detailedOutput: true,
    },
  },
  id: 'guardar-respuestas-mysql-v11',
  name: 'Guardar Respuestas MySQL',
  type: 'n8n-nodes-base.mySql',
  typeVersion: 2.5,
  position: [10850, -60],
  notesInFlow: true,
  notes: 'CONFIGURACIÓN VALIDADA: Host: 72.60.248.165 · Puerto: 3306 · Base: CRM · Usuario: crm_user. La autenticación y los privilegios sobre CRM.* fueron comprobados el 2026-07-10. No uses user_crm ni crm_n8n.',
};
workflow.nodes.push(mysqlNode);

const handoffIfNode = JSON.parse(JSON.stringify(getNode('IF bloqueado')));
handoffIfNode.id = 'if-continuar-etapa2-v11';
handoffIfNode.name = 'IF Continuar Etapa 2';
handoffIfNode.position = [6290, 0];
handoffIfNode.parameters.conditions.conditions = [{
  id: 'cond-continuar-etapa2-v11',
  leftValue: "={{ $('Preparar Registro SQL').first().json.resultado_etapa_1 }}",
  rightValue: 'continuar_parte_2',
  operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
}];
handoffIfNode.parameters.conditions.combinator = 'or';
workflow.nodes.push(handoffIfNode);

workflow.nodes.push({
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
});

workflow.nodes.push({
  parameters: {
    respondWith: 'redirect',
    redirectURL: "={{ $('Preparar Registro SQL').first().json.handoff_url }}",
    options: {},
  },
  id: 'responder-redireccion-etapa2-v11',
  name: 'Redirigir a Etapa 2',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.4,
  position: [6510, -220],
});

workflow.nodes.push({
  parameters: {
    content: '## Persistencia MySQL\n1. Preparar contrato de datos\n2. Insertar o actualizar por workflow_session\n3. Si next_step = parte_2_tipo_sim, conectar aquí la segunda etapa\n\n**Configuración pendiente tras importar:** seleccionar la credencial MySQL CRM y su base/esquema.',
    height: 300,
    width: 900,
    color: 5,
  },
  id: 'nota-persistencia-mysql-v11',
  name: 'Nota - Persistencia MySQL',
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: [10200, -500],
});

// Layout v11.2: reproduce la lectura del diagrama de referencia.
// Flujo principal al centro; pagos/IMEI arriba; GESTFAC/documentación abajo.
const layout = {
  // Inicio y verificación de línea
  'Apertura del Flujo': [-1650, 0],
  'Form Verificar Linea': [-1450, 0],
  'Enviar Verificar Linea': [-1230, 0],
  'Espera Verificar Linea': [-1010, 0],
  'IF linea_activa': [-790, 0],

  // Línea activa: validar pagos
  'Form Confirmar Pago': [-550, -420],
  'Enviar Confirmar Pago': [-330, -420],
  'Espera Confirmar Pago': [-110, -420],
  'IF Volver Confirmar Pago': [110, -420],
  'IF pago_al_dia': [330, -420],

  // Línea suspendida/cortada: GESTFAC
  'Form Escalar GESTFAC': [-550, 420],
  'Enviar Escalar GESTFAC': [-330, 420],
  'Espera Escalar GESTFAC': [-110, 420],
  'IF Volver Escalar GESTFAC': [110, 420],

  // Validación ICCID
  'Form Validar ICCID': [650, 0],
  'Enviar Validar ICCID': [870, 0],
  'Espera Validar ICCID': [1090, 0],
  'IF Volver Validar ICCID': [1310, 0],
  'IF iccid_valido': [1530, 0],

  // ICCID no coincide: confirmar y escalar
  'Form Confirmar ICCID': [1750, 420],
  'Enviar Confirmar ICCID': [1970, 420],
  'Espera Confirmar ICCID': [2190, 420],
  'IF Volver Confirmar ICCID': [2410, 420],
  'Form Escalar Gestor': [2630, 420],
  'Enviar Escalar Gestor': [2850, 420],
  'Espera Escalar Gestor': [3070, 420],
  'IF Volver Escalar Gestor': [3290, 420],

  // ICCID coincide: validar IMEI en SUMA y SRTM
  'Form Validar IMEI': [1750, -420],
  'Enviar Validar IMEI': [1970, -420],
  'Espera Validar IMEI': [2190, -420],
  'IF Volver Validar IMEI': [2410, -420],
  'Form Consultar Registro IMEI': [2630, -420],
  'Enviar Consultar Registro IMEI': [2850, -420],
  'Espera Consultar Registro IMEI': [3070, -420],
  'IF Volver Consultar Registro IMEI': [3290, -420],
  'IF registro_imei_ok': [3510, -420],

  // Registro IMEI incorrecto
  'Form Confirmar Proceso': [3730, -840],
  'Enviar Confirmar Proceso': [3950, -840],
  'Espera Confirmar Proceso': [4170, -840],
  'IF Volver Confirmar Proceso': [4390, -840],

  // Registro correcto: verificar bloqueo
  'Form Verificar Bloqueo': [3730, 0],
  'Enviar Verificar Bloqueo': [3950, 0],
  'Espera Verificar Bloqueo': [4170, 0],
  'IF Volver Verificar Bloqueo': [4390, 0],
  'IF bloqueado': [4610, 0],

  // Equipo bloqueado: documentación
  'Form Enviar Doc': [4830, 420],
  'Enviar Enviar Doc': [5050, 420],
  'Espera Enviar Doc': [5270, 420],
  'IF Volver Enviar Doc': [5490, 420],

  // Equipo no bloqueado: tipo de SIM y salida a parte 2
  'Form Tipo SIM': [4830, -420],
  'Enviar Tipo SIM': [5050, -420],
  'Espera Tipo SIM': [5270, -420],
  'IF Volver Tipo SIM': [5490, -420],

  // Persistencia única
  'Preparar Registro SQL': [5850, 0],
  'Guardar Respuestas MySQL': [6070, 0],
  'IF Continuar Etapa 2': [6290, 0],
  'Redirigir a Etapa 2': [6510, -220],
  'Responder Cierre Etapa 1': [6510, 220],
};

for (const [name, [x, y]] of Object.entries(layout)) setPosition(name, x, y);

// Las notas e imágenes heredadas de v10 estaban ancladas a coordenadas viejas.
// Se sustituyen por bloques compactos que funcionan como carriles visuales.
workflow.nodes = workflow.nodes.filter((node) => node.type !== 'n8n-nodes-base.stickyNote');

function addSectionNote(id, name, content, x, y, width, height, color) {
  workflow.nodes.push({
    parameters: { content, height, width, color },
    id,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [x, y],
  });
}

addSectionNote(
  'nota-v11-inicio',
  '01 - Inicio y estado de línea',
  '## 01 · Inicio y estado de línea\n**Entrada:** webhook `etb-form`\n\n- Activa → validar pagos\n- Suspendida/cortada → GESTFAC',
  -1760, -140, 1160, 360, 6,
);
addSectionNote(
  'nota-v11-pagos',
  '02 - Estado de pagos',
  '## 02 · Estado de pagos\n- Al día → validar ICCID\n- Pendiente → almacenar y finalizar',
  -660, -560, 1160, 360, 5,
);
addSectionNote(
  'nota-v11-gestfac',
  '03 - Salida GESTFAC',
  '## 03 · GESTFAC\nRama exclusiva para línea suspendida o cortada.\n\nAlmacena el resultado antes de finalizar.',
  -660, 280, 1000, 360, 4,
);
addSectionNote(
  'nota-v11-iccid',
  '04 - Validación ICCID',
  '## 04 · Validación ICCID\nConsulta en SUMA Móvil y decide si el ICCID coincide.',
  540, -140, 1160, 360, 6,
);
addSectionNote(
  'nota-v11-iccid-error',
  '05 - ICCID no coincide',
  '## 05 · ICCID no coincide\nConfirmar con el cliente y escalar al gestor de sincronización.',
  1640, 280, 1840, 360, 3,
);
addSectionNote(
  'nota-v11-imei',
  '06 - Validación IMEI',
  '## 06 · IMEI\n1. Validar último equipo en SUMA\n2. Consultar registro público SRTM\n3. Evaluar registro del IMEI',
  1640, -560, 2060, 360, 7,
);
addSectionNote(
  'nota-v11-registro-imei',
  '07 - Registro IMEI incorrecto',
  '## 07 · Registro IMEI incorrecto\nEntregar enlace de registro y opción `*700`; confirmar el proceso.',
  3620, -980, 1040, 360, 4,
);
addSectionNote(
  'nota-v11-bloqueo',
  '08 - Verificación de bloqueo',
  '## 08 · Verificación de bloqueo\n- Bloqueado → documentación\n- No bloqueado → tipo de SIM',
  3620, -140, 1160, 360, 6,
);
addSectionNote(
  'nota-v11-tipo-sim',
  '09 - Tipo SIM',
  '## 09 · Tipo de SIM\nSelecciona SIM física, eSIM o MultiSIM.\n\n**Salida:** `parte_2_tipo_sim`',
  4720, -560, 1000, 360, 5,
);
addSectionNote(
  'nota-v11-documentacion',
  '10 - Documentación',
  '## 10 · Documentación\nUn solo PDF con factura, foto del IMEI, anexos y cédula por ambos lados.',
  4720, 280, 1000, 360, 3,
);
addSectionNote(
  'nota-v11-sql',
  '11 - Persistencia MySQL',
  '## 11 · Persistencia MySQL\nTodas las salidas convergen aquí.\n\n`workflow_session` evita duplicados.',
  5740, -360, 1000, 720, 2,
);

const connections = {};
function connect(source, output, target, input = 0) {
  if (!connections[source]) connections[source] = { main: [] };
  while (connections[source].main.length <= output) connections[source].main.push([]);
  connections[source].main[output].push({ node: target, type: 'main', index: input });
}
function chain(...names) {
  for (let i = 0; i < names.length - 1; i += 1) connect(names[i], 0, names[i + 1]);
}

chain('Apertura del Flujo', 'Form Verificar Linea', 'Enviar Verificar Linea', 'Espera Verificar Linea', 'IF linea_activa');
connect('IF linea_activa', 0, 'Form Confirmar Pago');
connect('IF linea_activa', 1, 'Form Escalar GESTFAC');

chain('Form Confirmar Pago', 'Enviar Confirmar Pago', 'Espera Confirmar Pago', 'IF Volver Confirmar Pago');
connect('IF Volver Confirmar Pago', 0, 'Form Verificar Linea');
connect('IF Volver Confirmar Pago', 1, 'IF pago_al_dia');
connect('IF pago_al_dia', 0, 'Form Validar ICCID');
connect('IF pago_al_dia', 1, 'Preparar Registro SQL');

chain('Form Escalar GESTFAC', 'Enviar Escalar GESTFAC', 'Espera Escalar GESTFAC', 'IF Volver Escalar GESTFAC');
connect('IF Volver Escalar GESTFAC', 0, 'Form Verificar Linea');
connect('IF Volver Escalar GESTFAC', 1, 'Preparar Registro SQL');

chain('Form Validar ICCID', 'Enviar Validar ICCID', 'Espera Validar ICCID', 'IF Volver Validar ICCID');
connect('IF Volver Validar ICCID', 0, 'Form Confirmar Pago');
connect('IF Volver Validar ICCID', 1, 'IF iccid_valido');
connect('IF iccid_valido', 0, 'Form Validar IMEI');
connect('IF iccid_valido', 1, 'Form Confirmar ICCID');

chain('Form Confirmar ICCID', 'Enviar Confirmar ICCID', 'Espera Confirmar ICCID', 'IF Volver Confirmar ICCID');
connect('IF Volver Confirmar ICCID', 0, 'Form Validar ICCID');
connect('IF Volver Confirmar ICCID', 1, 'Form Escalar Gestor');
chain('Form Escalar Gestor', 'Enviar Escalar Gestor', 'Espera Escalar Gestor', 'IF Volver Escalar Gestor');
connect('IF Volver Escalar Gestor', 0, 'Form Confirmar ICCID');
connect('IF Volver Escalar Gestor', 1, 'Preparar Registro SQL');

chain('Form Validar IMEI', 'Enviar Validar IMEI', 'Espera Validar IMEI', 'IF Volver Validar IMEI');
connect('IF Volver Validar IMEI', 0, 'Form Validar ICCID');
connect('IF Volver Validar IMEI', 1, 'Form Consultar Registro IMEI');
chain('Form Consultar Registro IMEI', 'Enviar Consultar Registro IMEI', 'Espera Consultar Registro IMEI', 'IF Volver Consultar Registro IMEI');
connect('IF Volver Consultar Registro IMEI', 0, 'Form Validar IMEI');
connect('IF Volver Consultar Registro IMEI', 1, 'IF registro_imei_ok');
connect('IF registro_imei_ok', 0, 'Form Verificar Bloqueo');
connect('IF registro_imei_ok', 1, 'Form Confirmar Proceso');

chain('Form Confirmar Proceso', 'Enviar Confirmar Proceso', 'Espera Confirmar Proceso', 'IF Volver Confirmar Proceso');
connect('IF Volver Confirmar Proceso', 0, 'Form Consultar Registro IMEI');
connect('IF Volver Confirmar Proceso', 1, 'Preparar Registro SQL');

chain('Form Verificar Bloqueo', 'Enviar Verificar Bloqueo', 'Espera Verificar Bloqueo', 'IF Volver Verificar Bloqueo');
connect('IF Volver Verificar Bloqueo', 0, 'Form Consultar Registro IMEI');
connect('IF Volver Verificar Bloqueo', 1, 'IF bloqueado');
connect('IF bloqueado', 0, 'Form Enviar Doc');
connect('IF bloqueado', 1, 'Form Tipo SIM');

chain('Form Enviar Doc', 'Enviar Enviar Doc', 'Espera Enviar Doc', 'IF Volver Enviar Doc');
connect('IF Volver Enviar Doc', 0, 'Form Verificar Bloqueo');
connect('IF Volver Enviar Doc', 1, 'Preparar Registro SQL');
chain('Form Tipo SIM', 'Enviar Tipo SIM', 'Espera Tipo SIM', 'IF Volver Tipo SIM');
connect('IF Volver Tipo SIM', 0, 'Form Verificar Bloqueo');
connect('IF Volver Tipo SIM', 1, 'Preparar Registro SQL');

chain('Preparar Registro SQL', 'Guardar Respuestas MySQL', 'IF Continuar Etapa 2');
connect('IF Continuar Etapa 2', 0, 'Redirigir a Etapa 2');
connect('IF Continuar Etapa 2', 1, 'Responder Cierre Etapa 1');
workflow.connections = connections;

workflow.name = 'Ningun Servicio Funciona - 1';
workflow.active = false;
workflow.versionId = 'v11.7-auditada-crm-responsive-sql-20260710';
workflow.id = 'NingunServicioFuncionaV117AuditadaCRMResponsiveSQL';
workflow.meta = Object.assign({}, workflow.meta, {
  templateCredsSetupCompleted: false,
  generatedFrom: 'v10-etiquetas-con-imagenes',
  generatedAt: '2026-07-10',
});

for (const node of workflow.nodes.filter((item) => item.type === 'n8n-nodes-base.wait')) {
  node.webhookId = `etapa1-${slug(node.name)}`;
}

fs.writeFileSync(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
console.log(`Generado: ${path.basename(outputPath)}`);
