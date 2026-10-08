// Prueba local: formularios y parámetros reales de los JSON contra PostgreSQL en memoria.
// No reproduce el motor Wait de n8n ni se conecta a producción.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../preview/test-postgres/node_modules/@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const workflows = [0, 1, 2, 3].map(stage => JSON.parse(fs.readFileSync(path.join(root,
  stage ? `Ningun Servicio Funciona - ${stage}.json` : 'Flujo 0 - Registro Inicial.json'), 'utf8')));
const node = (stage, name) => {
  const found = workflows[stage].nodes.find(item => item.name === name);
  assert.ok(found, name);
  return found;
};
const execution = { id: 'recorrido-local', mode: 'production', resumeUrl: 'https://n8n.test/webhook-waiting/local' };
const run = (stage, name, input, prepared) => new Function('$json', '$execution', '$', node(stage, name).parameters.jsCode)
  (input, execution, () => ({ first: () => ({ json: prepared }) }))[0].json;
const decode = text => text.replace(/&(amp|quot|lt|gt|#39);/g, (_, entity) => ({ amp: '&', quot: '"', lt: '<', gt: '>', '#39': "'" })[entity]);
function formData(stage, name, session, answers, selected) {
  const html = run(stage, name, { query: { workflow_session: session, ...answers } }).html_response;
  const data = {};
  for (const match of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) data[decode(match[1])] = decode(match[2]);
  return { ...data, ...selected };
}
async function main() {
  const db = new PGlite();
  let scenarios = 0;
  try {
    await db.exec(fs.readFileSync(path.join(root, 'database/postgres/00_Estructura.sql'), 'utf8'));
    async function queryNode(stage, name, prepared) {
      const current = node(stage, name);
      const expression = current.parameters.options.queryReplacement;
      const params = new Function('$json', '$', 'return ' + expression.slice(3, -2).trim())
        (prepared, () => ({ item: { json: prepared } }));
      return (await db.query(current.parameters.query, params)).rows[0];
    }
    async function initial(session) {
      const validated = run(0, 'Validar Datos Iniciales', { body: {
        workflow_session: session, usuario_asesor: 'asesor-ficticio-trazabilidad', numero_conexion: '000123', pqr: '000456',
      }, webhookUrl: 'https://n8n.test/webhook/etb-form-inicial-guardar' });
      assert.equal(validated.valido, true);
      const prepared = run(0, 'Preparar Registro Inicial SQL', validated);
      const ack = await queryNode(0, 'Guardar Registro Inicial PostgreSQL', prepared);
      assert.ok(run(0, 'Confirmar Registro Inicial', ack, prepared).continue_url.includes(session));
    }
    async function save(stage, data) {
      const names = stage === 1 ? ['Preparar Registro SQL', 'Guardar Respuestas PostgreSQL', 'Confirmar Guardado Etapa 1']
        : [`Preparar Registro Etapa ${stage} SQL`, `Guardar Etapa ${stage} PostgreSQL`, `Confirmar Guardado Etapa ${stage}`];
      const prepared = run(stage, names[0], { query: data });
      const ack = await queryNode(stage, names[1], prepared);
      run(stage, names[2], ack, prepared);
      return prepared;
    }
    async function verify(session, count, result, state) {
      const rows = (await db.query('SELECT * FROM wflow.gestiones_log WHERE workflow_session = $1 ORDER BY numero_etapa', [session])).rows;
      assert.equal(rows.length, count);
      assert.equal(rows.at(-1).resultado, result);
      assert.equal(rows.at(-1).estado_gestion, state);
      for (const row of rows) for (const key of ['usuario_asesor', 'numero_conexion', 'pqr']) {
        assert.equal(row[key], rows[0][key]);
        assert.equal(row.respuestas_json[key], rows[0][key]);
        assert.equal(row.contexto_json[key], rows[0][key]);
      }
      scenarios++;
    }
    const endings1 = [
      ['Form Escalar GESTFAC', { linea_activa: 'No' }, { escalado_ok: 'Si' }, 'gestfac', 'Escalada'],
      ['Form Escalar Gestor', { iccid_valido: 'No' }, { gestor_ok: 'Si' }, 'gestor_sincronizacion', 'Escalada'],
      ...['TransferirDocumentacion', 'GestionarCanalDigital', 'GestionDigitalRealizada'].map(value =>
        ['Form Enviar Doc', { registro_imei_ok: 'No' }, { doc_enviada: value }, null, 'Completada']),
    ];
    for (const [name, answers, selected, expected, state] of endings1) {
      const session = 'f0-recorrido-1-' + scenarios;
      await initial(session);
      const prepared = await save(1, formData(1, name, session, answers, selected));
      await verify(session, 2, expected || prepared.resultado_etapa_1, state);
    }
    const endings2 = [
      ['Form Confirmar Funcionalidad Post QR', { qr_estado: 'Instalado' }, { servicio_post_qr: 'Si' }, 'servicio_normalizado_qr', 'Completada'],
      ['Form Confirmar Funcionalidad Post QR', { qr_estado: 'Menos24' }, { servicio_post_qr: 'Si' }, 'servicio_normalizado_qr', 'Completada'],
      ['Form Escalar Gestor QR', { qr_estado: 'Cumplidas24' }, { gestor_qr_ok: 'Si' }, 'gestor_qr_vencido', 'Escalada'],
      ['Form Escalar Gestor NIP', { linea_portada: 'Si', portacion_completada: 'No', nip_estado: 'Vencido' }, { gestor_nip_ok: 'Si' }, 'gestor_nip_vencido', 'Escalada'],
      ...['Recibido', 'Pendiente'].map(value => ['Form Escalar CRM BAM', { linea_portada: 'Si', portacion_completada: 'No', nip_estado: value },
        { crm_bam_ok: 'Si' }, 'escalado_crm_bam', 'Escalada']),
      ['Form Cierre Sin Recursos', { suma_ok: 'PrepagoSinRecursos' }, { cierre_sin_recursos_ok: 'Si' }, 'no_aplica_sin_recursos', 'Completada'],
    ];
    for (const [name, answers, selected, expected, state] of endings2) {
      const session = 'f0-recorrido-2-' + scenarios;
      await initial(session);
      await save(1, { __workflow_session: session, tipo_sim: 'eSIM' });
      const prepared = await save(2, formData(2, name, session, { tipo_sim: 'eSIM', ...answers }, selected));
      assert.equal(prepared.next_step, 'fin_etapa_2');
      await verify(session, 3, expected, state);
      // Un reintento no duplica la etapa ni pierde la referencia inicial.
      await save(2, formData(2, name, session, { tipo_sim: 'eSIM', ...answers }, selected));
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM wflow.gestiones_log WHERE workflow_session = $1', [session])).rows[0].n, 3);
    }
    const endings3 = [
      ['Form PQR Solucionada Configuracion', 'pqr_configuracion_ok', 'pqr_solucionada_configuracion'],
      ['Form PQR Solucionada Dispositivo', 'pqr_dispositivo_ok', 'pqr_solucionada_falla_dispositivo'],
      ['Form PQR Solucionada Reinicio', 'pqr_reinicio_ok', 'pqr_solucionada_reinicio_sim'],
      ['Form Escalar Segundo Nivel', 'escalamiento_segundo_nivel', 'escalado_segundo_nivel'],
    ];
    for (const suma of ['PospagoConRecursos', 'PrepagoConRecursos']) for (const [name, field, expected] of endings3) {
      const session = 'f0-recorrido-3-' + scenarios;
      await initial(session);
      await save(1, { __workflow_session: session, tipo_sim: 'Fisica' });
      await save(2, { __workflow_session: session, tipo_sim: 'Fisica', suma_ok: suma });
      const prepared = await save(3, formData(3, name, session, { tipo_falla_equipo: 'SMS' }, { [field]: 'Si' }));
      assert.equal(prepared.estado_gestion, 'PendienteCierre');
      const summary = await queryNode(3, 'Consultar Resumen Gestion Actual', { workflow_session: session });
      run(3, 'Verificar Resumen de Sesion', summary, prepared);
      const html = run(3, 'Form Resumen y Observaciones', summary).html_response;
      assert.ok(html.includes('000123') && html.includes('000456'));
      const contracts = require('./postgres_consultas');
      const ack = (await db.query(contracts.observaciones, ['Prueba local de cierre confirmada.', '2026-10-08T12:00:00Z', session])).rows[0];
      run(3, 'Confirmar Observaciones Asesor', ack, { workflow_session: session });
      await verify(session, 4, expected, expected === 'escalado_segundo_nivel' ? 'Escalada' : 'Completada');
    }
    console.log(`RECORRIDOS Y LOG OK: ${scenarios} casos, datos HTML reales, SQL parametrizado de los JSON y snapshots. Solo PostgreSQL local.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
