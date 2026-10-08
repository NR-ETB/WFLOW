-- Ejecutar con la misma cuenta/credencial utilizada por los nodos Postgres de n8n.
-- No modifica datos y no muestra usuario del asesor, conexión ni PQR.
BEGIN READ ONLY;
SELECT current_database() AS base, current_database() = 'CRM_N8N' AS base_correcta,
       current_user AS cuenta_conexion, version() AS motor;

SELECT nombre, to_regclass(nombre) IS NOT NULL AS existe
FROM (VALUES ('wflow.gestiones'), ('wflow.gestiones_log'),
  ('wflow.vw_gestiones_trazabilidad'), ('wflow.vw_gestiones_resumen'),
  ('wflow.vw_nsf_trazabilidad'), ('wflow.vw_nsf_resumen')) AS esperado(nombre);

WITH funcion AS (
  SELECT regexp_replace(pg_get_functiondef(
    'wflow.registrar_inicio_gestion(text,jsonb,text,text)'::regprocedure),
    '--[^\n]*', '', 'g') AS codigo
)
SELECT codigo ~* 'INSERT INTO wflow.gestiones AS gestion' AS inserta_cabecera,
       codigo ~* 'INSERT INTO wflow.gestiones_log' AS inserta_log,
       codigo !~* '\mUPDATE\M|\mDELETE\M' AS inicio_sin_actualizaciones,
       has_function_privilege(current_user,
         'wflow.registrar_inicio_gestion(text,jsonb,text,text)', 'EXECUTE') AS puede_registrar_inicio
FROM funcion;

SELECT tabla, has_table_privilege(current_user, tabla, 'SELECT') AS puede_leer,
       has_table_privilege(current_user, tabla, 'INSERT') AS puede_insertar,
       has_table_privilege(current_user, tabla, 'UPDATE') AS puede_actualizar_etapas
FROM (VALUES ('wflow.gestiones'), ('wflow.gestiones_log')) AS tablas(tabla);
SELECT pg_get_serial_sequence(tabla, 'id') AS secuencia,
       has_sequence_privilege(current_user, pg_get_serial_sequence(tabla, 'id'), 'USAGE') AS puede_usar
FROM (VALUES ('wflow.gestiones'), ('wflow.gestiones_log')) AS tablas(tabla);

SELECT t.tgname AS trigger, c.relname AS tabla,
       t.tgenabled IN ('O', 'A') AS habilitado
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'wflow' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- Los tres conteos deben ser cero.
SELECT COUNT(*) AS cabeceras_sin_inicio_confirmado
FROM wflow.gestiones g WHERE NOT EXISTS (
  SELECT 1 FROM wflow.gestiones_log l WHERE l.workflow_session = g.workflow_session
    AND l.codigo_flujo = 'inicioGestion' AND l.codigo_etapa = 'registroInicial'
    AND l.numero_etapa = 0 AND l.resultado = 'datos_iniciales_registrados');
SELECT COUNT(*) AS logs_sin_cabecera
FROM wflow.gestiones_log l LEFT JOIN wflow.gestiones g USING (workflow_session)
WHERE g.id IS NULL;
SELECT COUNT(*) AS copias_inconsistentes
FROM wflow.gestiones_log l JOIN wflow.gestiones g USING (workflow_session)
WHERE (l.usuario_asesor, l.numero_conexion, l.pqr)
      IS DISTINCT FROM (g.usuario_asesor, g.numero_conexion, g.pqr)
 OR (l.respuestas_json->>'usuario_asesor', l.respuestas_json->>'numero_conexion', l.respuestas_json->>'pqr')
      IS DISTINCT FROM (g.usuario_asesor, g.numero_conexion, g.pqr)
 OR (l.contexto_json->>'usuario_asesor', l.contexto_json->>'numero_conexion', l.contexto_json->>'pqr')
      IS DISTINCT FROM (g.usuario_asesor, g.numero_conexion, g.pqr);
COMMIT;
