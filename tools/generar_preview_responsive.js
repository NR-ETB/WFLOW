const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, 'Ningun Servicio Funciona - 1.json');
const previewDir = path.join(root, 'preview');
const previewPath = path.join(previewDir, 'v11.7-auditada-responsive.html');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
fs.mkdirSync(previewDir, { recursive: true });
const formsDir = path.join(previewDir, 'v11.7-forms');
fs.mkdirSync(formsDir, { recursive: true });

const forms = workflow.nodes.filter((item) => item.type === 'n8n-nodes-base.code' && item.name.startsWith('Form '));
const generated = [];
for (const node of forms) {
  const render = new Function('$execution', '$json', node.parameters.jsCode);
  const result = render(
    {
      id: 'responsive-preview',
      mode: 'test',
      resumeUrl: 'https://n8n.example.test/webhook-waiting/responsive-preview',
    },
    {
      query: {
        __workflow_session: 'responsive-preview-session',
        linea_activa: 'Si',
        pago_al_dia: 'Si',
        iccid_valido: 'Si',
      },
    },
  );
  const html = result?.[0]?.json?.html_response;
  if (!html) throw new Error(`${node.name} no produjo HTML`);
  const slug = node.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const target = path.join(formsDir, `${slug}.html`);
  fs.writeFileSync(target, html, 'utf8');
  generated.push({ name: node.name, file: `v11.7-forms/${slug}.html` });
  if (node.name === 'Form Confirmar Pago') fs.writeFileSync(previewPath, html, 'utf8');
}

fs.writeFileSync(path.join(formsDir, 'manifest.json'), `${JSON.stringify(generated, null, 2)}\n`, 'utf8');
console.log(`Previews generados: ${generated.length} formularios`);
console.log(`Preview principal: ${previewPath}`);
