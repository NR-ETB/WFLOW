USE CRM;

-- Distribución de resultados terminales de la etapa 3.
SELECT
    resultado_etapa_3,
    COUNT(*) AS total,
    MAX(updated_at) AS ultima_actualizacion
FROM n8n_nsf_etapa3
GROUP BY resultado_etapa_3
ORDER BY total DESC, resultado_etapa_3;

-- Sesiones listas en la etapa 2 que todavía no tienen cierre en etapa 3.
SELECT
    e2.workflow_session,
    e2.tipo_sim,
    e2.updated_at AS lista_desde
FROM n8n_nsf_etapa2 AS e2
LEFT JOIN n8n_nsf_etapa3 AS e3
    ON e3.workflow_session = e2.workflow_session
WHERE e2.resultado_etapa_2 = 'continuar_parte_3'
  AND e2.next_step = 'parte_3_configuracion_equipo'
  AND e2.suma_ok = 'Si'
  AND e3.workflow_session IS NULL
ORDER BY e2.updated_at;

-- Auditoría completa de continuidad entre las tres etapas.
SELECT
    e1.workflow_session,
    e1.resultado_etapa_1,
    e2.resultado_etapa_2,
    e2.next_step AS etapa2_next_step,
    e3.resultado_etapa_3,
    e3.next_step AS etapa3_next_step
FROM n8n_nsf_respuestas AS e1
LEFT JOIN n8n_nsf_etapa2 AS e2
    ON e2.workflow_session = e1.workflow_session
LEFT JOIN n8n_nsf_etapa3 AS e3
    ON e3.workflow_session = e1.workflow_session
ORDER BY e1.updated_at DESC;
