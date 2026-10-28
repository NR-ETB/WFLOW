// Mejora idempotente. No genera datos ficticios ni envía información a SUMA.
const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('./plantilla_segundo_nivel');
const sql = require('./postgres_consultas');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'Ningun Servicio Funciona - 3.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = name => {
  const found = workflow.nodes.find(item => item.name === name);
  if (!found) throw new Error('No existe ' + name);
  return found;
};
const edge = name => ({ node: name, type: 'main', index: 0 });
function put(value) {
  const previous = workflow.nodes.find(item => item.name === value.name);
  if (previous) Object.assign(previous, value, { position: previous.position });
  else workflow.nodes.push(value);
}
node('Consultar Contexto Etapa 2 PostgreSQL').parameters.query = sql.etapa2;
for (const name of ['Enviar Escalar Segundo Nivel', 'Enviar Resumen y Observaciones']) {
  const response = node(name);
  const entries = response.parameters.options?.responseHeaders?.entries || [];
  response.parameters.options = { ...response.parameters.options, responseHeaders: { entries: [
    ...entries.filter(item => !['cache-control', 'referrer-policy'].includes(item.name.toLowerCase())),
    { name: 'Cache-Control', value: 'no-store' }, { name: 'Referrer-Policy', value: 'no-referrer' },
  ] } };
}
const trustedContext = `function secondLevelContext() {
  let row = {};
  try { row = $('Consultar Contexto Etapa 2 PostgreSQL').first().json || {}; } catch (error) {}
  const requested = String(incomingQuery.workflow_session || incomingQuery.__workflow_session || '');
  const matched = requested && row.workflow_session === requested;
  const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : (value || {}); } catch (error) { return {}; } };
  const source = { ...(matched ? parse(row.contexto_etapa_1) : {}), ...(matched ? parse(row.contexto_etapa_2) : {}), ...incomingQuery };
  // Nunca confiar en el usuario ni en la PQR recibidos en el navegador.
  source.usuario_asesor = matched ? String(row.usuario_asesor || '') : '';
  source.segundo_nivel_usuario = source.usuario_asesor;
  return { source, pqr: matched ? String(row.pqr || '') : '' };
}
`;
const editor = `function secondLevelEditor() {
  const context = secondLevelContext();
  const values = templateValues(context.source, secondLevelFields);
  return '<section class="second-level-editor" aria-labelledby="templateHeading"><h2 id="templateHeading">Plantilla para SUMA</h2><p>Se recuperan los datos de esta gestión. Completa únicamente los campos pendientes y verifica la plantilla antes de copiar. Si un dato no aplica, indícalo expresamente.</p>' +
    (context.pqr ? '<p class="template-reference">PQR: ' + esc(context.pqr) + '</p>' : '') +
    ($json.plantilla_invalida ? '<p class="template-error" role="alert">Completa los 14 campos antes de confirmar el escalamiento.</p>' : '') +
    '<div class="template-fields">' + secondLevelFields.map(([key,label]) => '<label for="template-' + key + '">' + esc(label) + '<input id="template-' + key + '" name="segundo_nivel_' + key + '" value="' + esc(values[key]) + '" maxlength="300" required autocomplete="off"' + (key === 'usuario' ? ' readonly' : '') + '></label>').join('') +
    '</div><details class="escalation-template" open><summary>Ver plantilla de escalamiento</summary><div class="template-body"><button type="button" class="copy-template" id="copyEscalationTemplate">Copiar plantilla</button><pre id="escalationTemplateText">' + esc(templateText(values, secondLevelFields)) + '</pre><span class="copy-status" id="copyTemplateStatus" aria-live="polite"></span></div></details><p>El asesor copia esta plantilla y la pega en SUMA. El CRM no realiza el envío automáticamente.</p></section>';
}
`;
// El bloque se vuelve a generar desde el contrato, sin duplicar modificaciones.
let form = node('Form Escalar Segundo Nivel');
if (!form.parameters.jsCode.includes('function secondLevelEditor()')) {
  let code = form.parameters.jsCode;
  code = code.replace(/^const cfg = (\{.*\});$/m, (_, json) => {
    const cfg = JSON.parse(json);
    cfg.subtitle = 'La plantilla se completa con la información disponible de esta gestión. Revisa los datos, completa los pendientes y copia el resultado para pegarlo en SUMA.';
    return 'const cfg = ' + JSON.stringify(cfg) + ';';
  });
  code = code.replace('function renderForm(){', runtime + trustedContext + editor + 'function renderForm(){');
  code = code.replace("if (internal.has(key)", "if (key.startsWith('segundo_nivel_') || key === 'plantilla_segundo_nivel' || internal.has(key)");
  code = code.replace(" + escalationTemplateHtml + ", " + ");
  code = code.replace("method=\"GET\" action=", "method=\"POST\" action=");
  code = code.replace("+ hiddenInputs() + ", "+ hiddenInputs() + secondLevelEditor() + ");
  // La copia y la previsualización se gestionan juntas para no copiar una versión antigua.
  const start = code.indexOf('if(copyTemplateBtn&&copyTemplateText){');
  const end = code.indexOf('form.querySelectorAll("button[type=submit]")', start);
  if (start < 0 || end < 0) throw new Error('No se encontró el contrato de copia.');
  const client = `var templateInputs=Array.from(form.querySelectorAll("input[name^=segundo_nivel_]"));function updateTemplate(){copyTemplateText.textContent=templateInputs.map(function(input){return input.parentElement.firstChild.textContent+": "+input.value.replace(/[\\r\\n\\t]+/g," ").trim();}).join("\\n");if(copyTemplateStatus)copyTemplateStatus.textContent="";}templateInputs.forEach(function(input){input.addEventListener("input",updateTemplate);});updateTemplate();function templateComplete(){return templateInputs.every(function(input){return input.value.trim().length>0&&input.value.length<=300;});}if(copyTemplateBtn&&copyTemplateText){copyTemplateBtn.addEventListener("click",function(){updateTemplate();if(!templateComplete()){copyTemplateStatus.textContent="Completa los campos pendientes antes de copiar.";return;}var value=copyTemplateText.textContent;var copied=function(){copyTemplateStatus.textContent="Plantilla copiada. Pégala en SUMA.";};var fallback=function(){var area=document.createElement("textarea");area.value=value;document.body.appendChild(area);area.select();var ok=false;try{ok=document.execCommand("copy");}catch(error){}area.remove();if(ok)copied();else{var range=document.createRange();range.selectNodeContents(copyTemplateText);var selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);copyTemplateStatus.textContent="Copia manualmente la plantilla seleccionada (Ctrl+C).";}};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(copied).catch(fallback);else fallback();});}`;
  code = code.slice(0, start) + client + code.slice(end);
  code = code.replace('var data=new FormData(form);', 'if(!templateComplete()){e.preventDefault();err.textContent="Completa los campos pendientes de la plantilla.";err.classList.add("is-visible");err.style.display="flex";var pending=templateInputs.find(function(input){return !input.value.trim();});if(pending)pending.focus();return;}var data=new FormData(form);');
  // Al volver no se colocan datos personales del editor en los GET de pantallas anteriores.
  code = code.replace('if(isBack){', 'if(isBack){templateInputs.forEach(function(input){input.disabled=true;});');
  code = code.replace("<style>' + css + '</style>", "<meta name=\"referrer\" content=\"no-referrer\"><style>' + css + '.second-level-editor{margin-bottom:20px}.second-level-editor h2{font-size:18px;margin:0 0 8px}.second-level-editor p{font-size:13px;line-height:1.5;margin:8px 0 14px;color:var(--muted)}.template-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}.template-fields label{font-size:11px;color:var(--muted);min-width:0}.template-fields input{display:block;width:100%;min-width:0;margin-top:6px;padding:11px;border:1px solid var(--border);border-radius:10px;background:#081a34;color:var(--white);font:14px system-ui}.template-fields input:focus{outline:2px solid var(--blue)}.template-fields input[readonly]{opacity:.75}.template-error{color:#ff8fa3!important}.escalation-template pre{max-height:none;overflow-wrap:anywhere}@media(max-width:480px){.template-fields{grid-template-columns:1fr}}' + '</style>");
  form.parameters.jsCode = code;
}
// Actualizar el contrato puro cuando cambia, sin reinstalar el editor.
const valuesStart = form.parameters.jsCode.indexOf('function templateValues(');
const valuesEnd = form.parameters.jsCode.indexOf('function secondLevelContext()', valuesStart);
if (valuesStart < 0 || valuesEnd < 0) throw new Error('No se encontró el contrato de plantilla.');
form.parameters.jsCode = form.parameters.jsCode.slice(0, valuesStart) + runtime.slice(runtime.indexOf('function templateValues(')) + form.parameters.jsCode.slice(valuesEnd);
// El script del navegador está contenido en una cadena del nodo Code.
form.parameters.jsCode = form.parameters.jsCode.replace(
  String.raw`input.value.replace(/[\r\n\t]+/g," ").trim();}).join("\n")`,
  String.raw`input.value.replace(/[\\r\\n\\t]+/g," ").trim();}).join("\\n")`);
node('Espera Escalar Segundo Nivel').parameters.httpMethod = 'POST';
const normalizeName = 'Normalizar Escalar Segundo Nivel';
put({ id: 'normalizar-plantilla-segundo-nivel', name: normalizeName, type: 'n8n-nodes-base.code', typeVersion: 2,
  position: [0, 0], onError: 'continueErrorOutput', parameters: { jsCode: runtime + `const incomingQuery = { ...($json.body || {}) };
${trustedContext}
const context = secondLevelContext();
const row = $('Consultar Contexto Etapa 2 PostgreSQL').first().json;
if (!row.workflow_session || row.workflow_session !== String(incomingQuery.workflow_session || incomingQuery.__workflow_session || '')) throw new Error('La plantilla no corresponde a la sesión actual.');
const query = { ...incomingQuery };
if (query.__back === '1') {
  for (const key of Object.keys(query)) if (key.startsWith('segundo_nivel_') || key === 'plantilla_segundo_nivel') delete query[key];
  return [{json:{query}}];
}
const values = templateValues(context.source, secondLevelFields);
const invalid = secondLevelFields.some(([key]) => !values[key]) || incomingQuery.escalamiento_segundo_nivel !== 'Si' ||
  secondLevelFields.some(([key]) => typeof incomingQuery['segundo_nivel_' + key] !== 'string' || incomingQuery['segundo_nivel_' + key].length > 300);
for (const [key] of secondLevelFields) query['segundo_nivel_' + key] = values[key];
query.plantilla_segundo_nivel = templateText(values, secondLevelFields);
query.__outcome = 'escalado_segundo_nivel';
query.__next_step = 'cierre_asesor';
return [{json:{query, plantilla_invalida:invalid}}];` } });
const validName = 'IF Plantilla Escalar Segundo Nivel';
put({ id: 'if-plantilla-segundo-nivel', name: validName, type: 'n8n-nodes-base.if', typeVersion: 2.3,
  position: [0, 0], parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 3 },
    conditions: [{ id: 'plantilla-completa', leftValue: '={{ $json.plantilla_invalida }}', rightValue: false,
      operator: { type: 'boolean', operation: 'false', singleValue: true } }], combinator: 'and' }, options: {} } });
workflow.connections['Espera Escalar Segundo Nivel'] = { main: [[edge(normalizeName)]] };
workflow.connections[normalizeName] = { main: [[edge('IF Volver Escalar Segundo Nivel')], [edge('HTML Guardado Pendiente Etapa 3')]] };
workflow.connections['IF Volver Escalar Segundo Nivel'].main[1] = [edge(validName)];
workflow.connections[validName] = { main: [[edge('Preparar Registro Etapa 3 SQL')], [edge('Form Escalar Segundo Nivel')]] };
// Los reintentos necesitan una nueva espera; nunca reutilizan un webhook ya consumido.
const prepared = node('Preparar Registro Etapa 3 SQL');
if (!prepared.parameters.jsCode.includes('plantilla_segundo_nivel:')) {
  prepared.parameters.jsCode = prepared.parameters.jsCode.replace('const context = Object.fromEntries', `if (outcome === 'escalado_segundo_nivel') {
  answers.plantilla_segundo_nivel = raw('plantilla_segundo_nivel');
  answers.datos_segundo_nivel = Object.fromEntries(${JSON.stringify(require('./plantilla_segundo_nivel').fields.map(([key]) => key))}.map(key => [key, raw('segundo_nivel_' + key)]));
}
const context = Object.fromEntries`);
}
workflow.versionId = 'postgres-flujo-3-20261028-plantilla';
prepared.parameters.jsCode = prepared.parameters.jsCode.replace(/workflow_version: '[^']*'/,
  "workflow_version: 'postgres-flujo-3-20261028-plantilla'");
fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
console.log('Plantilla de Segundo Nivel conectada a la sesión, editor y log; envío manual a SUMA.');
