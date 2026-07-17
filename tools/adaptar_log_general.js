const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'Ningun Servicio Funciona - 1.json',
  'Ningun Servicio Funciona - 2.json',
  'Ningun Servicio Funciona - 3.json',
];

const load = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const save = (file, workflow) => {
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
};
const node = (workflow, name) => {
  const found = workflow.nodes.find((item) => item.name === name);
  if (!found) throw new Error(`No existe el nodo: ${name}`);
  return found;
};

const insertGenericFields = (code, stage) => {
  if (code.includes("codigo_flujo: 'ningunServicioFunciona'")) return code;
  const marker = 'return [{ json: {';
  if (!code.includes(marker)) throw new Error(`No se encontro retorno en ${stage.code}`);
  const statusCode = stage.status;
  const contextCode = `const context = Object.fromEntries(Object.entries(source).filter(([key, current]) =>
  current !== undefined && current !== '' && !['__back'].includes(key)
));
const estadoGestion = ${statusCode};
`;
  const fields = `return [{ json: {
  codigo_flujo: 'ningunServicioFunciona',
  nombre_flujo: 'Ningun servicio funciona',
  codigo_etapa: '${stage.code}',
  nombre_etapa: '${stage.name}',
  numero_etapa: ${stage.number},
  numero_intento: 1,
  estado_gestion: estadoGestion,
  contexto_json: JSON.stringify(context),`;
  return code.replace(marker, contextCode + fields);
};

const genericInsert = `INSERT INTO CRM.GestionesFlujosLog
(workflowSession, codigoFlujo, nombreFlujo, codigoEtapa, nombreEtapa,
 numeroEtapa, numeroIntento, executionId, workflowVersion, estadoGestion,
 resultado, nextStep, respuestasJson, contextoJson)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS nuevo
ON DUPLICATE KEY UPDATE
 executionId=nuevo.executionId,
 workflowVersion=nuevo.workflowVersion,
 estadoGestion=nuevo.estadoGestion,
 resultado=nuevo.resultado,
 nextStep=nuevo.nextStep,
 respuestasJson=nuevo.respuestasJson,
 contextoJson=nuevo.contextoJson,
 updatedAt=CURRENT_TIMESTAMP(3)`;

const genericReplacement = (resultField) =>
  `={{ [ $json.workflow_session, $json.codigo_flujo, $json.nombre_flujo, $json.codigo_etapa, $json.nombre_etapa, $json.numero_etapa, $json.numero_intento, $json.execution_id, $json.workflow_version, $json.estado_gestion, $json.${resultField}, $json.next_step, $json.respuestas_json, $json.contexto_json ] }}`;

const w1 = load(files[0]);
node(w1, 'Preparar Registro SQL').parameters.jsCode = insertGenericFields(
  node(w1, 'Preparar Registro SQL').parameters.jsCode,
  {
    code: 'validacionServicio',
    name: 'Validacion de linea, pagos, ICCID e IMEI',
    number: 1,
    status: "outcome === 'continuar_parte_2' ? 'EnCurso' : (['gestfac','gestor_sincronizacion'].includes(outcome) ? 'Escalada' : 'Completada')",
  },
);
const save1 = node(w1, 'Guardar Respuestas MySQL');
save1.parameters.query = genericInsert;
save1.parameters.options.queryReplacement = genericReplacement('resultado_etapa_1');
save(files[0], w1);

const w2 = load(files[1]);
const lookup2 = node(w2, 'Consultar Contexto Etapa 1 MySQL');
lookup2.parameters.query = `SELECT
 $1 AS workflow_session_solicitada,
 $2 AS transition_mode,
 $3 AS handoff_query_json,
 $4 AS public_base,
 DATABASE() AS esquema_credencial,
 COUNT(*) AS coincidencias,
 IF(COUNT(*) >= 1 AND MAX(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.tipo_sim'))) IS NOT NULL AND TRIM(MAX(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.tipo_sim')))) <> '', 'Si', 'No') AS contexto_valido,
 IF(MAX(resultado) = 'continuar_parte_2' AND MAX(nextStep) = 'parte_2_tipo_sim', 'Si', 'No') AS contrato_canonico,
 MAX(workflowSession) AS workflow_session,
 MAX(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.tipo_sim'))) AS tipo_sim,
 MAX(resultado) AS resultado_etapa_1,
 MAX(nextStep) AS next_step
FROM CRM.GestionesFlujosLog
WHERE workflowSession = $5
  AND codigoFlujo = 'ningunServicioFunciona'
  AND codigoEtapa = 'validacionServicio'`;
node(w2, 'Preparar Registro Etapa 2 SQL').parameters.jsCode = insertGenericFields(
  node(w2, 'Preparar Registro Etapa 2 SQL').parameters.jsCode,
  {
    code: 'diagnosticoSim',
    name: 'Diagnostico de SIM, QR, portacion y SUMA',
    number: 2,
    status: "outcome === 'continuar_parte_3' ? 'EnCurso' : (outcome === 'espera_nip' ? 'EnEspera' : (['gestor_nip_vencido','gestor_sincronizacion_suma'].includes(outcome) ? 'Escalada' : 'Completada'))",
  },
);
const save2 = node(w2, 'Guardar Etapa 2 MySQL');
save2.parameters.query = genericInsert;
save2.parameters.options.queryReplacement = genericReplacement('resultado_etapa_2');
for (const current of w2.nodes) {
  if (current.parameters?.jsCode) {
    current.parameters.jsCode = current.parameters.jsCode
      .replaceAll('CRM.n8n_nsf_respuestas', 'CRM.GestionesFlujosLog')
      .replaceAll('CRM.n8n_nsf_etapa2', 'CRM.GestionesFlujosLog');
  }
  if (typeof current.parameters?.content === 'string') {
    current.parameters.content = current.parameters.content
      .replaceAll('CRM.n8n_nsf_respuestas', 'CRM.GestionesFlujosLog')
      .replaceAll('CRM.n8n_nsf_etapa2', 'CRM.GestionesFlujosLog');
  }
}
save(files[1], w2);

const w3 = load(files[2]);
const lookup3 = node(w3, 'Consultar Contexto Etapa 2 MySQL');
lookup3.parameters.query = `SELECT
 $1 AS workflow_session_solicitada,
 DATABASE() AS esquema_credencial,
 COUNT(*) AS coincidencias,
 IF(COUNT(*) >= 1, 'Si', 'No') AS contexto_valido,
 MAX(workflowSession) AS workflow_session,
 MAX(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.tipo_sim'))) AS tipo_sim,
 MAX(resultado) AS resultado_etapa_2,
 MAX(nextStep) AS next_step,
 MAX(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.suma_ok'))) AS suma_ok
FROM CRM.GestionesFlujosLog
WHERE workflowSession = $2
  AND codigoFlujo = 'ningunServicioFunciona'
  AND codigoEtapa = 'diagnosticoSim'
  AND resultado = 'continuar_parte_3'
  AND nextStep = 'parte_3_configuracion_equipo'
  AND JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.suma_ok')) = 'Si'`;
node(w3, 'Preparar Registro Etapa 3 SQL').parameters.jsCode = insertGenericFields(
  node(w3, 'Preparar Registro Etapa 3 SQL').parameters.jsCode,
  {
    code: 'configuracionEquipo',
    name: 'Configuracion, prueba cruzada y segundo nivel',
    number: 3,
    status: "'PendienteCierre'",
  },
);
const save3 = node(w3, 'Guardar Etapa 3 MySQL');
save3.parameters.query = genericInsert;
save3.parameters.options.queryReplacement = genericReplacement('resultado_etapa_3');
for (const current of w3.nodes) {
  if (current.parameters?.jsCode) {
    current.parameters.jsCode = current.parameters.jsCode
      .replaceAll('CRM.n8n_nsf_etapa2', 'CRM.GestionesFlujosLog')
      .replaceAll('CRM.n8n_nsf_etapa3', 'CRM.GestionesFlujosLog');
  }
  if (typeof current.parameters?.content === 'string') {
    current.parameters.content = current.parameters.content
      .replaceAll('CRM.n8n_nsf_etapa2', 'CRM.GestionesFlujosLog')
      .replaceAll('CRM.n8n_nsf_etapa3', 'CRM.GestionesFlujosLog');
  }
}
save(files[2], w3);

console.log('Tres workflows adaptados a CRM.GestionesFlujosLog');
