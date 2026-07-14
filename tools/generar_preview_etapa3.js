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
  const result = render(
    { id: 'preview-etapa3', mode: 'test', resumeUrl: 'https://n8n.example.test/webhook-waiting/preview-etapa3' },
    { query: { workflow_session: 'preview-session', tipo_sim: 'Fisica', tipo_falla_equipo: 'DatosRed' } },
  );
  const html = result?.[0]?.json?.html_response;
  if (!html) throw new Error(`${node.name} no generó HTML`);
  const file = `${node.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.html`;
  fs.writeFileSync(path.join(outputDir, file), html, 'utf8');
  manifest.push({ name: node.name, file });
}

fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Previews Etapa 3: ${manifest.length}`);
