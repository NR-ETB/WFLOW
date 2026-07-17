const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'Ningun Servicio Funciona - 3.json'), 'utf8'));
const outputDir = path.join(root, 'preview', 'etapa3-v1');
fs.mkdirSync(outputDir, { recursive: true });

const forms = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code' && node.name.startsWith('Form '));
const manifest = [];
for (const node of forms) {
  const render = new Function('$execution', '$json', node.parameters.jsCode);
  const sample = node.name === 'Form Resumen y Observaciones'
    ? {
      workflow_session: 'preview-session',
      resultado_etapa_1: 'continuar_parte_2',
      resultado_etapa_2: 'continuar_parte_3',
      resultado_etapa_3: 'pqr_solucionada_configuracion',
      respuestas_etapa_1_json: JSON.stringify({ tipo_sim: 'eSIM', linea_activa: 'Si', pago_al_dia: 'Si', iccid_valido: 'Si' }),
      respuestas_etapa_2_json: JSON.stringify({ qr_escaneo_ok: 'Si', linea_portada: 'Si', portacion_completada: 'Si', suma_ok: 'Si' }),
      respuestas_etapa_3_json: JSON.stringify({ tipo_falla_equipo: 'DatosRed', tipo_equipo_cliente: 'Android', configuracion_funciono: 'Si' }),
    }
    : { query: { workflow_session: 'preview-session', tipo_sim: 'Fisica', tipo_falla_equipo: 'DatosRed' } };
  const result = render(
    { id: 'preview-etapa3', mode: 'test', resumeUrl: 'https://n8n.example.test/webhook-waiting/preview-etapa3' },
    sample,
  );
  const html = result?.[0]?.json?.html_response;
  if (!html) throw new Error(`${node.name} no generó HTML`);
  const file = `${node.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.html`;
  fs.writeFileSync(path.join(outputDir, file), html, 'utf8');
  manifest.push({ name: node.name, file });
}

fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Previews Etapa 3: ${manifest.length}`);
