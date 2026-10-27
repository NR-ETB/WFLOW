// Verifica las pantallas reales sin llamar al servidor ni escribir en la base.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const load = stage => JSON.parse(fs.readFileSync(path.join(root, stage ?
  `Ningun Servicio Funciona - ${stage}.json` : 'Flujo 0 - Registro Inicial.json'), 'utf8'));
let cases = 0;
for (let stage = 1; stage <= 3; stage++) {
  const workflow = load(stage);
  for (const node of workflow.nodes.filter(n => n.parameters.jsCode?.includes('function showCompletion()'))) {
    for (const mode of ['test', 'production']) {
      const execution = { id: 'gestion-anterior', mode,
        resumeUrl: 'https://n8n.example.test/prefix/webhook-waiting/anterior?workflow_session=f0-anterior#old' };
      const html = new Function('$json', '$execution', node.parameters.jsCode)({
        query: { workflow_session: 'f0-anterior', tipo_sim: 'eSIM' },
        webhookUrl: 'https://n8n.example.test/prefix/webhook/etb-form-parte-2-continuar',
      }, execution)[0].json.html_response;
      assert.ok(!html.includes('Test workflow'));
      assert.ok(!html.includes('Modo de prueba'));
      const client = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(c => c.includes('function showCompletion()'));
      const functionCode = client.slice(client.indexOf('function showCompletion()'), client.indexOf('var cfgFinishToStart='));
      const initialUrl = JSON.parse(client.match(/var initialUrl=("[^"]*");/)[1]);
      let link;
      const card = { innerHTML: '', querySelector: () => ({ appendChild(value) { link = value; } }) };
      vm.runInNewContext(functionCode + 'showCompletion();', { initialUrl,
        document: { querySelector: () => card, createElement: () => ({ style: {}, children: [], appendChild(child) { this.children.push(child); } }) } });
      assert.equal(link.children[0].textContent, 'Iniciar nueva gestión');
      assert.equal(link.method, 'get');
      assert.equal(link.action, 'https://n8n.example.test/prefix/webhook/etb-form-inicial');
      assert.equal(link.target, '_self');
      assert.equal(new URL(link.action).search, '');
      assert.equal(new URL(link.action).hash, '');
      assert.ok(!card.innerHTML.includes('cerrar esta ventana'));
      cases++;
    }
  }
}
const final = load(3).nodes.find(n => n.name === 'HTML Cierre Definitivo');
const finalHtml = new Function('$', '$execution', final.parameters.jsCode)(name => ({ item: { json:
  name === 'Consultar Resumen Gestion Actual' ? { resultado_etapa_3: 'escalado_segundo_nivel' } :
    { workflow_session: 'f0-anterior', observaciones_asesor: 'Se escaló para revisión técnica.' } } }),
  { resumeUrl: 'https://n8n.example.test/prefix/webhook-waiting/ultimo' })[0].json.html_response;
assert.ok(finalHtml.includes('action="https://n8n.example.test/prefix/webhook/etb-form-inicial"'));
assert.ok(finalHtml.includes('target="_self"'));
assert.ok(finalHtml.includes('Se escaló para revisión técnica.'));
const initial = load(0).nodes.find(n => n.name === 'Formulario Inicial');
const renderInitial = id => new Function('$json', '$execution', initial.parameters.jsCode)(
  { webhookUrl: 'https://n8n.example.test/prefix/webhook/etb-form-inicial' }, { id })[0].json.html_response;
const a = renderInitial('atencion-1');
const b = renderInitial('atencion-2');
assert.ok(a.includes('value="f0-atencion-1"'));
assert.ok(b.includes('value="f0-atencion-2"'));
assert.ok(!b.includes('f0-atencion-1'));
for (const field of ['usuario_asesor', 'numero_conexion', 'pqr']) {
  assert.match(b, new RegExp('id="' + field + '"[^>]*value=""'));
}
console.log(`NUEVA GESTIÓN OK: ${cases} cierres en prueba/producción, cierre con observaciones, misma pestaña y sesiones nuevas.`);
