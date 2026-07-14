-- Consultas de control para la etapa 2. No modifican datos.

USE CRM;

-- Casos pendientes de nueva revisión del NIP
SELECT *
FROM vw_n8n_nsf_etapa2
WHERE resultado_etapa_2 = 'espera_nip'
  AND next_step = 'revisar_nip'
ORDER BY updated_at ASC;

-- Distribución de resultados
SELECT
    resultado_etapa_2,
    COUNT(*) AS cantidad
FROM n8n_nsf_etapa2
GROUP BY resultado_etapa_2
ORDER BY cantidad DESC;

-- Validación de contrato entre las etapas
SELECT
    e1.workflow_session,
    e1.tipo_sim,
    e1.resultado_etapa_1,
    e1.next_step,
    e2.resultado_etapa_2,
    e2.next_step AS etapa2_next_step
FROM n8n_nsf_respuestas AS e1
LEFT JOIN n8n_nsf_etapa2 AS e2
    ON e2.workflow_session = e1.workflow_session
WHERE e1.resultado_etapa_1 = 'continuar_parte_2'
ORDER BY e1.updated_at DESC;
