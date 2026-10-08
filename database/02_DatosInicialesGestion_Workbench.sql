-- Registro principal y copia de los datos iniciales en el log.
-- MySQL 8.4+. Ejecutar después de la migración 00, con respaldo previo.
-- No renombra ni elimina tablas o registros. Se puede volver a ejecutar.
-- DDL produce commits implícitos: ejecutar en una ventana de mantenimiento.
USE CRM;

DROP PROCEDURE IF EXISTS CRM.InstalarDatosInicialesGestion;
DELIMITER $$
CREATE PROCEDURE CRM.InstalarDatosInicialesGestion()
SQL SECURITY INVOKER
BEGIN
    DECLARE vSessionType TEXT;
    DECLARE vLogEngine VARCHAR(64);
    DECLARE vCount INT DEFAULT 0;

    SELECT MAX(ENGINE) INTO vLogEngine
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujosLog';
    IF vLogEngine IS NULL OR vLogEngine <> 'InnoDB' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'GestionesFlujosLog debe existir y usar InnoDB. Revisa la migracion 00.';
    END IF;

    -- Se conserva el tipo, charset y collation reales de la sesión del log.
    SELECT MAX(CONCAT(COLUMN_TYPE, ' CHARACTER SET ', CHARACTER_SET_NAME,
                      ' COLLATE ', COLLATION_NAME)) INTO vSessionType
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujosLog'
      AND COLUMN_NAME = 'workflowSession' AND DATA_TYPE IN ('char', 'varchar');
    IF vSessionType IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falta workflowSession de tipo texto en el log.';
    END IF;
    SELECT COUNT(*) INTO vCount
    FROM (
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujosLog' AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME
        HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) =
               'workflowSession,codigoFlujo,codigoEtapa,numeroIntento'
    ) AS claves;
    IF vCount = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falta la unicidad por sesion, flujo, etapa e intento en el log.';
    END IF;

    SET @crearGestionesFlujos = CONCAT(
      'CREATE TABLE IF NOT EXISTS CRM.GestionesFlujos (',
      'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, ',
      'workflowSession ', vSessionType, ' NOT NULL, ',
      'usuarioAsesor VARCHAR(100) NOT NULL, ',
      'numeroConexion VARCHAR(100) NOT NULL, ',
      'pqr VARCHAR(100) NOT NULL, ',
      'createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ',
      'updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), ',
      'UNIQUE KEY uqGestionesFlujosSesion (workflowSession), ',
      'KEY ixGestionesFlujosAsesor (usuarioAsesor), ',
      'KEY ixGestionesFlujosConexion (numeroConexion), ',
      'KEY ixGestionesFlujosPqr (pqr), ',
      'CONSTRAINT ckGFUsuarioAsesor CHECK (CHAR_LENGTH(TRIM(usuarioAsesor)) > 0), ',
      'CONSTRAINT ckGFNumeroConexion CHECK (CHAR_LENGTH(TRIM(numeroConexion)) > 0), ',
      'CONSTRAINT ckGFPqr CHECK (CHAR_LENGTH(TRIM(pqr)) > 0)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    PREPARE stmtCrearGestionesFlujos FROM @crearGestionesFlujos;
    EXECUTE stmtCrearGestionesFlujos;
    DEALLOCATE PREPARE stmtCrearGestionesFlujos;

    -- Si ya existe una tabla con este nombre, no se adapta a ciegas.
    SELECT COUNT(*) INTO vCount
    FROM information_schema.COLUMNS AS principal
    JOIN information_schema.COLUMNS AS logSesion
      ON logSesion.TABLE_SCHEMA = 'CRM' AND logSesion.TABLE_NAME = 'GestionesFlujosLog'
     AND logSesion.COLUMN_NAME = 'workflowSession'
    WHERE principal.TABLE_SCHEMA = 'CRM' AND principal.TABLE_NAME = 'GestionesFlujos'
      AND principal.COLUMN_NAME = 'workflowSession'
      AND principal.COLUMN_TYPE = logSesion.COLUMN_TYPE
      AND principal.CHARACTER_SET_NAME = logSesion.CHARACTER_SET_NAME
      AND principal.COLLATION_NAME = logSesion.COLLATION_NAME;
    IF vCount <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La sesion del registro principal no coincide con la del log.';
    END IF;
    SELECT COUNT(*) INTO vCount FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujos'
      AND COLUMN_NAME IN ('usuarioAsesor', 'numeroConexion', 'pqr')
      AND DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 100 AND IS_NULLABLE = 'NO'
      AND CHARACTER_SET_NAME = 'utf8mb4';
    IF vCount <> 3 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GestionesFlujos tiene una estructura inicial incompatible.';
    END IF;
    SELECT COUNT(*) INTO vCount FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujos' AND COLUMN_NAME = 'id'
      AND DATA_TYPE = 'bigint' AND COLUMN_KEY = 'PRI' AND EXTRA LIKE '%auto_increment%';
    IF vCount <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falta id BIGINT autoincremental en GestionesFlujos.';
    END IF;
    SELECT COUNT(*) INTO vCount FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujos'
      AND COLUMN_NAME IN ('createdAt', 'updatedAt') AND DATA_TYPE = 'datetime';
    IF vCount <> 2 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Faltan las fechas del registro principal.';
    END IF;
    SELECT COUNT(*) INTO vCount FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujos' AND ENGINE = 'InnoDB';
    IF vCount <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GestionesFlujos debe usar InnoDB.';
    END IF;
    SELECT COUNT(*) INTO vCount
    FROM (
        SELECT INDEX_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujos' AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) = 'workflowSession'
    ) AS clavesPrincipal;
    IF vCount = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falta unicidad de workflowSession en GestionesFlujos.';
    END IF;
    SELECT COUNT(DISTINCT INDEX_NAME) INTO vCount FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujos' AND NON_UNIQUE = 0;
    IF vCount <> 2 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GestionesFlujos solo debe tener claves unicas por id y sesion.';
    END IF;

    -- NULL solo para historial sin flujo 0; los registros nuevos del flujo 0
    -- reciben las tres columnas además de sus respuestas JSON.
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'CRM'
                   AND TABLE_NAME = 'GestionesFlujosLog' AND COLUMN_NAME = 'usuarioAsesor') THEN
        ALTER TABLE CRM.GestionesFlujosLog ADD COLUMN usuarioAsesor VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'CRM'
                   AND TABLE_NAME = 'GestionesFlujosLog' AND COLUMN_NAME = 'numeroConexion') THEN
        ALTER TABLE CRM.GestionesFlujosLog ADD COLUMN numeroConexion VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'CRM'
                   AND TABLE_NAME = 'GestionesFlujosLog' AND COLUMN_NAME = 'pqr') THEN
        ALTER TABLE CRM.GestionesFlujosLog ADD COLUMN pqr VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;
    END IF;
    SELECT COUNT(*) INTO vCount FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujosLog'
      AND COLUMN_NAME IN ('usuarioAsesor', 'numeroConexion', 'pqr')
      AND DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH >= 100
      AND CHARACTER_SET_NAME = 'utf8mb4' AND IS_NULLABLE = 'YES'
      AND EXTRA NOT LIKE '%GENERATED%';
    IF vCount <> 3 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Las columnas iniciales del log tienen una estructura incompatible.';
    END IF;
END$$
DELIMITER ;
CALL CRM.InstalarDatosInicialesGestion();
DROP PROCEDURE CRM.InstalarDatosInicialesGestion;

-- Recuperar registros iniciales que ya se guardaron solo en JSON.
-- Ante varios intentos de una sesión, el primero es la referencia original.
DROP PROCEDURE IF EXISTS CRM.MigrarDatosInicialesExistentes;
DELIMITER $$
CREATE PROCEDURE CRM.MigrarDatosInicialesExistentes()
SQL SECURITY INVOKER
BEGIN
    DECLARE vSafeUpdates INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET SQL_SAFE_UPDATES = vSafeUpdates;
        RESIGNAL;
    END;
    SET vSafeUpdates = @@SQL_SAFE_UPDATES;
    SET SQL_SAFE_UPDATES = 0;
    START TRANSACTION;
INSERT INTO CRM.GestionesFlujos
    (workflowSession, usuarioAsesor, numeroConexion, pqr, createdAt, updatedAt)
SELECT workflowSession,
       TRIM(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.usuario_asesor'))),
       TRIM(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.numero_conexion'))),
       TRIM(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.pqr'))), createdAt, updatedAt
FROM CRM.GestionesFlujosLog
WHERE codigoFlujo = 'inicioGestion' AND codigoEtapa = 'registroInicial' AND numeroEtapa = 0
  AND workflowSession IS NOT NULL AND CHAR_LENGTH(TRIM(workflowSession)) > 0
  AND JSON_TYPE(JSON_EXTRACT(respuestasJson, '$.usuario_asesor')) = 'STRING'
  AND JSON_TYPE(JSON_EXTRACT(respuestasJson, '$.numero_conexion')) = 'STRING'
  AND JSON_TYPE(JSON_EXTRACT(respuestasJson, '$.pqr')) = 'STRING'
  AND CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.usuario_asesor')))) BETWEEN 1 AND 100
  AND CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.numero_conexion')))) BETWEEN 1 AND 100
  AND CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(respuestasJson, '$.pqr')))) BETWEEN 1 AND 100
ORDER BY createdAt, id
ON DUPLICATE KEY UPDATE id = GestionesFlujos.id;

UPDATE CRM.GestionesFlujosLog AS log
JOIN CRM.GestionesFlujos AS gestion ON gestion.workflowSession = log.workflowSession
SET log.usuarioAsesor = gestion.usuarioAsesor,
    log.numeroConexion = gestion.numeroConexion,
    log.pqr = gestion.pqr,
    log.updatedAt = log.updatedAt;
COMMIT;
    SET SQL_SAFE_UPDATES = vSafeUpdates;
END$$
DELIMITER ;
CALL CRM.MigrarDatosInicialesExistentes();
DROP PROCEDURE CRM.MigrarDatosInicialesExistentes;

-- Copia automática al insertar o actualizar cualquier etapa de la misma sesión.
-- Los registros nuevos de otras etapas también requieren un inicio confirmado.
-- El historial se conserva; sus actualizaciones no necesitan inventar datos.
DROP TRIGGER IF EXISTS CRM.trgGFLogDatosInicialesInsert;
DROP TRIGGER IF EXISTS CRM.trgGFLogDatosInicialesUpdate;
DELIMITER $$
CREATE TRIGGER CRM.trgGFLogDatosInicialesInsert BEFORE INSERT ON CRM.GestionesFlujosLog
FOR EACH ROW
BEGIN
    DECLARE vCount INT;
    DECLARE vUsuario VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE vConexion VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE vPqr VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    SELECT COUNT(*), MAX(usuarioAsesor), MAX(numeroConexion), MAX(pqr)
    INTO vCount, vUsuario, vConexion, vPqr
    FROM CRM.GestionesFlujos WHERE workflowSession = NEW.workflowSession;
    IF vCount = 1 THEN
        SET NEW.usuarioAsesor = vUsuario, NEW.numeroConexion = vConexion, NEW.pqr = vPqr;
    ELSEIF NEW.codigoFlujo = 'inicioGestion' AND NEW.codigoEtapa = 'registroInicial' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El flujo inicial debe guardarse con RegistrarInicioGestion.';
    ELSEIF COALESCE(NEW.numeroEtapa, 0) > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inicia la gestion desde el flujo 0 antes de guardar otra etapa.';
    END IF;
END$$
CREATE TRIGGER CRM.trgGFLogDatosInicialesUpdate BEFORE UPDATE ON CRM.GestionesFlujosLog
FOR EACH ROW
BEGIN
    DECLARE vCount INT;
    DECLARE vUsuario VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE vConexion VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE vPqr VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    SELECT COUNT(*), MAX(usuarioAsesor), MAX(numeroConexion), MAX(pqr)
    INTO vCount, vUsuario, vConexion, vPqr
    FROM CRM.GestionesFlujos WHERE workflowSession = NEW.workflowSession;
    IF vCount = 1 THEN
        SET NEW.usuarioAsesor = vUsuario, NEW.numeroConexion = vConexion, NEW.pqr = vPqr;
    ELSEIF NEW.codigoFlujo = 'inicioGestion' AND NEW.codigoEtapa = 'registroInicial' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El flujo inicial debe guardarse con RegistrarInicioGestion.';
    ELSEIF COALESCE(NEW.numeroEtapa, 0) > 0 AND NOT (NEW.workflowSession <=> OLD.workflowSession) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La nueva sesion debe tener un registro inicial.';
    END IF;
END$$
DELIMITER ;

-- El flujo 0 escribe el registro principal y su log en una sola transacción.
-- Un reintento nunca reemplaza los datos originales de una sesión existente.
DROP PROCEDURE IF EXISTS CRM.RegistrarInicioGestion;
DELIMITER $$
CREATE PROCEDURE CRM.RegistrarInicioGestion(
    IN pSession VARCHAR(100), IN pDatos LONGTEXT CHARACTER SET utf8mb4,
    IN pExecutionId VARCHAR(100), IN pWorkflowVersion VARCHAR(100)
)
SQL SECURITY INVOKER
BEGIN
    DECLARE vId BIGINT UNSIGNED;
    DECLARE vSession VARCHAR(100);
    DECLARE vUsuario VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE vConexion VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE vPqr VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    DECLARE vSessionMax INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    -- Los tres identificadores llegan como JSON con valores de tipo string.
    -- Esto evita la conversión numérica automática de parámetros de n8n.
    IF pDatos IS NULL OR JSON_VALID(pDatos) <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los datos iniciales deben ser JSON valido.';
    END IF;
    IF JSON_TYPE(pDatos) <> 'OBJECT'
       OR COALESCE(JSON_TYPE(JSON_EXTRACT(pDatos, '$.usuario_asesor')), '') <> 'STRING'
       OR COALESCE(JSON_TYPE(JSON_EXTRACT(pDatos, '$.numero_conexion')), '') <> 'STRING'
       OR COALESCE(JSON_TYPE(JSON_EXTRACT(pDatos, '$.pqr')), '') <> 'STRING'
       OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(pDatos, '$.usuario_asesor')))) NOT BETWEEN 1 AND 100
       OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(pDatos, '$.numero_conexion')))) NOT BETWEEN 1 AND 100
       OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(pDatos, '$.pqr')))) NOT BETWEEN 1 AND 100 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los tres datos iniciales deben ser texto de 1 a 100 caracteres.';
    END IF;
    SET vUsuario = TRIM(JSON_UNQUOTE(JSON_EXTRACT(pDatos, '$.usuario_asesor')));
    SET vConexion = TRIM(JSON_UNQUOTE(JSON_EXTRACT(pDatos, '$.numero_conexion')));
    SET vPqr = TRIM(JSON_UNQUOTE(JSON_EXTRACT(pDatos, '$.pqr')));
    SELECT CHARACTER_MAXIMUM_LENGTH INTO vSessionMax
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'CRM' AND TABLE_NAME = 'GestionesFlujos' AND COLUMN_NAME = 'workflowSession';
    IF pSession IS NULL OR pSession NOT REGEXP '^f0-[a-zA-Z0-9_-]{1,72}$'
       OR CHAR_LENGTH(pSession) > vSessionMax
       OR vUsuario REGEXP '[[:cntrl:]]' OR vConexion REGEXP '[[:cntrl:]]' OR vPqr REGEXP '[[:cntrl:]]'
       OR pExecutionId IS NULL OR CHAR_LENGTH(TRIM(pExecutionId)) = 0
       OR pWorkflowVersion IS NULL OR CHAR_LENGTH(TRIM(pWorkflowVersion)) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Datos iniciales incompletos o sesion no valida.';
    END IF;
    START TRANSACTION;
    INSERT INTO CRM.GestionesFlujos (workflowSession, usuarioAsesor, numeroConexion, pqr)
    VALUES (pSession, vUsuario, vConexion, vPqr)
    ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
    SET vId = LAST_INSERT_ID();
    SELECT workflowSession, usuarioAsesor, numeroConexion, pqr
    INTO vSession, vUsuario, vConexion, vPqr
    FROM CRM.GestionesFlujos WHERE id = vId;
    INSERT INTO CRM.GestionesFlujosLog
        (workflowSession, codigoFlujo, nombreFlujo, codigoEtapa, nombreEtapa,
         numeroEtapa, numeroIntento, executionId, workflowVersion, estadoGestion,
         resultado, nextStep, respuestasJson, contextoJson, usuarioAsesor, numeroConexion, pqr)
    VALUES (vSession, 'inicioGestion', 'Inicio de gestion', 'registroInicial',
            'Datos iniciales del asesor y la atencion', 0, 1, pExecutionId, pWorkflowVersion,
            'Completada', 'datos_iniciales_registrados', 'fin_flujo_0',
            JSON_OBJECT('usuario_asesor', vUsuario, 'numero_conexion', vConexion, 'pqr', vPqr),
            JSON_OBJECT('usuario_asesor', vUsuario, 'numero_conexion', vConexion, 'pqr', vPqr),
            vUsuario, vConexion, vPqr)
    ON DUPLICATE KEY UPDATE executionId = pExecutionId, workflowVersion = pWorkflowVersion,
        usuarioAsesor = vUsuario, numeroConexion = vConexion, pqr = vPqr,
        respuestasJson = JSON_OBJECT('usuario_asesor', vUsuario, 'numero_conexion', vConexion, 'pqr', vPqr),
        contextoJson = JSON_OBJECT('usuario_asesor', vUsuario, 'numero_conexion', vConexion, 'pqr', vPqr);
    COMMIT;
    SELECT 1 AS registroConfirmado, vSession AS workflowSession,
           vUsuario AS usuarioAsesor, vConexion AS numeroConexion, vPqr AS pqr;
END$$
DELIMITER ;

CREATE OR REPLACE VIEW CRM.VwGestionesFlujosTrazabilidad AS
SELECT * FROM CRM.GestionesFlujosLog;

CREATE OR REPLACE VIEW CRM.VwGestionesFlujosResumen AS
SELECT gestion.id, gestion.workflowSession, gestion.usuarioAsesor,
       gestion.numeroConexion, gestion.pqr, gestion.createdAt AS inicioGestion,
       GREATEST(gestion.updatedAt, COALESCE(MAX(log.updatedAt), gestion.updatedAt)) AS ultimaActualizacion,
       COUNT(log.id) AS registrosLog, MAX(log.numeroEtapa) AS ultimaEtapaRegistrada
FROM CRM.GestionesFlujos AS gestion
LEFT JOIN CRM.GestionesFlujosLog AS log ON log.workflowSession = gestion.workflowSession
GROUP BY gestion.id, gestion.workflowSession, gestion.usuarioAsesor, gestion.numeroConexion,
         gestion.pqr, gestion.createdAt, gestion.updatedAt;

-- Verificación sin revelar el contenido de los datos personales.
SELECT COUNT(*) AS registrosPrincipales FROM CRM.GestionesFlujos;
SELECT COUNT(*) AS registrosInicialesSinPrincipal
FROM CRM.GestionesFlujosLog AS log
LEFT JOIN CRM.GestionesFlujos AS gestion ON gestion.workflowSession = log.workflowSession
WHERE log.codigoFlujo = 'inicioGestion' AND log.codigoEtapa = 'registroInicial' AND gestion.id IS NULL;
