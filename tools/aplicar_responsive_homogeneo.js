const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'Ningun Servicio Funciona - 1.json',
  'Ningun Servicio Funciona - 2.json',
  'Ningun Servicio Funciona - 3.json',
];

const oversizedDesktop = '@media(min-width:1200px){.card{width:min(100%,1040px);max-width:1040px;padding:48px 52px}.tag{font-size:12px;padding:7px 16px;margin-bottom:20px}.card-title{font-size:40px;margin-bottom:14px}.card-sub{font-size:17px;margin-bottom:28px}.label{font-size:12px;margin-bottom:14px}.radio-group{gap:14px;margin-bottom:28px}.radio label{min-height:64px;font-size:16px}.actions{gap:16px}.btn{height:64px;font-size:18px}.back-icon{width:28px;height:28px;flex-basis:28px;font-size:17px}.footer{font-size:13px}}@media(min-width:1800px) and (min-height:1000px){.card{width:min(100%,1100px);max-width:1100px;padding:52px 58px}.card-title{font-size:43px}.card-sub{font-size:18px}.radio label{min-height:66px}.btn{height:66px}}';
const compactLaptop = '@media(min-width:901px) and (max-height:850px){body{padding:10px}.page{gap:8px;min-height:calc(100svh - 20px)}.card{width:min(100%,720px);max-width:720px;padding:24px 28px;border-radius:18px}.tag{font-size:10px;padding:5px 12px;margin-bottom:10px}.card-title{font-size:28px;margin-bottom:7px}.card-sub{font-size:14px;margin-bottom:14px;line-height:1.45}.label{font-size:10px;margin-bottom:8px}.radio-group{gap:8px;margin-bottom:16px}.radio label{min-height:48px;padding:9px 12px;font-size:13px}.actions{gap:10px}.btn{height:50px;font-size:15px}.back-icon{width:22px;height:22px;flex-basis:22px;font-size:14px}.footer{font-size:11px;padding:3px 0}}';
const wideLandscape = '@media(max-height:620px) and (orientation:landscape){body{align-items:flex-start}.page{justify-content:flex-start}.card{max-width:900px;';
const compactLandscape = '@media(max-height:620px) and (orientation:landscape){body{align-items:flex-start}.page{justify-content:flex-start}.card{max-width:720px;';

for (const file of files) {
  const filePath = path.join(root, file);
  const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let patched = 0;

  for (const node of workflow.nodes || []) {
    if (node.type !== 'n8n-nodes-base.code' || !node.name.startsWith('Form ')) continue;
    let code = String(node.parameters?.jsCode || '');
    if (code.includes(oversizedDesktop)) {
      code = code.replace(oversizedDesktop, compactLaptop);
      patched += 1;
    } else if (!code.includes(compactLaptop)) {
      throw new Error(`${file}: ${node.name} no contiene la base responsive conocida`);
    }
    code = code.replace(wideLandscape, compactLandscape);
    node.parameters.jsCode = code;
  }

  if (file.endsWith('- 1.json')) {
    workflow.versionId = 'v11.9-responsive-homogeneo-20260715';
    for (const node of workflow.nodes || []) {
      if (node.type !== 'n8n-nodes-base.code' || !node.name.startsWith('Form ')) continue;
      node.parameters.jsCode = node.parameters.jsCode.replace(
        /^const cfg = (\{.*\});$/m,
        (line, raw) => {
          const cfg = JSON.parse(raw);
          cfg.rendererVersion = node.name === 'Form Tipo SIM'
            ? 'v11.9-handoff-responsive'
            : 'v11.9-responsive-homogeneo';
          return `const cfg = ${JSON.stringify(cfg)};`;
        },
      );
    }
    const prepare = workflow.nodes.find((node) => node.name === 'Preparar Registro SQL');
    if (prepare?.parameters?.jsCode) {
      prepare.parameters.jsCode = prepare.parameters.jsCode.replace(
        /workflow_version: '[^']+',/,
        "workflow_version: 'v11.9-responsive-homogeneo-20260715',",
      );
    }
  }

  fs.writeFileSync(filePath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
  console.log(`${file}: ${patched} formularios ajustados`);
}
