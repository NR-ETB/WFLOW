-- Actualización limitada para una base que ya tiene 00_Estructura.sql instalado.
-- Conectar explícitamente a CRM_N8N. No cambia tablas ni datos existentes.
BEGIN;
CREATE OR REPLACE FUNCTION wflow.registrar_inicio_gestion(
    p_session text, p_datos jsonb, p_execution_id text, p_version text
) RETURNS TABLE ("registroConfirmado" integer, "workflowSession" text,
    "usuarioAsesor" text, "numeroConexion" text, pqr text)
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE inicio wflow.gestiones%ROWTYPE; campo text; valor text; datos jsonb;
BEGIN
    IF p_session IS NULL OR btrim(p_session) = '' OR length(p_session) > 100
       OR p_session ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION 'Referencia de gestión inválida' USING ERRCODE = '22023';
    END IF;
    IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
        RAISE EXCEPTION 'Los datos iniciales deben ser un objeto JSON' USING ERRCODE = '22023';
    END IF;
    FOREACH campo IN ARRAY ARRAY['usuario_asesor', 'numero_conexion', 'pqr'] LOOP
        valor := p_datos ->> campo;
        IF jsonb_typeof(p_datos -> campo) IS DISTINCT FROM 'string'
           OR btrim(valor) = '' OR length(valor) > 100 OR valor ~ '[[:cntrl:]]' THEN
            RAISE EXCEPTION 'Dato inicial inválido: %', campo USING ERRCODE = '22023';
        END IF;
    END LOOP;
    INSERT INTO wflow.gestiones AS gestion (workflow_session, usuario_asesor, numero_conexion, pqr)
    VALUES (p_session, btrim(p_datos->>'usuario_asesor'), btrim(p_datos->>'numero_conexion'), btrim(p_datos->>'pqr'))
    ON CONFLICT (workflow_session) DO NOTHING;
    -- Recuperar la referencia permite confirmar también un reintento sin UPDATE.
    SELECT * INTO STRICT inicio FROM wflow.gestiones WHERE workflow_session = p_session;
    datos := jsonb_build_object('usuario_asesor', inicio.usuario_asesor,
        'numero_conexion', inicio.numero_conexion, 'pqr', inicio.pqr);
    INSERT INTO wflow.gestiones_log
      (workflow_session, codigo_flujo, nombre_flujo, codigo_etapa, nombre_etapa,
       numero_etapa, numero_intento, execution_id, workflow_version, estado_gestion,
       resultado, next_step, respuestas_json, contexto_json)
    VALUES (inicio.workflow_session, 'inicioGestion', 'Inicio de gestion', 'registroInicial',
       'Datos iniciales del asesor y la atencion', 0, 1, p_execution_id, p_version,
       'Completada', 'datos_iniciales_registrados', 'fin_flujo_0', datos, datos)
    ON CONFLICT (workflow_session, codigo_flujo, codigo_etapa, numero_intento)
    DO NOTHING;
    RETURN QUERY SELECT 1, inicio.workflow_session::text, inicio.usuario_asesor::text,
        inicio.numero_conexion::text, inicio.pqr::text;
END $$;
REVOKE ALL ON FUNCTION wflow.registrar_inicio_gestion(text, jsonb, text, text) FROM PUBLIC;
COMMIT;
