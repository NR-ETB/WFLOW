-- Solo lectura. Ejecutar en CRM_N8N después de instalar y probar los cuatro flujos.
SELECT current_database() AS base, current_user AS usuario, version() AS motor;
SELECT * FROM wflow.vw_gestiones_resumen ORDER BY ultima_actualizacion DESC LIMIT 50;
SELECT * FROM wflow.vw_nsf_resumen ORDER BY ultima_actualizacion DESC LIMIT 50;

-- Los siguientes conteos deben ser cero para las gestiones nuevas.
SELECT COUNT(*) AS cabeceras_sin_log_inicial
FROM wflow.gestiones g WHERE NOT EXISTS (
  SELECT 1 FROM wflow.gestiones_log l WHERE l.workflow_session = g.workflow_session
    AND l.codigo_flujo = 'inicioGestion' AND l.codigo_etapa = 'registroInicial');
SELECT COUNT(*) AS copias_inconsistentes
FROM wflow.gestiones_log l JOIN wflow.gestiones g USING (workflow_session)
WHERE (l.usuario_asesor, l.numero_conexion, l.pqr)
      IS DISTINCT FROM (g.usuario_asesor, g.numero_conexion, g.pqr)
 OR (l.respuestas_json->>'usuario_asesor', l.respuestas_json->>'numero_conexion', l.respuestas_json->>'pqr')
      IS DISTINCT FROM (g.usuario_asesor, g.numero_conexion, g.pqr)
 OR (l.contexto_json->>'usuario_asesor', l.contexto_json->>'numero_conexion', l.contexto_json->>'pqr')
      IS DISTINCT FROM (g.usuario_asesor, g.numero_conexion, g.pqr);

-- Reemplazar únicamente la referencia de ejemplo; no incluir datos personales.
SELECT * FROM wflow.vw_gestiones_trazabilidad
WHERE workflow_session = 'PEGA_AQUI_LA_SESION'
ORDER BY numero_etapa, numero_intento, created_at;
