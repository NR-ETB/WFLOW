-- Consultas de control. Este archivo es solo lectura.
USE CRM;

-- Todas las etapas, ordenadas cronologicamente.
SELECT *
FROM CRM.VwNsfTrazabilidad
ORDER BY workflowSession, numeroEtapa, numeroIntento, createdAt;

-- Una fila por gestion completa.
SELECT *
FROM CRM.VwNsfResumen
ORDER BY ultimaActualizacion DESC;

-- Diagnostico de una sesion puntual.
SET @workflowSession = _utf8mb4'PEGA_AQUI_LA_SESION'
    COLLATE utf8mb4_unicode_ci;

SELECT *
FROM CRM.VwNsfTrazabilidad
WHERE workflowSession = @workflowSession COLLATE utf8mb4_unicode_ci
ORDER BY numeroEtapa, numeroIntento, createdAt;

-- Cierre del asesor de esa misma sesion. Sigue siendo una consulta de lectura.
SELECT
    workflowSession,
    resultadoEtapa3,
    estadoActual,
    JSON_UNQUOTE(
        JSON_EXTRACT(respuestasEtapa3Json, '$.observaciones_asesor')
    ) AS observacionesAsesor,
    JSON_UNQUOTE(
        JSON_EXTRACT(respuestasEtapa3Json, '$.fecha_cierre_asesor')
    ) AS fechaCierreAsesor
FROM CRM.VwNsfResumen
WHERE workflowSession = @workflowSession COLLATE utf8mb4_unicode_ci;

-- Sesiones que iniciaron pero no llegaron a la etapa 3.
SELECT *
FROM CRM.VwNsfResumen
WHERE ultimaEtapaRegistrada < 3
ORDER BY ultimaActualizacion DESC;
