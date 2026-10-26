// Actualiza únicamente la interfaz de cierre; conserva las rutas y la persistencia.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const initialUrlCode = `function initialManagementUrl(value) {
  const match = String(value || '').match(/^(https?:\\/\\/[^/]+)(\\/[^?#]*)?/i);
  if (!match) return '';
  const pathname = match[2] || '';
  const marker = ['/webhook-waiting/', '/webhook-test/', '/webhook/'].find(part => pathname.includes(part));
  if (!marker) return '';
  return match[1] + pathname.slice(0, pathname.indexOf(marker)) + '/webhook/etb-form-inicial';
}`;
// El enlace absoluto abre la entrada publicada, incluso desde una ejecución de prueba.
// _top sale del iframe de n8n sin crear otra pestaña. No se transmite la sesión cerrada.
const completionScript = `function showCompletion(){var card=document.querySelector(".card");if(!card)return;card.innerHTML="<div class='completion'><div class='completion-icon' aria-hidden='true'>&#10003;</div><h1 class='completion-title'>Gestión finalizada</h1><p class='completion-copy'>Las respuestas fueron guardadas correctamente.</p><p class='completion-hint'>Puedes iniciar otra atención en esta misma pestaña.</p></div>";if(initialUrl){var link=document.createElement("a");link.id="newManagementLink";link.className="btn btn-primary";link.textContent="Iniciar nueva gestión";link.href=initialUrl;link.target="_top";link.style.cssText="display:flex;align-items:center;justify-content:center;margin-top:24px;text-decoration:none;min-height:56px;white-space:normal;text-align:center";card.querySelector(".completion").appendChild(link);}}`;
let changed = 0;
for (let stage = 1; stage <= 3; stage++) {
  const file = path.join(root, `Ningun Servicio Funciona - ${stage}.json`);
  const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const node of workflow.nodes) {
    let code = node.parameters.jsCode;
    if (!code) continue;
    if (code.includes('function showCompletion()')) {
      if (!code.includes('function initialManagementUrl(')) {
        code = code.replace(/^const resumeUrl = .*;$/m,
          line => line + '\n' + initialUrlCode + '\nconst initialUrlJson = JSON.stringify(initialManagementUrl(resumeUrl));');
        code = code.replace("var startUrl=' + startUrlJson + ';", "var initialUrl=' + initialUrlJson + ';var startUrl=' + startUrlJson + ';");
      }
      if (!code.includes('const initialUrlJson')) {
        code = code.replace(/^const resumeUrl = .*;$/m,
          line => line + '\n' + initialUrlCode + '\nconst initialUrlJson = JSON.stringify(initialManagementUrl(resumeUrl));');
      }
      const start = code.indexOf('function showCompletion()');
      const end = code.indexOf('var cfgFinishToStart=', start);
      if (end < 0) throw new Error('No se encontró el cierre de ' + node.name);
      // El script cliente forma parte de un literal JavaScript del nodo.
      code = code.slice(0, start) + completionScript.replaceAll("'", "\\'") + code.slice(end);
      code = code.replace('if(isTestMode||!startUrl){showCompletion();return;}window.location.href=startUrl;',
        'showCompletion();');
      code = code.replace('if(finishComplete||isTestMode||!startUrl){showCompletion();return;}window.location.href=startUrl;',
        'showCompletion();');
      // Tipo SIM entrega la misma gestión a la etapa 2; nunca termina aquí.
      if (stage === 1 && !code.includes('var handoffSession=')) {
        code = code.replace('if(!response.ok)throw new Error("HTTP "+response.status);showCompletion();',
          'if(!response.ok)throw new Error("HTTP "+response.status);return response.text();}).then(function(body){if(body.trim()!=="OK")throw new Error("Guardado no confirmado");showCompletion();');
      }
      code = code.replaceAll('No fue posible finalizar el proceso. Verifica la ejecución en n8n e inténtalo nuevamente.',
        'No pudimos confirmar el guardado. Tus respuestas siguen en esta pantalla. Reintenta; si continúa, informa la referencia de la gestión a soporte.');
    }
    if (node.name === 'HTML Cierre Definitivo' && !code.includes('newManagementLink')) {
      code = initialUrlCode + `\nlet initialUrl = initialManagementUrl(typeof $execution === 'object' ? $execution.resumeUrl : '');
if (!initialUrl) { try { initialUrl = initialManagementUrl($('Apertura Etapa 3').first().json.webhookUrl); } catch {} }
` + code;
      code = code.replace("return [{json:{html_response:html}}];", `const restart = initialUrl ? '<a id="newManagementLink" target="_top" style="display:block;margin-top:24px;padding:17px;border-radius:13px;background:linear-gradient(135deg,#1da1f2,#0d80cc);color:#fff;text-align:center;text-decoration:none;font-weight:700" href="' + esc(initialUrl) + '">Iniciar nueva gestión</a>' : '';
return [{json:{html_response:html.replace('</main>', restart + '</main>')}}];`);
    }
    if (code !== node.parameters.jsCode) { node.parameters.jsCode = code; changed++; }
  }
  fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
}
console.log('Cierre reutilizable aplicado: ' + changed + ' pantallas.');
