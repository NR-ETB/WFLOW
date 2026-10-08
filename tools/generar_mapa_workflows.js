// Vista local de mantenimiento; no emula la ejecución ni el renderer de n8n.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'preview', 'workflows');
fs.mkdirSync(output, { recursive: true });
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors = { 2:'#2b1b13', 3:'#143524', 4:'#45212b', 5:'#123149', 6:'#302155', 7:'#32343c' };
const cards = [];
for (let stage = 0; stage <= 3; stage++) {
  const file = stage === 0 ? 'Flujo 0 - Registro Inicial.json' : `Ningun Servicio Funciona - ${stage}.json`;
  const workflow = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const notes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.stickyNote');
  const nodes = workflow.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');
  const byName = new Map(nodes.map(n => [n.name, n]));
  const width = Math.max(...notes.map(n => n.position[0] + n.parameters.width)) + 40;
  const height = Math.max(...notes.map(n => n.position[1] + n.parameters.height)) + 40;
  const boxes = notes.map(n => `<g><rect x="${n.position[0]}" y="${n.position[1]}" width="${n.parameters.width}" height="${n.parameters.height}" rx="18" fill="${colors[n.parameters.color]}" stroke="#7598b455"/><foreignObject x="${n.position[0]+25}" y="${n.position[1]+10}" width="${n.parameters.width-50}" height="275"><div xmlns="http://www.w3.org/1999/xhtml" style="font:17px system-ui;color:#edf5ff;line-height:1.5;white-space:pre-line">${esc(n.parameters.content.replace(/^## /,'').replaceAll('**',''))}</div></foreignObject></g>`).join('');
  const edges = Object.entries(workflow.connections).flatMap(([from, output]) => output.main.flatMap((branch, branchIndex) => branch.map(edge => {
    const a = byName.get(from), b = byName.get(edge.node);
    if (!a || !b) return '';
    const x1=a.position[0]+230,y1=a.position[1]+40,x2=b.position[0],y2=b.position[1]+40;
    const c=Math.max(100,Math.abs(x2-x1)/3);
    return `<path d="M${x1},${y1} C${x1+c},${y1} ${x2-c},${y2} ${x2},${y2}" fill="none" stroke="${branchIndex ? '#ff9f7188':'#8ecbf888'}" stroke-width="2" marker-end="url(#arrow)"/>`;
  }))).join('');
  const items = nodes.map(n => `<g><rect x="${n.position[0]}" y="${n.position[1]}" width="230" height="82" rx="12" fill="#0c1426" stroke="${n.type.includes('postgres')?'#45cf97':'#667e98'}"/><foreignObject x="${n.position[0]+10}" y="${n.position[1]+10}" width="210" height="64"><div xmlns="http://www.w3.org/1999/xhtml" style="font:15px system-ui;color:#f0f6ff;line-height:1.3">${esc(n.name)}<br/><small style="color:#91a6be">${esc(n.type.replace('n8n-nodes-base.',''))}</small></div></foreignObject></g>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${width+20} ${height+20}" style="width:100%;height:auto;background:#070e18"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#8ecbf8"/></marker></defs>${boxes}${edges}${items}</svg>`;
  fs.writeFileSync(path.join(output, `flujo-${stage}.svg`), svg);
  cards.push(`<section><h2>${esc(workflow.name)}</h2><p>${notes.length} bloques · ${nodes.length} nodos. Amplía el mapa para revisar nombres y conexiones.</p><a href="flujo-${stage}.svg" target="_blank">Abrir mapa completo</a>${svg}</section>`);
}
fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WFLOW · Organización de workflows</title><style>body{font:16px system-ui;margin:0;padding:24px;background:#070e18;color:#e7f2ff}h1{margin:0}section{margin:24px 0;border:1px solid #34455c;padding:16px;border-radius:16px}p{color:#98b1cc}a{display:block;margin-bottom:16px;color:#58c8ff}svg{margin-top:8px}</style><h1>WFLOW · PostgreSQL / CRM_N8N</h1><p>Vista local de mantenimiento. No es una captura del canvas n8n ni una prueba de ejecución.</p>${cards.join('')}</html>`);
console.log(path.join(output,'index.html'));
