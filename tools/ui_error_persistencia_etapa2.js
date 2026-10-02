// Código del nodo n8n. El detalle técnico queda en la ejecución, no en la UI.
const item = ($json && $json.item) ? $json.item : ($json || {});
let prepared = {};
let normalized = {};
try { prepared = $('Preparar Registro Etapa 2 SQL').first().json || {}; } catch (error) {}
try { normalized = $('Normalizar Handoff a Diagnostico de Equipo').first().json || {}; } catch (error) {}
if (!normalized.workflow_session) {
  try { normalized = $('Normalizar Entrada Etapa 2').first().json || {}; } catch (error) {}
}
const session = String(item.workflow_session || item.workflow_session_solicitada || prepared.workflow_session || normalized.workflow_session || '');
const saving = Boolean(item.resultado_etapa_2 || prepared.resultado_etapa_2);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const candidateBase = String(prepared.public_base || normalized.public_base || $execution.resumeUrl || '');
const match = candidateBase.match(/^(https?:\/\/[^/]+)(\/[^?#]*)?/i);
let retryUrl = '';
if (match && session && session !== '__missing__') {
  let basePath = match[2] || '';
  for (const marker of ['/webhook-waiting/', '/webhook-test/', '/webhook/']) {
    const index = basePath.indexOf(marker);
    if (index >= 0) { basePath = basePath.slice(0, index); break; }
  }
  let context = {};
  try { context = JSON.parse(prepared.contexto_json || '{}'); } catch (error) {}
  delete context.__back;
  context.workflow_session = session;
  const params = Object.entries(context).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(Array.isArray(value) ? value[0] : String(value ?? ''))).join('&');
  retryUrl = match[1] + basePath.replace(/\/$/, '') + '/webhook/' +
    (saving ? 'etb-form-parte-2-continuar?' + params : 'etb-form-parte-2?workflow_session=' + encodeURIComponent(session));
}
const action = retryUrl ? '<a class="button" href="' + esc(retryUrl) + '">Reintentar guardado</a>' : '';
const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>ETB - Gestión pendiente de guardar</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#071830;color:#f0f6ff;font-family:system-ui,sans-serif;padding:18px}.card{width:min(100%,620px);background:#10284a;border:1px solid #1a416d;border-radius:20px;padding:32px}h1{font-size:clamp(24px,5vw,32px)}p{color:#c3cede;line-height:1.6}.tag{color:#38c7ff;font-size:12px}.reference{overflow-wrap:anywhere;font-size:13px}.button{display:block;background:#148cdd;color:white;padding:16px;border-radius:12px;text-align:center;text-decoration:none;font-weight:700}@media(max-width:480px){.card{padding:24px 18px}}</style></head><body><main class="card"><div class="tag">GESTIÓN PENDIENTE DE GUARDAR</div><h1>No pudimos confirmar el guardado</h1><p>La gestión aún no está confirmada. Reintenta sin iniciar otra gestión. Si continúa, comparte la referencia con soporte.</p><p class="reference">Referencia: ' + esc(session || 'no disponible') + '</p>' + action + '</main></body></html>';
return [{ json: {
  html_response: html,
  persistence_diagnostic: {
    workflow_session: session,
    phase: saving ? 'guardar_etapa_2' : 'consultar_etapa_1',
    table: 'CRM.GestionesFlujosLog',
    message: String($json.message || $json.error?.message || 'Error sin detalle'),
    code: $json.error?.code || null,
  },
} }];
