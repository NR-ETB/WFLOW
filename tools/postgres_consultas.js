// Contrato PostgreSQL compartido por la adaptación y las pruebas de integración.
const inicio = 'SELECT * FROM wflow.registrar_inicio_gestion($1::text,$2::jsonb,$3::text,$4::text)';
const guardar = `INSERT INTO wflow.gestiones_log
(workflow_session, codigo_flujo, nombre_flujo, codigo_etapa, nombre_etapa,
 numero_etapa, numero_intento, execution_id, workflow_version, estado_gestion,
 resultado, next_step, respuestas_json, contexto_json)
VALUES ($1,$2,$3,$4,$5,$6::integer,$7::integer,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
ON CONFLICT (workflow_session, codigo_flujo, codigo_etapa, numero_intento)
DO UPDATE SET execution_id=EXCLUDED.execution_id,
 workflow_version=EXCLUDED.workflow_version, estado_gestion=EXCLUDED.estado_gestion,
 resultado=EXCLUDED.resultado, next_step=EXCLUDED.next_step,
 respuestas_json=EXCLUDED.respuestas_json, contexto_json=EXCLUDED.contexto_json
RETURNING 1 AS registro_confirmado, workflow_session, resultado, next_step`;
const registro = `SELECT COUNT(*)::integer AS coincidencias,
 CASE WHEN COUNT(*) = 1 THEN 'Si' ELSE 'No' END AS registro_inicial_valido,
 MAX(gestion.workflow_session) AS workflow_session
FROM wflow.gestiones AS gestion
WHERE gestion.workflow_session = $1::text COLLATE "C"
 AND EXISTS (SELECT 1 FROM wflow.gestiones_log AS inicial
   WHERE inicial.workflow_session = gestion.workflow_session
     AND inicial.codigo_flujo = 'inicioGestion' AND inicial.codigo_etapa = 'registroInicial'
     AND inicial.resultado = 'datos_iniciales_registrados')`;
const etapa1 = `SELECT
 $1::text AS workflow_session_solicitada,
 $2::text AS transition_mode, $3::text AS handoff_query_json, $4::text AS public_base,
 current_database() AS esquema_credencial, COUNT(*)::integer AS coincidencias,
 CASE WHEN COUNT(*) >= 1 AND NULLIF(TRIM(MAX(respuestas_json->>'tipo_sim')), '') IS NOT NULL
   THEN 'Si' ELSE 'No' END AS contexto_valido,
 CASE WHEN MAX(resultado) = 'continuar_parte_2' AND MAX(next_step) = 'parte_2_tipo_sim'
   THEN 'Si' ELSE 'No' END AS contrato_canonico,
 MAX(workflow_session) AS workflow_session, MAX(respuestas_json->>'tipo_sim') AS tipo_sim,
 MAX(resultado) AS resultado_etapa_1, MAX(next_step) AS next_step
FROM wflow.gestiones_log
WHERE workflow_session = $5
 AND codigo_flujo = 'ningunServicioFunciona' AND codigo_etapa = 'validacionServicio'
 AND EXISTS (SELECT 1 FROM wflow.gestiones AS inicioGestion
   WHERE inicioGestion.workflow_session = wflow.gestiones_log.workflow_session)`;
const etapa2 = `SELECT
 $1::text AS workflow_session_solicitada, current_database() AS esquema_credencial,
 COUNT(*)::integer AS coincidencias,
 CASE WHEN COUNT(*) >= 1 THEN 'Si' ELSE 'No' END AS contexto_valido,
 MAX(workflow_session) AS workflow_session, MAX(respuestas_json->>'tipo_sim') AS tipo_sim,
 MAX(resultado) AS resultado_etapa_2, MAX(next_step) AS next_step,
 MAX(respuestas_json->>'suma_ok') AS suma_ok
FROM wflow.gestiones_log
WHERE workflow_session = $2
 AND codigo_flujo = 'ningunServicioFunciona' AND codigo_etapa = 'diagnosticoSim'
 AND resultado = 'continuar_parte_3' AND next_step = 'parte_3_configuracion_equipo'
 AND respuestas_json->>'suma_ok' IN ('PospagoConRecursos', 'PrepagoConRecursos')
 AND EXISTS (SELECT 1 FROM wflow.gestiones AS inicioGestion
   WHERE inicioGestion.workflow_session = wflow.gestiones_log.workflow_session)`;
const resumen = `SELECT MAX(workflow_session) AS workflow_session,
 MAX(usuario_asesor) AS usuario_asesor, MAX(numero_conexion) AS numero_conexion, MAX(pqr) AS pqr,
 COUNT(*)::integer AS etapas_registradas,
 MAX(CASE WHEN numero_etapa = 1 THEN resultado END) AS resultado_etapa_1,
 MAX(CASE WHEN numero_etapa = 2 THEN resultado END) AS resultado_etapa_2,
 MAX(CASE WHEN numero_etapa = 3 THEN resultado END) AS resultado_etapa_3,
 MAX(CASE WHEN numero_etapa = 1 THEN respuestas_json::text END) AS respuestas_etapa_1_json,
 MAX(CASE WHEN numero_etapa = 2 THEN respuestas_json::text END) AS respuestas_etapa_2_json,
 MAX(CASE WHEN numero_etapa = 3 THEN respuestas_json::text END) AS respuestas_etapa_3_json
FROM wflow.gestiones_log
WHERE workflow_session = $1 AND codigo_flujo = 'ningunServicioFunciona'
GROUP BY workflow_session LIMIT 1`;
const observaciones = `UPDATE wflow.gestiones_log
SET respuestas_json = respuestas_json || jsonb_build_object('observaciones_asesor', $1::text, 'fecha_cierre_asesor', $2::text),
 contexto_json = contexto_json || jsonb_build_object('observaciones_asesor', $1::text, 'fecha_cierre_asesor', $2::text),
 estado_gestion = CASE WHEN resultado = 'escalado_segundo_nivel' THEN 'Escalada' ELSE 'Completada' END,
 next_step = 'fin_flujo'
WHERE workflow_session = $3 AND codigo_flujo = 'ningunServicioFunciona'
 AND codigo_etapa = 'configuracionEquipo' AND numero_intento = 1
RETURNING 1 AS registro_confirmado, workflow_session, resultado, next_step`;
module.exports = { inicio, guardar, registro, etapa1, etapa2, resumen, observaciones };
