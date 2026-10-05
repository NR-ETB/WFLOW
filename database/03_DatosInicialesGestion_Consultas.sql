-- Consultas de control, solo lectura. Ejecutar después de la migración 02.
USE CRM;
SELECT * FROM CRM.VwGestionesFlujosResumen ORDER BY ultimaActualizacion DESC;

SET @sesionInicial = 'PEGA_AQUI_LA_SESION';
-- Comparación binaria para no depender del collation de la variable Workbench.
SELECT * FROM CRM.GestionesFlujos
WHERE CAST(workflowSession AS BINARY) = CAST(@sesionInicial AS BINARY);
SELECT * FROM CRM.VwGestionesFlujosTrazabilidad
WHERE CAST(workflowSession AS BINARY) = CAST(@sesionInicial AS BINARY)
ORDER BY numeroEtapa, numeroIntento, createdAt;

-- El resultado debe ser cero después de guardar un flujo 0 nuevo.
SELECT COUNT(*) AS principalesSinLogInicial
FROM CRM.GestionesFlujos AS gestion
LEFT JOIN CRM.GestionesFlujosLog AS log
  ON log.workflowSession = gestion.workflowSession AND log.codigoFlujo = 'inicioGestion'
 AND log.codigoEtapa = 'registroInicial' AND log.numeroIntento = 1
WHERE log.id IS NULL;

-- El resultado debe ser cero para sesiones con registro principal.
SELECT COUNT(*) AS copiasDiferentesDelOriginal
FROM CRM.GestionesFlujosLog AS log
JOIN CRM.GestionesFlujos AS gestion ON gestion.workflowSession = log.workflowSession
WHERE NOT (CAST(log.usuarioAsesor AS BINARY) <=> CAST(gestion.usuarioAsesor AS BINARY))
   OR NOT (CAST(log.numeroConexion AS BINARY) <=> CAST(gestion.numeroConexion AS BINARY))
   OR NOT (CAST(log.pqr AS BINARY) <=> CAST(gestion.pqr AS BINARY));
