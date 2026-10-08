const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'Flujo 0 - Registro Inicial.json'), 'utf8'));
const node = workflow.nodes.find(node => node.name === 'Formulario Inicial');
const html = new Function('$json', '$execution', node.parameters.jsCode)(
  { webhookUrl: 'https://n8n.example.test/webhook/etb-form-inicial' },
  { id: 'preview-flujo0' },
)[0].json.html_response;
const output = path.join(root, 'preview', 'flujo0');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'registro-inicial.html'), html);
const confirmation = workflow.nodes.find(node => node.name === 'Confirmar Registro Inicial');
const stored = { registroConfirmado: 1, workflowSession: 'f0-vista-previa', usuarioAsesor: 'asesor.prueba', numeroConexion: '0000123', pqr: 'PQR-PRUEBA' };
const confirmedHtml = new Function('$json', '$execution', '$', confirmation.parameters.jsCode)(
  { data: [[stored]] }, { id: 'vista-previa' },
  () => ({ first: () => ({ json: { workflow_session: stored.workflowSession, webhookUrl: 'https://n8n.example.test/webhook/etb-form-inicial-guardar' } }) }),
)[0].json.html_response;
const stage3 = JSON.parse(fs.readFileSync(path.join(root, 'Ningun Servicio Funciona - 3.json'), 'utf8'));
const summary = stage3.nodes.find(node => node.name === 'Form Resumen y Observaciones');
const summaryHtml = new Function('$json', '$execution', summary.parameters.jsCode)({
  workflow_session: stored.workflowSession, usuario_asesor: stored.usuarioAsesor, numero_conexion: stored.numeroConexion, pqr: stored.pqr,
  resultado_etapa_1: 'continuar_parte_2', resultado_etapa_2: 'continuar_parte_3', resultado_etapa_3: 'pqr_solucionada_configuracion',
  respuestas_etapa_1_json: JSON.stringify({ tipo_sim: 'eSIM', linea_activa: 'Si', pago_al_dia: 'Si' }),
  respuestas_etapa_2_json: JSON.stringify({ suma_ok: 'PospagoConRecursos' }),
  respuestas_etapa_3_json: JSON.stringify({ tipo_falla_equipo: 'DatosRed', configuracion_funciono: 'Si' }),
}, { resumeUrl: 'https://n8n.example.test/webhook-waiting/vista-previa' })[0].json.html_response;
const screens = [['registro-inicial', html], ['registro-confirmado', confirmedHtml], ['resumen-gestion', summaryHtml]];
async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PREVIEW_BROWSER_CHANNEL ? { channel: process.env.PREVIEW_BROWSER_CHANNEL } : {}) });
  try {
    for (const [screen, screenHtml] of screens) {
      fs.writeFileSync(path.join(output, screen + '.html'), screenHtml);
      for (const [name, width, height] of [['escritorio', 1366, 768], ['movil', 375, 812]]) {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.setContent(screenHtml);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (overflow) throw new Error('Desbordamiento horizontal en ' + name);
        await page.screenshot({ path: path.join(output, screen + '-' + name + '.png'), fullPage: true });
        await page.close();
      }
    }
  } finally { await browser.close(); }
  console.log('Tres pantallas verificadas en preview/flujo0 para escritorio y móvil, sin desbordamiento horizontal.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
