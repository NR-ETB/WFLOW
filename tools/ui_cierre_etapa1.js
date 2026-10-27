// Código n8n: se ejecuta después de confirmar el guardado en PostgreSQL.
const saved = $('Preparar Registro SQL').first().json;
if ($json.workflow_session !== saved.workflow_session || Number($json.registro_confirmado) !== 1) {
  throw new Error('La base no confirmó el cierre de esta sesión.');
}
if (!['gestfac', 'gestor_sincronizacion', 'pago_pendiente'].includes(saved.resultado_etapa_1)) {
  return [{ json: { ...$json, html_response: 'OK' } }];
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const sent = saved.resultado_etapa_1 === 'gestfac' ? saved.escalado_ok === 'Si' : saved.gestor_ok === 'Si';
const target = saved.resultado_etapa_1 === 'gestfac' ? 'GESTFAC' : 'el gestor de sincronización';
const paymentPending = saved.resultado_etapa_1 === 'pago_pendiente';
const message = paymentPending ? 'Si el cliente presenta saldos pendientes de pago, deberá realizar el pago correspondiente para poder continuar con la gestión y contar nuevamente con el servicio.' :
  sent ? 'El caso quedó registrado como enviado a ' + target + '.' :
  'Se registró que no fue posible enviar el caso a ' + target + '. El envío queda pendiente.';
const match = String(saved.handoff_url || '').match(/^(https?:\/\/[^/]+)(\/[^?#]*)?/i);
let initialUrl = '';
if (match) {
  const pathname = match[2] || '';
  const marker = '/webhook/';
  if (pathname.includes(marker)) initialUrl = match[1] + pathname.slice(0, pathname.indexOf(marker)) + marker + 'etb-form-inicial';
}
if (!initialUrl) throw new Error('No se pudo preparar el enlace para iniciar otra gestión.');
const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>ETB - Gestión registrada</title><style>*{box-sizing:border-box}:root{color-scheme:dark}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:18px;background:#071830;color:#f0f6ff;font:16px system-ui,sans-serif}.page{width:min(100%,700px)}.card{padding:clamp(24px,5vw,40px);border:1px solid #1a416d;border-radius:22px;background:#10284a;text-align:center}.icon{display:grid;place-items:center;width:62px;height:62px;border:1px solid #22bb80;border-radius:50%;background:#22bb801a;color:#63e89e;font-size:32px;margin:0 auto 20px}h1{font-size:clamp(26px,5vw,34px);margin:0 0 16px}.copy{color:#b9c8dc;line-height:1.6}.reference{font-size:12px;color:#91a8c6;overflow-wrap:anywhere}.button{display:block;margin-top:24px;padding:17px;border-radius:13px;background:linear-gradient(135deg,#1da1f2,#0d80cc);color:#fff;text-decoration:none;font-weight:700}.footer{font-size:11px;color:#8096b3;text-align:center;margin-top:18px}@media(max-width:480px){body{padding:12px}.card{padding:26px 18px}}</style></head><body><main class="page"><section class="card"><div class="icon" aria-hidden="true">&#10003;</div><h1>' + (sent ? 'Gestión finalizada' : 'Gestión registrada') + '</h1><p class="copy">' + esc(message) + '</p><p class="reference">Referencia: ' + esc(saved.workflow_session) + '</p><a id="newManagementLink" class="button" target="_self" href="' + esc(initialUrl) + '">Iniciar nueva gestión</a></section><p class="footer">© 2026 ETB · Empresa de Telecomunicaciones de Bogotá</p></main></body></html>';
return [{ json: { ...$json, html_response: html } }];
