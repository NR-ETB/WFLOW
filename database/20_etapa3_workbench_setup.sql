-- ============================================================
-- NINGÚN SERVICIO FUNCIONA - ETAPA 3
-- Configuración del equipo, prueba cruzada y segundo nivel
-- ============================================================

USE CRM;

CREATE TABLE IF NOT EXISTS n8n_nsf_etapa3 (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workflow_session VARCHAR(128) NOT NULL,
    execution_id VARCHAR(64) NULL,
    workflow_version VARCHAR(100) NOT NULL,
    resultado_etapa_3 VARCHAR(64) NOT NULL,
    next_step VARCHAR(64) NOT NULL,

    tipo_falla_equipo VARCHAR(24) NOT NULL,
    tipo_equipo_cliente VARCHAR(24) NULL,
    configuracion_plataforma VARCHAR(24) NULL,
    configuracion_funciono VARCHAR(24) NULL,
    dispositivo_alterno VARCHAR(24) NULL,
    prueba_cruzada_funciono VARCHAR(24) NULL,
    reinicio_sim_resultado VARCHAR(24) NULL,
    pqr_configuracion_ok VARCHAR(24) NULL,
    pqr_dispositivo_ok VARCHAR(24) NULL,
    pqr_reinicio_ok VARCHAR(24) NULL,
    escalamiento_segundo_nivel VARCHAR(24) NULL,

    respuestas_json JSON NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_nsf_etapa3_workflow_session (workflow_session),
    KEY idx_nsf_etapa3_resultado_created (resultado_etapa_3, created_at),
    KEY idx_nsf_etapa3_tipo_falla (tipo_falla_equipo),
    CONSTRAINT fk_nsf_etapa3_etapa2_session
        FOREIGN KEY (workflow_session)
        REFERENCES n8n_nsf_etapa2 (workflow_session)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW vw_n8n_nsf_etapa3 AS
SELECT
    e3.id,
    e3.workflow_session,
    e3.execution_id,
    e3.workflow_version,
    e3.resultado_etapa_3,
    e3.next_step,
    e3.tipo_falla_equipo,
    e3.tipo_equipo_cliente,
    e3.configuracion_plataforma,
    e3.configuracion_funciono,
    e3.dispositivo_alterno,
    e3.prueba_cruzada_funciono,
    e3.reinicio_sim_resultado,
    e3.pqr_configuracion_ok,
    e3.pqr_dispositivo_ok,
    e3.pqr_reinicio_ok,
    e3.escalamiento_segundo_nivel,
    e2.tipo_sim,
    e2.resultado_etapa_2,
    e2.next_step AS etapa2_next_step,
    e1.resultado_etapa_1,
    e3.created_at,
    e3.updated_at
FROM n8n_nsf_etapa3 AS e3
INNER JOIN n8n_nsf_etapa2 AS e2
    ON e2.workflow_session = e3.workflow_session
INNER JOIN n8n_nsf_respuestas AS e1
    ON e1.workflow_session = e3.workflow_session;

SELECT DATABASE() AS base_seleccionada;

SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('n8n_nsf_etapa3', 'vw_n8n_nsf_etapa3')
ORDER BY TABLE_TYPE, TABLE_NAME;

SELECT
    CONSTRAINT_NAME,
    TABLE_NAME,
    REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME = 'fk_nsf_etapa3_etapa2_session';

-- Resultados operativos esperados:
-- pqr_solucionada_configuracion
-- pqr_solucionada_falla_dispositivo
-- pqr_solucionada_reinicio_sim
-- escalado_segundo_nivel
