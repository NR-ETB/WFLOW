const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
  one: path.join(root, 'Ningun Servicio Funciona - 1.json'),
  two: path.join(root, 'Ningun Servicio Funciona - 2.json'),
  three: path.join(root, 'Ningun Servicio Funciona - 3.json'),
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const get = (workflow, name) => {
  const found = workflow.nodes.find((node) => node.name === name);
  if (!found) throw new Error(`No existe el nodo ${name}`);
  return found;
};

function cfgOf(node) {
  const match = node.parameters.jsCode.match(/^const cfg = (\{.*\});$/m);
  if (!match) throw new Error(`No se encontró cfg en ${node.name}`);
  return { match, cfg: JSON.parse(match[1]) };
}

function patchCfg(node, changes) {
  const { match, cfg } = cfgOf(node);
  node.parameters.jsCode = node.parameters.jsCode.replace(
    match[0],
    `const cfg = ${JSON.stringify({ ...cfg, ...changes })};`,
  );
}

function setTarget(workflow, source, branch, target) {
  if (!workflow.connections[source]) workflow.connections[source] = { main: [] };
  while (workflow.connections[source].main.length <= branch) workflow.connections[source].main.push([]);
  workflow.connections[source].main[branch] = [{ node: target, type: 'main', index: 0 }];
}

function chain(workflow, ...names) {
  for (let index = 0; index < names.length - 1; index += 1) {
    setTarget(workflow, names[index], 0, names[index + 1]);
  }
}

function removeNodes(workflow, names) {
  const remove = new Set(names);
  workflow.nodes = workflow.nodes.filter((node) => !remove.has(node.name));
  for (const name of remove) delete workflow.connections[name];
  for (const connection of Object.values(workflow.connections)) {
    connection.main = (connection.main || []).map((branch) =>
      (branch || []).filter((edge) => !remove.has(edge.node))
    );
  }
}

function renameNode(workflow, oldName, newName) {
  if (oldName === newName) return get(workflow, oldName);
  const existing = workflow.nodes.find((node) => node.name === newName);
  if (existing) return existing;
  const node = get(workflow, oldName);
  node.name = newName;
  if (workflow.connections[oldName]) {
    workflow.connections[newName] = workflow.connections[oldName];
    delete workflow.connections[oldName];
  }
  for (const connection of Object.values(workflow.connections)) {
    for (const branch of connection.main || []) {
      for (const edge of branch || []) {
        if (edge.node === oldName) edge.node = newName;
      }
    }
  }
  return node;
}

const escalationTemplateSecondLevel = [
  'USUARIO', 'CANAL', 'TIPO DE FALLA', 'IMEI', 'MODELO / MARCA / EQUIPO',
  'BLOQUEO', 'NOMBRE', 'CC / CÉDULA', 'LÍNEA', 'CONTACTO', 'CIUDAD',
  'BARRIO', 'CHARGING', 'SAAW',
];

const escalationTemplateQrExpired = [
  'Fecha de expedición de la cédula',
  'Número de línea',
  'Descripción del error o inconveniente presentado',
  'Observación (indicar claramente la solución requerida o el resultado esperado para el cierre del caso)',
  'Número de contacto',
  'Sistema operativo del dispositivo (iOS o Android)',
];

const escalationTemplateSynchronization = [
  'Fecha de expedición de la cédula',
  'Email del cliente',
  'Número de cuenta de facturación',
  'Error presentado',
  'Observación (Solución requerida)',
  'Número de contacto',
];

function addEscalationTemplate(node, fields = escalationTemplateSecondLevel) {
  patchCfg(node, { escalationTemplate: fields });
  let code = node.parameters.jsCode;
  if (!code.includes('const escalationTemplateText =')) {
    code = code.replace(
      '  const backButton =',
      `  const escalationTemplateText = (cfg.escalationTemplate || []).map(function(field){return field + ': ';}).join('\\n');\n  const escalationTemplateHtml = escalationTemplateText ? '<details class="escalation-template"><summary>Ver plantilla de escalamiento</summary><div class="template-body"><button type="button" class="copy-template" id="copyEscalationTemplate">Copiar plantilla</button><pre id="escalationTemplateText">' + esc(escalationTemplateText) + '</pre><span class="copy-status" id="copyTemplateStatus" aria-live="polite"></span></div></details>' : '';\n  const backButton =`,
    );
  }
  if (!code.includes('.escalation-template{')) {
    code = code.replace(
      '.label{font-size:11px;',
      '.escalation-template{margin:0 0 16px;border:1px solid rgba(56,199,255,.35);border-radius:12px;background:rgba(8,26,52,.72);overflow:hidden}.escalation-template summary{padding:12px 14px;color:var(--blue-glow);font-size:13px;font-weight:700;cursor:pointer;user-select:none}.template-body{padding:0 14px 14px}.copy-template{width:100%;min-height:40px;margin-bottom:10px;border:1px solid rgba(56,199,255,.5);border-radius:10px;background:rgba(29,161,242,.14);color:#38c7ff;font-weight:700;cursor:pointer}.copy-template:hover{background:rgba(29,161,242,.24)}.escalation-template pre{max-height:210px;overflow:auto;white-space:pre-wrap;padding:12px;border-radius:10px;background:#06162d;color:rgba(240,246,255,.86);font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.copy-status{display:block;min-height:16px;margin-top:6px;color:#63e89e;font-size:11px}.label{font-size:11px;',
    );
  }
  if (!code.includes("+ escalationTemplateHtml + '<div class=\"err-banner\"")) {
    code = code.replace(
      `+ '</p><div class="err-banner" id="errBanner" role="alert">'`,
      `+ '</p>' + escalationTemplateHtml + '<div class="err-banner" id="errBanner" role="alert">'`,
    );
  }
  if (!code.includes('var copyTemplateBtn=document.getElementById("copyEscalationTemplate")')) {
    code = code.replace(
      'if(!form)return;',
      'if(!form)return;var copyTemplateBtn=document.getElementById("copyEscalationTemplate");var copyTemplateText=document.getElementById("escalationTemplateText");var copyTemplateStatus=document.getElementById("copyTemplateStatus");if(copyTemplateBtn&&copyTemplateText){copyTemplateBtn.addEventListener("click",function(){var value=copyTemplateText.textContent||"";var done=function(){if(copyTemplateStatus)copyTemplateStatus.textContent="Plantilla copiada";};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(value).then(done).catch(function(){var area=document.createElement("textarea");area.value=value;document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();done();});}else{var area=document.createElement("textarea");area.value=value;document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();done();}});}',
    );
  }
  node.parameters.jsCode = code;
}

function configurePaymentButton(workflow) {
  const node = get(workflow, 'Form Confirmar Pago');
  patchCfg(node, { buttonLabel: 'Siguiente' });
  let code = node.parameters.jsCode;
  if (!code.includes('function syncPaymentButton()')) {
    code = code.replace(
      'var submitBtn=document.getElementById("submitBtn");if(!form)return;',
      'var submitBtn=document.getElementById("submitBtn");if(!form)return;var paymentInputs=Array.from(form.querySelectorAll("input[name=pago_al_dia]"));function syncPaymentButton(){var selected=paymentInputs.find(function(input){return input.checked;});var label=selected&&selected.value==="No"?"Confirmar y reconectar":"Siguiente";var text=submitBtn&&submitBtn.querySelector(".btn-text");if(text)text.textContent=label;}paymentInputs.forEach(function(input){input.addEventListener("change",syncPaymentButton);});syncPaymentButton();',
    );
  }
  node.parameters.jsCode = code;
}

function addCoverageStep(workflow) {
  const existing = workflow.nodes.find((node) => node.name === 'Form Validar Cobertura y Viaje');
  if (!existing) {
    const form = clone(get(workflow, 'Form Confirmar Pago'));
    form.id = 'form-validar-cobertura-viaje-202608';
    form.name = 'Form Validar Cobertura y Viaje';
    form.position = [-550, 360];
    patchCfg(form, {
      field: 'cobertura_viaje',
      title: 'Validar sin cobertura y condición de {accent}',
      titleAccent: 'viaje',
      question: 'VALIDACIÓN EN LA PÁGINA DE ETB',
      subtitle: 'Consulta la cobertura en ETB y confirma si el cliente está de viaje antes de continuar.',
      tag: 'Etapa 1 · Cobertura',
      buttonLabel: 'Continuar',
      options: [
        { value: 'SinCoberturaLocal', label: 'Sin cobertura y no está de viaje' },
        { value: 'Viaje', label: 'Está de viaje' },
        { value: 'ConCobertura', label: 'La zona sí tiene cobertura' },
      ],
      allowBack: true,
      finishToStart: false,
      finishToStartWhen: {},
    });
    workflow.nodes.push(form);

    const send = clone(get(workflow, 'Enviar Confirmar Pago'));
    send.id = 'enviar-validar-cobertura-viaje-202608';
    send.name = 'Enviar Validar Cobertura y Viaje';
    send.position = [-330, 360];
    workflow.nodes.push(send);

    const wait = clone(get(workflow, 'Espera Confirmar Pago'));
    wait.id = 'espera-validar-cobertura-viaje-202608';
    wait.name = 'Espera Validar Cobertura y Viaje';
    wait.webhookId = 'validar-cobertura-viaje-202608';
    wait.position = [-110, 360];
    workflow.nodes.push(wait);

    const back = clone(get(workflow, 'IF Volver Confirmar Pago'));
    back.id = 'if-volver-validar-cobertura-viaje-202608';
    back.name = 'IF Volver Validar Cobertura y Viaje';
    back.position = [110, 360];
    workflow.nodes.push(back);
  }

  const coverageForm = get(workflow, 'Form Validar Cobertura y Viaje');
  patchCfg(coverageForm, {
    title: 'Validar sin cobertura y condición de {accent}',
    subtitle: 'Abre el mapa de cobertura móvil ETB, valida la zona y confirma si el cliente está de viaje.',
    options: [
      { value: 'NoViajeConCobertura', label: 'No está de viaje, sí tiene cobertura' },
      { value: 'ViajeConCobertura', label: 'Está de viaje y tiene cobertura' },
      { value: 'ViajeSinCobertura', label: 'Está de viaje y no tiene cobertura' },
      { value: 'NoViajeSinCobertura', label: 'No está de viaje, no tiene cobertura' },
    ],
    referenceLink: 'https://etb.com/cobertura4g.aspx',
    referenceLinkLabel: 'Abrir mapa de cobertura móvil ETB',
    errorMsg: 'Primero abre el mapa de cobertura móvil ETB y selecciona el resultado',
    outcome: null,
    nextStep: null,
  });
  let coverageCode = coverageForm.parameters.jsCode;
  if (!coverageCode.includes('.reference-link{')) {
    coverageCode = coverageCode.replace(
      '.label{font-size:11px;',
      '.reference-link{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;margin:0 0 14px;padding:10px 14px;border-radius:12px;border:1px solid rgba(56,199,255,.55);background:rgba(29,161,242,.12);color:#38c7ff;text-decoration:none;font-weight:700;font-size:13px}.reference-link:hover{background:rgba(29,161,242,.2);border-color:#38c7ff}.label{font-size:11px;',
    );
  }
  if (!coverageCode.includes('.reference-link.is-opened{')) {
    coverageCode = coverageCode.replace(
      '.reference-link:hover{background:rgba(29,161,242,.2);border-color:#38c7ff}.label{',
      '.reference-link:hover{background:rgba(29,161,242,.2);border-color:#38c7ff}.reference-link.is-opened{border-color:rgba(66,230,139,.65);color:#63e89e;background:rgba(66,230,139,.1)}.label{',
    );
  }
  if (!coverageCode.includes('.link-requirement-notice{')) {
    coverageCode = coverageCode.replace(
      '.label{font-size:11px;',
      '.link-requirement-notice{display:flex;align-items:center;gap:8px;margin:-4px 0 14px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,193,92,.38);background:rgba(255,193,92,.1);color:#ffd58a;font-size:12px;line-height:1.4}.link-requirement-notice.is-complete{border-color:rgba(66,230,139,.45);background:rgba(66,230,139,.1);color:#63e89e}.label{font-size:11px;',
    );
  }
  if (!coverageCode.includes('id="coverageMapLink"')) {
    coverageCode = coverageCode.replace(
      `'</p><div class="err-banner" id="errBanner" role="alert">'`,
      `'</p><a class="reference-link" id="coverageMapLink" href="' + esc(cfg.referenceLink) + '" target="_blank" rel="noopener noreferrer">&#8599; ' + esc(cfg.referenceLinkLabel) + '</a><div class="err-banner" id="errBanner" role="alert">'`,
    );
  }
  if (!coverageCode.includes('id="coverageRequirementNotice"')) {
    coverageCode = coverageCode.replace(
      `'</a><div class="err-banner" id="errBanner" role="alert">'`,
      `'</a><div class="link-requirement-notice" id="coverageRequirementNotice" role="status">&#9432; Debes abrir el mapa de cobertura para habilitar el botón Continuar.</div><div class="err-banner" id="errBanner" role="alert">'`,
    );
  }
  if (!coverageCode.includes('name="mapa_cobertura_abierto"')) {
    coverageCode = coverageCode.replace(
      `rows.push('<input type="hidden" name="__workflow_session" value="' + esc(session) + '">');`,
      `rows.push('<input type="hidden" name="__workflow_session" value="' + esc(session) + '">');\n  rows.push('<input type="hidden" id="mapaCoberturaAbierto" name="mapa_cobertura_abierto" value="' + esc(fieldValue('mapa_cobertura_abierto')) + '">');`,
    );
    coverageCode = coverageCode.replace(
      `if (internal.has(key) || key === cfg.field || key === '__workflow_session') return;`,
      `if (internal.has(key) || key === cfg.field || key === '__workflow_session' || key === 'mapa_cobertura_abierto') return;`,
    );
  }
  if (!coverageCode.includes('var coverageLink=document.getElementById("coverageMapLink")')) {
    coverageCode = coverageCode.replace(
      'var submitBtn=document.getElementById("submitBtn");if(!form)return;',
      'var submitBtn=document.getElementById("submitBtn");var coverageLink=document.getElementById("coverageMapLink");var coverageOpened=document.getElementById("mapaCoberturaAbierto");function syncCoverageRequirement(){var opened=!!coverageOpened&&coverageOpened.value==="Si";if(coverageLink)coverageLink.classList.toggle("is-opened",opened);if(submitBtn){submitBtn.disabled=!opened;submitBtn.setAttribute("aria-disabled",opened?"false":"true");}}if(coverageLink&&coverageOpened){coverageLink.addEventListener("click",function(){coverageOpened.value="Si";syncCoverageRequirement();err.classList.remove("is-visible");err.style.display="none";});}if(!form)return;syncCoverageRequirement();',
    );
    coverageCode = coverageCode.replace(
      'var missing=false;groups.forEach(function(n){if(!data.get(n))missing=true;});if(missing){',
      'var missing=false;groups.forEach(function(n){if(!data.get(n))missing=true;});if(!data.get("mapa_cobertura_abierto")||data.get("mapa_cobertura_abierto")!=="Si")missing=true;if(missing){',
    );
  }
  if (!coverageCode.includes('var coverageNotice=document.getElementById("coverageRequirementNotice")')) {
    coverageCode = coverageCode.replace(
      'var coverageLink=document.getElementById("coverageMapLink");var coverageOpened=document.getElementById("mapaCoberturaAbierto");function syncCoverageRequirement(){var opened=!!coverageOpened&&coverageOpened.value==="Si";if(coverageLink)coverageLink.classList.toggle("is-opened",opened);if(submitBtn){',
      'var coverageLink=document.getElementById("coverageMapLink");var coverageOpened=document.getElementById("mapaCoberturaAbierto");var coverageNotice=document.getElementById("coverageRequirementNotice");function syncCoverageRequirement(){var opened=!!coverageOpened&&coverageOpened.value==="Si";if(coverageLink)coverageLink.classList.toggle("is-opened",opened);if(coverageNotice){coverageNotice.classList.toggle("is-complete",opened);coverageNotice.innerHTML=opened?"&#10003; Mapa abierto. Ya puedes seleccionar el resultado y continuar.":"&#9432; Debes abrir el mapa de cobertura para habilitar el botón Continuar.";}if(submitBtn){',
    );
  }
  coverageForm.parameters.jsCode = coverageCode;

  setTarget(workflow, 'IF linea_activa', 0, 'Form Validar Cobertura y Viaje');
  chain(
    workflow,
    'Form Validar Cobertura y Viaje',
    'Enviar Validar Cobertura y Viaje',
    'Espera Validar Cobertura y Viaje',
    'IF Volver Validar Cobertura y Viaje',
  );
  setTarget(workflow, 'IF Volver Validar Cobertura y Viaje', 0, 'Form Verificar Linea');
  setTarget(workflow, 'IF Volver Validar Cobertura y Viaje', 1, 'Form Confirmar Pago');
  setTarget(workflow, 'IF Volver Confirmar Pago', 0, 'Form Validar Cobertura y Viaje');
}

function requireImeiLink(workflow) {
  const node = get(workflow, 'Form Consultar Registro IMEI');
  patchCfg(node, {
    subtitle: 'Abre la Consulta Pública SRTM, consulta el IMEI y luego confirma el resultado. El flujo no permite continuar sin abrir el enlace.',
    errorMsg: 'Primero abre la Consulta Pública SRTM y selecciona el resultado',
    requiredLink: 'https://tramitescrcom.gov.co/consultaestadoequipo/',
    requiredLinkLabel: 'Abrir consulta pública del IMEI',
  });
  let code = node.parameters.jsCode;
  if (!code.includes('name="consulta_imei_abierta"')) {
    code = code.replace(
      `rows.push('<input type="hidden" name="__workflow_session" value="' + esc(session) + '">');`,
      `rows.push('<input type="hidden" name="__workflow_session" value="' + esc(session) + '">');\n  rows.push('<input type="hidden" id="consultaImeiAbierta" name="consulta_imei_abierta" value="' + esc(fieldValue('consulta_imei_abierta')) + '">');`,
    );
    code = code.replace(
      `if (internal.has(key) || key === cfg.field || key === '__workflow_session') return;`,
      `if (internal.has(key) || key === cfg.field || key === '__workflow_session' || key === 'consulta_imei_abierta') return;`,
    );
  }
  if (!code.includes('.required-link{')) {
    code = code.replace(
      '.label{font-size:11px;',
      '.required-link{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;margin:0 0 14px;padding:10px 14px;border-radius:12px;border:1px solid rgba(56,199,255,.55);background:rgba(29,161,242,.12);color:#38c7ff;text-decoration:none;font-weight:700;font-size:13px}.required-link:hover{background:rgba(29,161,242,.2);border-color:#38c7ff}.required-link.is-opened{border-color:rgba(66,230,139,.65);color:#63e89e;background:rgba(66,230,139,.1)}.label{font-size:11px;',
    );
  }
  if (!code.includes('id="imeiPublicLink"')) {
    code = code.replace(
      `'</p><div class="err-banner" id="errBanner" role="alert">'`,
      `'</p><a class="required-link" id="imeiPublicLink" href="' + esc(cfg.requiredLink) + '" target="_blank" rel="noopener noreferrer">&#8599; ' + esc(cfg.requiredLinkLabel) + '</a><div class="err-banner" id="errBanner" role="alert">'`,
    );
  }
  if (!code.includes('var imeiLink=document.getElementById("imeiPublicLink")')) {
    code = code.replace(
      'var submitBtn=document.getElementById("submitBtn");if(!form)return;',
      'var submitBtn=document.getElementById("submitBtn");var imeiLink=document.getElementById("imeiPublicLink");var imeiOpened=document.getElementById("consultaImeiAbierta");if(imeiLink&&imeiOpened){if(imeiOpened.value==="Si")imeiLink.classList.add("is-opened");imeiLink.addEventListener("click",function(){imeiOpened.value="Si";imeiLink.classList.add("is-opened");err.classList.remove("is-visible");err.style.display="none";});}if(!form)return;',
    );
    code = code.replace(
      'var missing=false;groups.forEach(function(n){if(!data.get(n))missing=true;});if(missing){',
      'var missing=false;groups.forEach(function(n){if(!data.get(n))missing=true;});if(!data.get("consulta_imei_abierta")||data.get("consulta_imei_abierta")!=="Si")missing=true;if(missing){',
    );
  }
  node.parameters.jsCode = code;
}

function configureDocumentationTransfer(workflow) {
  const node = get(workflow, 'Form Enviar Doc');
  patchCfg(node, {
    title: 'Transferencia a {accent}',
    titleAccent: 'documentación',
    question: 'SELECCIONA LA RUTA DE ATENCIÓN',
    subtitle: 'Selecciona la gestión realizada según el canal de ingreso y el horario de atención de 8:00 a. m. a 5:00 p. m.',
    tag: 'Etapa 1 · Transferencia documental',
    options: [
      {
        value: 'TransferirDocumentacion',
        label: 'Transferir a Documentación',
        description: 'Gestión por llamada dentro del horario de atención.',
      },
      {
        value: 'GestionarCanalDigital',
        label: 'Gestionar por canal digital',
        description: 'Llamada fuera del horario de 8:00 a. m. a 5:00 p. m.',
      },
      {
        value: 'GestionDigitalRealizada',
        label: 'Gestión digital realizada',
        description: 'El cliente ingresó por canal digital; no requiere transferencia.',
      },
    ],
  });

  let code = node.parameters.jsCode;
  if (!code.includes('const description = String(o.description')) {
    code = code.replace(
      `    const label = String(o.label ?? o.l ?? value);`,
      `    const label = String(o.label ?? o.l ?? value);\n    const description = String(o.description ?? '');`,
    );
  }
  if (!code.includes('class="radio-description"')) {
    code = code.replace(
      `    return '<div class="radio"><input type="radio" id="' + esc(optId) + '" name="' + esc(cfg.field) + '" value="' + esc(value) + '" required' + checked + '><label for="' + esc(optId) + '">' + esc(label) + '</label></div>';`,
      `    return '<div class="radio"><input type="radio" id="' + esc(optId) + '" name="' + esc(cfg.field) + '" value="' + esc(value) + '" required' + checked + '><label for="' + esc(optId) + '"><span class="radio-title">' + esc(label) + '</span>' + (description ? '<span class="radio-description">' + esc(description) + '</span>' : '') + '</label></div>';`,
    );
  }
  if (!code.includes('.radio-description{')) {
    code = code.replace(
      '.radio-group{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));',
      '.radio-group{display:grid;grid-template-columns:1fr;',
    );
    code = code.replace(
      '.radio label{display:flex;align-items:center;justify-content:center;',
      '.radio label{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;',
    );
    code = code.replace(
      '.radio label:hover{',
      '.radio-title{font-weight:700}.radio-description{display:block;margin-top:4px;color:var(--muted);font-size:12px;font-weight:400;line-height:1.4;text-align:left}.radio input:checked+label .radio-description{color:rgba(240,246,255,.8)}.radio label:hover{',
    );
  }
  node.parameters.jsCode = code;
}

function adjustStageOne(workflow) {
  configurePaymentButton(workflow);
  addCoverageStep(workflow);
  requireImeiLink(workflow);
  configureDocumentationTransfer(workflow);
  addEscalationTemplate(get(workflow, 'Form Escalar GESTFAC'));
  addEscalationTemplate(get(workflow, 'Form Escalar Gestor'), escalationTemplateSynchronization);

  const sim = get(workflow, 'Form Tipo SIM');
  const parsed = cfgOf(sim);
  patchCfg(sim, {
    options: parsed.cfg.options.filter((option) => option.value !== 'MultiSIM'),
  });

  // Un IMEI no registrado se transfiere directamente a documentación.
  setTarget(workflow, 'IF registro_imei_ok', 1, 'Form Enviar Doc');
  setTarget(workflow, 'IF Volver Enviar Doc', 0, 'Form Consultar Registro IMEI');
  removeNodes(workflow, [
    'Form Confirmar Proceso', 'Enviar Confirmar Proceso',
    'Espera Confirmar Proceso', 'IF Volver Confirmar Proceso',
  ]);

  const prepare = get(workflow, 'Preparar Registro SQL');
  let code = prepare.parameters.jsCode;
  if (!code.includes("cobertura_viaje: value('cobertura_viaje')")) {
    code = code.replace(
      `linea_activa: value('linea_activa'),`,
      `linea_activa: value('linea_activa'),\n  cobertura_viaje: value('cobertura_viaje'),`,
    );
  }
  if (!code.includes("mapa_cobertura_abierto: value('mapa_cobertura_abierto')")) {
    code = code.replace(
      `cobertura_viaje: value('cobertura_viaje'),`,
      `cobertura_viaje: value('cobertura_viaje'),\n  mapa_cobertura_abierto: value('mapa_cobertura_abierto'),`,
    );
  }
  if (!code.includes("consulta_imei_abierta: value('consulta_imei_abierta')")) {
    code = code.replace(
      `registro_imei_ok: value('registro_imei_ok'),`,
      `registro_imei_ok: value('registro_imei_ok'),\n  consulta_imei_abierta: value('consulta_imei_abierta'),`,
    );
  }
  code = code.replace("  value('proceso_ok') ? 'registro_imei_gestionado' :\n", '');
  code = code.replace("  proceso_ok: value('proceso_ok'),\n", '');
  code = code.replaceAll('v11.9-responsive-homogeneo-20260715', 'v12-ajustes-operativos-20260819');
  prepare.parameters.jsCode = code;
  for (const note of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.stickyNote')) {
    if (typeof note.parameters?.content !== 'string') continue;
    note.parameters.content = note.parameters.content
      .replace('Selecciona SIM física, eSIM o MultiSIM.', 'Selecciona SIM física o eSIM.')
      .replace('Entregar enlace de registro y opción `*700`; confirmar el proceso.', 'El IMEI no registrado se transfiere directamente a documentación.');
  }
  workflow.versionId = 'v12-ajustes-operativos-20260819';
}

function adjustStageTwo(workflow) {
  // Solo se manejan SIM física y eSIM.
  removeNodes(workflow, [
    'IF Tipo SIM Fisica', 'Form Resolver MultiSIM', 'Enviar Resolver MultiSIM',
    'Espera Resolver MultiSIM', 'IF Ruta MultiSIM Virtual',
  ]);

  removeNodes(workflow, [
    'Form Validar QR', 'Enviar Validar QR', 'Espera Validar QR', 'IF Volver Validar QR',
    'IF QR Instalado Correctamente', 'IF QR Escaneo OK',
  ]);

  const manage = get(workflow, 'Form Gestionar QR');
  patchCfg(manage, {
    field: 'qr_estado',
    title: 'Confirmar estado del {accent}',
    titleAccent: 'QR',
    question: 'ESTADO DE INSTALACIÓN DEL QR',
    subtitle: 'Confirma si la eSIM quedó instalada. Si el QR aún no funciona, reutiliza el mismo código dentro de las primeras 24 horas o escala el caso cuando se cumpla el plazo.',
    tag: 'Diagnóstico · SIM virtual',
    allowBack: false,
    options: [
      { value: 'Instalado', label: 'La eSIM quedó instalada' },
      { value: 'Menos24', label: 'No funciona: reutilizar el QR antes de 24 horas' },
      { value: 'Cumplidas24', label: 'No funciona: ya cumplió 24 horas' },
    ],
  });
  let manageCode = manage.parameters.jsCode;
  if (!manageCode.includes('.qr-state-layout-marker{')) {
    manageCode = manageCode.replace(
      '@media(prefers-reduced-motion:reduce)',
      '.qr-state-layout-marker{display:none}.radio-group{grid-template-columns:1fr}.actions{grid-template-columns:1fr!important}.actions .btn{width:100%}@media(prefers-reduced-motion:reduce)',
    );
  }
  manage.parameters.jsCode = manageCode;

  let confirmService = workflow.nodes.find((node) => node.name === 'Form Confirmar Funcionalidad Post QR');
  if (!confirmService) {
    confirmService = clone(get(workflow, 'Form Linea Portada'));
    confirmService.id = 'etapa2-form-confirmar-funcionalidad-post-qr-20260901';
    confirmService.name = 'Form Confirmar Funcionalidad Post QR';
    confirmService.position = [3160, -650];
    patchCfg(confirmService, {
      field: 'servicio_post_qr',
      title: 'Confirmar funcionalidad del {accent}',
      titleAccent: 'servicio',
      question: 'RESULTADO DESPUÉS DEL ESCANEO DEL QR',
      subtitle: 'Después de instalar o reutilizar el QR, confirma si el servicio ya funciona. Si la falla continúa, iniciaremos el soporte técnico de la eSIM.',
      tag: 'Diagnóstico · Validación posterior al QR',
      buttonLabel: 'Continuar',
      options: [
        { value: 'Si', label: 'Sí, el servicio funciona' },
        { value: 'No', label: 'No, la falla continúa' },
      ],
      allowBack: true,
      finishToStart: false,
      finishToStartWhen: {},
      outcome: null,
      nextStep: null,
    });
    workflow.nodes.push(confirmService);

    const sendConfirm = clone(get(workflow, 'Enviar Linea Portada'));
    sendConfirm.id = 'etapa2-enviar-confirmar-funcionalidad-post-qr-20260901';
    sendConfirm.name = 'Enviar Confirmar Funcionalidad Post QR';
    sendConfirm.position = [3440, -650];
    workflow.nodes.push(sendConfirm);

    const waitConfirm = clone(get(workflow, 'Espera Linea Portada'));
    waitConfirm.id = 'etapa2-espera-confirmar-funcionalidad-post-qr-20260901';
    waitConfirm.name = 'Espera Confirmar Funcionalidad Post QR';
    waitConfirm.webhookId = 'etapa2-confirmar-funcionalidad-post-qr-20260901';
    waitConfirm.position = [3720, -650];
    workflow.nodes.push(waitConfirm);

    // La etapa 2 consolidada ya no conserva un IF "Volver" propio para
    // Linea Portada. Reutilizamos el contrato equivalente de otro formulario:
    // solo evalua query.__accion === 'volver'.
    const backConfirm = clone(get(workflow, 'IF Volver Verificar Portacion'));
    backConfirm.id = 'etapa2-if-volver-confirmar-funcionalidad-post-qr-20260901';
    backConfirm.name = 'IF Volver Confirmar Funcionalidad Post QR';
    backConfirm.position = [4000, -650];
    workflow.nodes.push(backConfirm);

    const resultConfirm = clone(get(workflow, 'IF Linea Portada'));
    resultConfirm.id = 'etapa2-if-servicio-post-qr-funciona-20260901';
    resultConfirm.name = 'IF Servicio Post QR Funciona';
    resultConfirm.position = [4280, -650];
    resultConfirm.parameters.conditions.conditions[0] = {
      id: 'cond-etapa2-servicio-post-qr-funciona',
      leftValue: '={{ $json.query.servicio_post_qr }}',
      rightValue: 'Si',
      operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
    };
    workflow.nodes.push(resultConfirm);

    workflow.nodes.push({
      id: 'etapa2-marcar-cierre-servicio-post-qr-20260901',
      name: 'Marcar Cierre Servicio Post QR',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [4560, -650],
      parameters: {
        jsCode: "const query = ($json && $json.query) ? $json.query : ($json || {});\nreturn [{ json: { ...$json, query: { ...query, __outcome: 'servicio_normalizado_qr', __next_step: 'fin_etapa_2' } } }];",
      },
    });
  }

  const qrIf = workflow.nodes.find((node) => node.name === 'IF QR Cumplio 24 Horas') || get(workflow, 'IF QR Requiere Reposicion');
  qrIf.name = 'IF QR Cumplio 24 Horas';
  qrIf.id = 'etapa2-if-qr-cumplio-24-horas';
  qrIf.parameters.conditions.conditions[0].leftValue = '={{ $json.query.qr_estado }}';
  qrIf.parameters.conditions.conditions[0].rightValue = 'Cumplidas24';
  if (workflow.connections['IF QR Requiere Reposicion']) {
    workflow.connections['IF QR Cumplio 24 Horas'] = workflow.connections['IF QR Requiere Reposicion'];
    delete workflow.connections['IF QR Requiere Reposicion'];
  }
  for (const connection of Object.values(workflow.connections)) {
    for (const branch of connection.main || []) {
      for (const edge of branch || []) {
        if (edge.node === 'IF QR Requiere Reposicion') edge.node = 'IF QR Cumplio 24 Horas';
      }
    }
  }

  const escalation = workflow.nodes.find((node) => node.name === 'Form Escalar Gestor QR') || get(workflow, 'Form Confirmar Reposicion QR');
  escalation.name = 'Form Escalar Gestor QR';
  escalation.id = 'etapa2-form-escalar-gestor-qr';
  patchCfg(escalation, {
    field: 'gestor_qr_ok',
    title: 'Escalar novedad del {accent}',
    titleAccent: 'QR',
    question: 'ESCALAMIENTO AL GESTOR',
    subtitle: 'El QR superó las 24 horas. Confirma que el caso fue escalado al gestor para la gestión correspondiente.',
    tag: 'Diagnóstico · Escalamiento QR',
    buttonLabel: 'Guardar y finalizar',
    options: [{ value: 'Si', label: 'Escalamiento realizado' }],
    outcome: 'gestor_qr_vencido',
    nextStep: 'fin_etapa_2',
  });
  const send = workflow.nodes.find((node) => node.name === 'Enviar Escalar Gestor QR') || get(workflow, 'Enviar Confirmar Reposicion QR');
  send.name = 'Enviar Escalar Gestor QR';
  send.id = 'etapa2-enviar-escalar-gestor-qr';
  const wait = workflow.nodes.find((node) => node.name === 'Espera Escalar Gestor QR') || get(workflow, 'Espera Confirmar Reposicion QR');
  wait.name = 'Espera Escalar Gestor QR';
  wait.id = 'etapa2-espera-escalar-gestor-qr';
  wait.webhookId = 'etapa2-escalar-gestor-qr';
  const back = workflow.nodes.find((node) => node.name === 'IF Volver Escalar Gestor QR') || get(workflow, 'IF Volver Confirmar Reposicion QR');
  back.name = 'IF Volver Escalar Gestor QR';
  back.id = 'etapa2-if-volver-escalar-gestor-qr';

  const renames = new Map([
    ['Form Confirmar Reposicion QR', 'Form Escalar Gestor QR'],
    ['Enviar Confirmar Reposicion QR', 'Enviar Escalar Gestor QR'],
    ['Espera Confirmar Reposicion QR', 'Espera Escalar Gestor QR'],
    ['IF Volver Confirmar Reposicion QR', 'IF Volver Escalar Gestor QR'],
  ]);
  const rebuilt = {};
  for (const [source, value] of Object.entries(workflow.connections)) {
    const sourceName = renames.get(source) || source;
    rebuilt[sourceName] = value;
    for (const branch of value.main || []) {
      for (const edge of branch || []) edge.node = renames.get(edge.node) || edge.node;
    }
  }
  workflow.connections = rebuilt;
  chain(workflow, 'Form Escalar Gestor QR', 'Enviar Escalar Gestor QR', 'Espera Escalar Gestor QR', 'IF Volver Escalar Gestor QR');
  setTarget(workflow, 'IF Tipo SIM eSIM', 0, 'Form Gestionar QR');
  setTarget(workflow, 'IF Tipo SIM eSIM', 1, 'Form Linea Portada');
  chain(workflow, 'Form Gestionar QR', 'Enviar Gestionar QR', 'Espera Gestionar QR', 'IF Volver Gestionar QR');
  setTarget(workflow, 'IF Volver Gestionar QR', 0, 'Form Gestionar QR');
  setTarget(workflow, 'IF Volver Gestionar QR', 1, 'IF QR Cumplio 24 Horas');
  chain(workflow, 'Form Confirmar Funcionalidad Post QR', 'Enviar Confirmar Funcionalidad Post QR', 'Espera Confirmar Funcionalidad Post QR', 'IF Volver Confirmar Funcionalidad Post QR');
  setTarget(workflow, 'IF Volver Confirmar Funcionalidad Post QR', 0, 'Form Gestionar QR');
  setTarget(workflow, 'IF Volver Confirmar Funcionalidad Post QR', 1, 'IF Servicio Post QR Funciona');
  setTarget(workflow, 'IF Servicio Post QR Funciona', 0, 'Marcar Cierre Servicio Post QR');
  setTarget(workflow, 'IF Servicio Post QR Funciona', 1, 'Form Linea Portada');
  setTarget(workflow, 'Marcar Cierre Servicio Post QR', 0, 'Preparar Registro Etapa 2 SQL');
  setTarget(workflow, 'IF Volver Escalar Gestor QR', 0, 'Form Gestionar QR');
  setTarget(workflow, 'IF Volver Escalar Gestor QR', 1, 'Preparar Registro Etapa 2 SQL');
  setTarget(workflow, 'IF QR Cumplio 24 Horas', 0, 'Form Escalar Gestor QR');
  setTarget(workflow, 'IF QR Cumplio 24 Horas', 1, 'Form Confirmar Funcionalidad Post QR');

  const sumaEscalation = get(workflow, 'Form Escalar Gestor SUMA');
  patchCfg(sumaEscalation, {
    options: [{ value: 'Si', label: 'Escalamiento realizado' }],
  });
  addEscalationTemplate(get(workflow, 'Form Escalar Gestor QR'), escalationTemplateQrExpired);
  addEscalationTemplate(get(workflow, 'Form Escalar Gestor NIP'));
  addEscalationTemplate(get(workflow, 'Form Escalar Gestor SUMA'), escalationTemplateSynchronization);

  const prepare = get(workflow, 'Preparar Registro Etapa 2 SQL');
  let code = prepare.parameters.jsCode;
  code = code
    .replace("(raw('reposicion_ok') ? 'reposicion_qr' :", "(raw('gestor_qr_ok') ? 'gestor_qr_vencido' :")
    .replace("const rutaMulti = tipoSim === 'MultiSIM' ? raw('ruta_multisim') : null;\n", '')
    .replace("const rutaVirtual = tipoSim === 'eSIM' || (tipoSim === 'MultiSIM' && rutaMulti === 'Virtual');", "const rutaVirtual = tipoSim === 'eSIM';")
    .replace("const finalQr = outcome === 'reposicion_qr';", "const finalQr = outcome === 'gestor_qr_vencido';")
    .replace('  ruta_multisim: rutaMulti,\n', '')
    .replace("  qr_gestion: rutaVirtual ? raw('qr_gestion') : null,", "  qr_estado: rutaVirtual ? raw('qr_estado') : null,")
    .replace("  qr_escaneo_ok: rutaVirtual ? raw('qr_escaneo_ok') : null,\n", '')
    .replace("  qr_vigencia: rutaVirtual ? raw('qr_vigencia') : null,", "  qr_estado: rutaVirtual ? raw('qr_estado') : null,")
    .replace("  reposicion_ok: finalQr ? raw('reposicion_ok') : null,", "  gestor_qr_ok: finalQr ? raw('gestor_qr_ok') : null,")
    .replace("['gestor_nip_vencido','gestor_sincronizacion_suma']", "['gestor_qr_vencido','gestor_nip_vencido','gestor_sincronizacion_suma']")
    .replaceAll('etapa2-v3-layout-handoff-20260715', 'etapa2-v4-ajustes-operativos-20260819');
  if (!code.includes("servicio_post_qr: rutaVirtual ? raw('servicio_post_qr')")) {
    code = code.replace(
      "  qr_estado: rutaVirtual ? raw('qr_estado') : null,",
      "  qr_estado: rutaVirtual ? raw('qr_estado') : null,\n  servicio_post_qr: rutaVirtual ? raw('servicio_post_qr') : null,",
    );
  }
  prepare.parameters.jsCode = code;
  workflow.versionId = 'etapa2-v4-ajustes-operativos-20260819';

  for (const note of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.stickyNote')) {
    if (typeof note.parameters?.content !== 'string') continue;
    note.parameters.content = note.parameters.content
      .replace('- MultiSIM → selección explícita del componente afectado', '')
      .replace('Validar escaneo, reintentar o reenviar. Si no funciona, registrar reposición como salida controlada.', 'Una sola decisión confirma instalación o vigencia. Antes de 24 horas se reutiliza el mismo QR; al cumplir el plazo se escala al gestor.')
      .replace('Validar escaneo y vigencia. Antes de 24 horas se reutiliza el mismo QR; al cumplir el plazo se escala al gestor.', 'Una sola decisión confirma instalación o vigencia. Antes de 24 horas se reutiliza el mismo QR; al cumplir el plazo se escala al gestor.');
  }
}

function adjustStageThree(workflow) {
  const form = get(workflow, 'Form Verificar Configuracion Equipo');
  const parsed = cfgOf(form);
  if (!parsed.cfg.options.some((option) => option.value === 'SMS')) {
    patchCfg(form, {
      options: [
        ...parsed.cfg.options.slice(0, 2),
        { value: 'SMS', label: 'Falla en SMS' },
        ...parsed.cfg.options.slice(2),
      ],
      subtitle: 'Selecciona el síntoma que continúa después de validar la línea y los recursos en SUMA Móvil. Las fallas de SMS siguen el mismo soporte de llamadas.',
    });
  }

  const equipmentForm = get(workflow, 'Form Confirmar Equipo Cliente');
  const equipmentCfg = cfgOf(equipmentForm).cfg;
  patchCfg(equipmentForm, {
    options: equipmentCfg.options.map((option) =>
      option.value === 'Otro' ? { ...option, label: 'Otro / No identificado' } : option
    ),
  });

  const platformForm = get(workflow, 'Form Configurar Equipo Plataforma');
  patchCfg(platformForm, {
    subtitle: 'Abre la guía de configuración, revisa los pasos para el equipo y aplica únicamente la configuración relacionada con datos y red. Debes abrir el enlace antes de continuar.',
    errorMsg: 'Primero abre la guía de configuración y confirma que la configuración fue revisada',
    requiredLink: 'https://www.helpforsmartphone.com/public/es-ES/honor/10/android-9-0/guides/22/Set-up-Internet-Honor-10',
    requiredLinkLabel: 'Abrir guía de configuración de Internet',
  });
  let platformCode = platformForm.parameters.jsCode;
  if (!platformCode.includes('name="guia_configuracion_abierta"')) {
    platformCode = platformCode.replace(
      `rows.push('<input type="hidden" name="__workflow_session" value="' + esc(session) + '">');`,
      `rows.push('<input type="hidden" name="__workflow_session" value="' + esc(session) + '">');\n  rows.push('<input type="hidden" id="guiaConfiguracionAbierta" name="guia_configuracion_abierta" value="' + esc(fieldValue('guia_configuracion_abierta')) + '">');`,
    );
    platformCode = platformCode.replace(
      `if (internal.has(key) || key === cfg.field || key === '__workflow_session' || key === 'workflow_session') return;`,
      `if (internal.has(key) || key === cfg.field || key === '__workflow_session' || key === 'workflow_session' || key === 'guia_configuracion_abierta') return;`,
    );
  }
  if (!platformCode.includes('.required-link{')) {
    platformCode = platformCode.replace(
      '.label{font-size:11px;',
      '.required-link{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;margin:0 0 14px;padding:10px 14px;border-radius:12px;border:1px solid rgba(56,199,255,.55);background:rgba(29,161,242,.12);color:#38c7ff;text-decoration:none;font-weight:700;font-size:13px}.required-link:hover{background:rgba(29,161,242,.2);border-color:#38c7ff}.required-link.is-opened{border-color:rgba(66,230,139,.65);color:#63e89e;background:rgba(66,230,139,.1)}.label{font-size:11px;',
    );
  }
  if (!platformCode.includes('id="configurationGuideLink"')) {
    platformCode = platformCode.replace(
      `'</p><div class="err-banner" id="errBanner" role="alert">'`,
      `'</p><a class="required-link" id="configurationGuideLink" href="' + esc(cfg.requiredLink) + '" target="_blank" rel="noopener noreferrer">&#8599; ' + esc(cfg.requiredLinkLabel) + '</a><div class="err-banner" id="errBanner" role="alert">'`,
    );
  }
  if (!platformCode.includes('var guideLink=document.getElementById("configurationGuideLink")')) {
    platformCode = platformCode.replace(
      'var submitBtn=document.getElementById("submitBtn");if(!form)return;',
      'var submitBtn=document.getElementById("submitBtn");var guideLink=document.getElementById("configurationGuideLink");var guideOpened=document.getElementById("guiaConfiguracionAbierta");if(guideLink&&guideOpened){if(guideOpened.value==="Si")guideLink.classList.add("is-opened");guideLink.addEventListener("click",function(){guideOpened.value="Si";guideLink.classList.add("is-opened");err.classList.remove("is-visible");err.style.display="none";});}if(!form)return;',
    );
    platformCode = platformCode.replace(
      'var missing=false;groups.forEach(function(n){if(!data.get(n))missing=true;});if(missing){',
      'var missing=false;groups.forEach(function(n){if(!data.get(n))missing=true;});if(!data.get("guia_configuracion_abierta")||data.get("guia_configuracion_abierta")!=="Si")missing=true;if(missing){',
    );
  }
  platformForm.parameters.jsCode = platformCode;

  const esimDecision = workflow.nodes.find((node) => node.name === 'IF Tipo SIM eSIM Antes de Prueba Cruzada');
  if (!esimDecision) {
    const node = clone(get(workflow, 'IF Configuracion Funciono'));
    node.id = 'etapa3-if-esim-antes-prueba-cruzada-20260826';
    node.name = 'IF Tipo SIM eSIM Antes de Prueba Cruzada';
    node.position = [2560, -500];
    node.parameters.conditions.conditions[0] = {
      id: 'cond-etapa3-esim-antes-prueba-cruzada',
      leftValue: '={{ $json.query.tipo_sim }}',
      rightValue: 'eSIM',
      operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
    };
    workflow.nodes.push(node);
  }
  const esimBackDecision = workflow.nodes.find((node) => node.name === 'IF Volver Reinicio eSIM');
  if (!esimBackDecision) {
    const node = clone(get(workflow, 'IF Configuracion Funciono'));
    node.id = 'etapa3-if-volver-reinicio-esim-20260826';
    node.name = 'IF Volver Reinicio eSIM';
    node.position = [6480, 650];
    node.parameters.conditions.conditions[0] = {
      id: 'cond-etapa3-volver-reinicio-esim',
      leftValue: '={{ $json.query.tipo_sim }}',
      rightValue: 'eSIM',
      operator: { type: 'string', operation: 'equals', name: 'filter.operator.equals' },
    };
    workflow.nodes.push(node);
  }
  setTarget(workflow, 'IF Configuracion Funciono', 1, 'IF Tipo SIM eSIM Antes de Prueba Cruzada');
  setTarget(workflow, 'IF Falla Datos o Red', 1, 'IF Tipo SIM eSIM Antes de Prueba Cruzada');
  setTarget(workflow, 'IF Tipo SIM eSIM Antes de Prueba Cruzada', 0, 'Form Reiniciar y Reinsertar SIM');
  setTarget(workflow, 'IF Tipo SIM eSIM Antes de Prueba Cruzada', 1, 'Form Validar Dispositivo Alterno');
  setTarget(workflow, 'IF Volver Reiniciar y Reinsertar SIM', 0, 'IF Volver Reinicio eSIM');
  setTarget(workflow, 'IF Volver Reinicio eSIM', 0, 'Form Verificar Configuracion Equipo');
  setTarget(workflow, 'IF Volver Reinicio eSIM', 1, 'IF Volver Reinicio Desde Prueba');

  const restartForm = get(workflow, 'Form Reiniciar y Reinsertar SIM');
  patchCfg(restartForm, {
    esimTitle: 'Reiniciar el {accent}',
    esimTitleAccent: 'equipo con eSIM',
    esimSubtitle: 'Activa el modo avión, apaga el dispositivo, espera 20 segundos y enciéndelo nuevamente. Luego desactiva el modo avión y valida el servicio.',
  });
  let restartCode = restartForm.parameters.jsCode;
  if (!restartCode.includes("const isEsim = fieldValue('tipo_sim').toLowerCase() === 'esim';")) {
    restartCode = restartCode.replace(
      `  const titleHtml = cfg.titleAccent ? esc(cfg.title).replace('{accent}', '<em>' + esc(cfg.titleAccent) + '</em>') : esc(cfg.title);`,
      `  const isEsim = fieldValue('tipo_sim').toLowerCase() === 'esim';\n  const activeTitle = isEsim ? cfg.esimTitle : cfg.title;\n  const activeAccent = isEsim ? cfg.esimTitleAccent : cfg.titleAccent;\n  const activeSubtitle = isEsim ? cfg.esimSubtitle : cfg.subtitle;\n  const titleHtml = activeAccent ? esc(activeTitle).replace('{accent}', '<em>' + esc(activeAccent) + '</em>') : esc(activeTitle);`,
    );
    restartCode = restartCode.replace(
      `esc(cfg.subtitle || '') + '</p><div class="err-banner"`,
      `esc(activeSubtitle || '') + '</p><div class="err-banner"`,
    );
    restartCode = restartCode.replace(
      `esc(String(cfg.title || '').replace('{accent}', cfg.titleAccent || ''))`,
      `esc(String(activeTitle || '').replace('{accent}', activeAccent || ''))`,
    );
  }
  restartForm.parameters.jsCode = restartCode;

  addEscalationTemplate(get(workflow, 'Form Escalar Segundo Nivel'));

  const prepare = get(workflow, 'Preparar Registro Etapa 3 SQL');
  if (!prepare.parameters.jsCode.includes("guia_configuracion_abierta: raw('guia_configuracion_abierta')")) {
    prepare.parameters.jsCode = prepare.parameters.jsCode.replace(
      `  configuracion_plataforma: raw('configuracion_plataforma'),`,
      `  configuracion_plataforma: raw('configuracion_plataforma'),\n  guia_configuracion_abierta: raw('guia_configuracion_abierta'),`,
    );
  }
  workflow.versionId = 'etapa3-v4-ajustes-operativos-20260819';
}

const one = load(files.one);
const two = load(files.two);
const three = load(files.three);
adjustStageOne(one);
adjustStageTwo(two);
adjustStageThree(three);
save(files.one, one);
save(files.two, two);
save(files.three, three);
console.log('Ajustes operativos aplicados a las tres etapas.');
