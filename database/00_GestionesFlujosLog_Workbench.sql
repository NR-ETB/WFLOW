-- ============================================================================
-- LOG GENERAL DE FLUJOS GUIADOS
-- Convierte la tabla existente sin borrar sus registros.
-- Ejecutar UNA sola vez en MySQL Workbench antes de importar los JSON nuevos.
-- MySQL 8.4+
-- ============================================================================

USE CRM;

SET @sqlSafeUpdatesAnterior = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

-- 1. Prevalidacion: la tabla de origen debe existir y la de destino no.
SELECT
    TABLE_NAME AS tablaEncontrada,
    TABLE_ROWS AS filasEstimadas
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('n8n_nsf_respuestas', 'GestionesFlujosLog');

-- 2. Es la misma tabla existente, solamente recibe un nombre general.
RENAME TABLE CRM.n8n_nsf_respuestas TO CRM.GestionesFlujosLog;

-- 3. Los campos comunes se renombran en CamelCase sin cambiar sus datos/tipos.
ALTER TABLE CRM.GestionesFlujosLog
    RENAME COLUMN workflow_session TO workflowSession,
    RENAME COLUMN execution_id TO executionId,
    RENAME COLUMN workflow_version TO workflowVersion,
    RENAME COLUMN resultado_etapa_1 TO resultado,
    RENAME COLUMN next_step TO nextStep,
    RENAME COLUMN respuestas_json TO respuestasJson,
    RENAME COLUMN created_at TO createdAt,
    RENAME COLUMN updated_at TO updatedAt;

-- 4. Se agregan solo los campos generales necesarios para cualquier flujo.
ALTER TABLE CRM.GestionesFlujosLog
    ADD COLUMN codigoFlujo VARCHAR(100) NULL AFTER workflowSession,
    ADD COLUMN nombreFlujo VARCHAR(180) NULL AFTER codigoFlujo,
    ADD COLUMN codigoEtapa VARCHAR(100) NULL AFTER nombreFlujo,
    ADD COLUMN nombreEtapa VARCHAR(180) NULL AFTER codigoEtapa,
    ADD COLUMN numeroEtapa INT UNSIGNED NULL AFTER nombreEtapa,
    ADD COLUMN numeroIntento INT UNSIGNED NOT NULL DEFAULT 1 AFTER numeroEtapa,
    ADD COLUMN estadoGestion VARCHAR(32) NULL AFTER nextStep,
    ADD COLUMN contextoJson JSON NULL AFTER respuestasJson,
    ADD COLUMN errorJson JSON NULL AFTER contextoJson;

-- 5. Las columnas especificas antiguas quedan opcionales. Se conservan como
-- respaldo historico, pero los nuevos workflows ya no las utilizaran.
SET SESSION group_concat_max_len = 100000;

SELECT GROUP_CONCAT(
    CONCAT(
        'MODIFY COLUMN `', COLUMN_NAME, '` ', COLUMN_TYPE,
        ' NULL DEFAULT NULL'
    )
    ORDER BY ORDINAL_POSITION
    SEPARATOR ', '
)
INTO @columnasLegacyOpcionales
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'GestionesFlujosLog'
  AND COLUMN_NAME IN (
      'linea_activa', 'pago_al_dia', 'escalado_ok', 'iccid_valido',
      'iccid_confirmado', 'gestor_ok', 'imei_suma_validado',
      'registro_imei_ok', 'proceso_ok', 'bloqueado', 'doc_enviada',
      'tipo_sim'
  );

SET @sqlLegacyOpcional = IF(
    @columnasLegacyOpcionales IS NULL OR @columnasLegacyOpcionales = '',
    'SELECT ''No hay columnas legacy que ajustar'' AS resultado',
    CONCAT('ALTER TABLE CRM.GestionesFlujosLog ', @columnasLegacyOpcionales)
);

PREPARE stmtLegacyOpcional FROM @sqlLegacyOpcional;
EXECUTE stmtLegacyOpcional;
DEALLOCATE PREPARE stmtLegacyOpcional;

-- Si quedó una tabla legacy de etapa 2 con FK hacia la tabla original, se
-- retira solo esa relación antes de cambiar la unicidad. No se borra la tabla
-- ni sus filas. En la estructura mostrada actualmente este bloque es un no-op.
SET @sqlEliminarFkLegacy = (
    SELECT CONCAT(
        'ALTER TABLE `', CONSTRAINT_SCHEMA, '`.`', TABLE_NAME,
        '` DROP FOREIGN KEY `', CONSTRAINT_NAME, '`'
    )
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'GestionesFlujosLog'
    ORDER BY TABLE_NAME, CONSTRAINT_NAME
    LIMIT 1
);

SET @sqlEliminarFkLegacy = COALESCE(
    @sqlEliminarFkLegacy,
    'SELECT ''No hay FK legacy que retirar'' AS resultado'
);

PREPARE stmtEliminarFkLegacy FROM @sqlEliminarFkLegacy;
EXECUTE stmtEliminarFkLegacy;
DEALLOCATE PREPARE stmtEliminarFkLegacy;

-- 6. Los registros existentes pasan a ser la etapa 1 del flujo NSF.
UPDATE CRM.GestionesFlujosLog
SET
    codigoFlujo = 'ningunServicioFunciona',
    nombreFlujo = 'Ningun servicio funciona',
    codigoEtapa = 'validacionServicio',
    nombreEtapa = 'Validacion de linea, pagos, ICCID e IMEI',
    numeroEtapa = 1,
    numeroIntento = 1,
    estadoGestion = CASE
        WHEN resultado = 'continuar_parte_2' THEN 'EnCurso'
        WHEN resultado IN ('gestfac', 'gestor_sincronizacion') THEN 'Escalada'
        ELSE 'Completada'
    END,
    contextoJson = COALESCE(contextoJson, respuestasJson)
WHERE codigoFlujo IS NULL;

-- 7. La sesion deja de ser unica por si sola. Una gestion puede tener varias
-- etapas, pero una misma etapa/intento no se duplica si n8n reintenta.
ALTER TABLE CRM.GestionesFlujosLog
    DROP INDEX uq_nsf_workflow_session,
    DROP INDEX idx_nsf_resultado_created,
    DROP INDEX idx_nsf_next_step,
    MODIFY COLUMN codigoFlujo VARCHAR(100) NOT NULL,
    MODIFY COLUMN nombreFlujo VARCHAR(180) NOT NULL,
    MODIFY COLUMN codigoEtapa VARCHAR(100) NOT NULL,
    MODIFY COLUMN nombreEtapa VARCHAR(180) NOT NULL,
    MODIFY COLUMN numeroEtapa INT UNSIGNED NOT NULL,
    MODIFY COLUMN estadoGestion VARCHAR(32) NOT NULL,
    ADD UNIQUE KEY uqGestionesFlujosEtapaIntento
        (workflowSession, codigoFlujo, codigoEtapa, numeroIntento),
    ADD KEY ixGestionesFlujosSesion
        (workflowSession, codigoFlujo, numeroEtapa, createdAt),
    ADD KEY ixGestionesFlujosResultado
        (codigoFlujo, codigoEtapa, resultado, createdAt),
    ADD KEY ixGestionesFlujosEstado
        (codigoFlujo, estadoGestion, updatedAt);

-- 8. Vista detallada: una fila por etapa/intento del flujo NSF.
CREATE OR REPLACE VIEW CRM.VwNsfTrazabilidad AS
SELECT
    id,
    workflowSession,
    codigoFlujo,
    nombreFlujo,
    codigoEtapa,
    nombreEtapa,
    numeroEtapa,
    numeroIntento,
    executionId,
    workflowVersion,
    estadoGestion,
    resultado,
    nextStep,
    respuestasJson,
    contextoJson,
    errorJson,
    createdAt,
    updatedAt
FROM CRM.GestionesFlujosLog
WHERE codigoFlujo = 'ningunServicioFunciona';

-- 9. Vista resumida: una fila por gestion con las tres etapas enfrentadas.
CREATE OR REPLACE VIEW CRM.VwNsfResumen AS
SELECT
    workflowSession,
    MIN(createdAt) AS inicioGestion,
    MAX(updatedAt) AS ultimaActualizacion,
    MAX(numeroEtapa) AS ultimaEtapaRegistrada,
    MAX(CASE WHEN numeroEtapa = 1 THEN resultado END) AS resultadoEtapa1,
    MAX(CASE WHEN numeroEtapa = 2 THEN resultado END) AS resultadoEtapa2,
    MAX(CASE WHEN numeroEtapa = 3 THEN resultado END) AS resultadoEtapa3,
    MAX(CASE WHEN numeroEtapa = 1 THEN nextStep END) AS siguientePasoEtapa1,
    MAX(CASE WHEN numeroEtapa = 2 THEN nextStep END) AS siguientePasoEtapa2,
    MAX(CASE WHEN numeroEtapa = 3 THEN nextStep END) AS siguientePasoEtapa3,
    COALESCE(
        MAX(CASE WHEN numeroEtapa = 3 THEN estadoGestion END),
        MAX(CASE WHEN numeroEtapa = 2 THEN estadoGestion END),
        MAX(CASE WHEN numeroEtapa = 1 THEN estadoGestion END)
    ) AS estadoActual,
    MAX(
        CASE WHEN numeroEtapa = 1 THEN
            JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.tipo_sim'))
        END
    ) AS tipoSim,
    MAX(
        CASE WHEN numeroEtapa = 2 THEN
            JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.qr_escaneo_ok'))
        END
    ) AS qrEscaneoOk,
    MAX(
        CASE WHEN numeroEtapa = 2 THEN
            JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.linea_portada'))
        END
    ) AS lineaPortada,
    MAX(
        CASE WHEN numeroEtapa = 2 THEN
            JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.portacion_completada'))
        END
    ) AS portacionCompletada,
    MAX(
        CASE WHEN numeroEtapa = 2 THEN
            JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.suma_ok'))
        END
    ) AS sumaOk,
    MAX(
        CASE WHEN numeroEtapa = 3 THEN
            JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.tipo_falla_equipo'))
        END
    ) AS tipoFallaEquipo,
    MAX(CASE WHEN numeroEtapa = 1 THEN CAST(respuestasJson AS CHAR) END) AS respuestasEtapa1Json,
    MAX(CASE WHEN numeroEtapa = 2 THEN CAST(respuestasJson AS CHAR) END) AS respuestasEtapa2Json,
    MAX(CASE WHEN numeroEtapa = 3 THEN CAST(respuestasJson AS CHAR) END) AS respuestasEtapa3Json
FROM CRM.GestionesFlujosLog
WHERE codigoFlujo = 'ningunServicioFunciona'
GROUP BY workflowSession;

-- 10. Validacion final de la conversion.
SELECT
    TABLE_NAME AS objeto,
    TABLE_TYPE AS tipo
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
      'GestionesFlujosLog', 'VwNsfTrazabilidad', 'VwNsfResumen'
  )
ORDER BY TABLE_TYPE, TABLE_NAME;

SELECT
    workflowSession,
    codigoEtapa,
    numeroEtapa,
    estadoGestion,
    resultado,
    nextStep,
    createdAt
FROM CRM.VwNsfTrazabilidad
ORDER BY workflowSession, numeroEtapa, numeroIntento, createdAt;

SET SQL_SAFE_UPDATES = @sqlSafeUpdatesAnterior;
