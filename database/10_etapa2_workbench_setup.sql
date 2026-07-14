-- ============================================================
-- NINGÚN SERVICIO FUNCIONA - ETAPA 2
-- Instalación completa en el esquema CRM
-- ============================================================

USE CRM;

CREATE TABLE IF NOT EXISTS n8n_nsf_etapa2 (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workflow_session VARCHAR(128) NOT NULL,
    execution_id VARCHAR(64) NULL,
    workflow_version VARCHAR(100) NOT NULL,
    resultado_etapa_2 VARCHAR(64) NOT NULL,
    next_step VARCHAR(64) NOT NULL,

    tipo_sim VARCHAR(24) NOT NULL,
    ruta_multisim VARCHAR(24) NULL,
    qr_escaneo_ok VARCHAR(24) NULL,
    qr_gestion VARCHAR(24) NULL,
    reposicion_ok VARCHAR(24) NULL,
    linea_portada VARCHAR(24) NULL,
    portacion_completada VARCHAR(24) NULL,
    nip_estado VARCHAR(24) NULL,
    espera_nip_confirmada VARCHAR(24) NULL,
    gestor_nip_ok VARCHAR(24) NULL,
    suma_ok VARCHAR(24) NULL,
    gestor_suma_ok VARCHAR(24) NULL,
    servicio_normalizado VARCHAR(24) NULL, -- legado; la ruta correcta continúa a etapa 3

    respuestas_json JSON NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_nsf_etapa2_workflow_session (workflow_session),
    KEY idx_nsf_etapa2_resultado_created (resultado_etapa_2, created_at),
    KEY idx_nsf_etapa2_next_step (next_step),
    KEY idx_nsf_etapa2_tipo_sim (tipo_sim),
    CONSTRAINT fk_nsf_etapa2_etapa1_session
        FOREIGN KEY (workflow_session)
        REFERENCES n8n_nsf_respuestas (workflow_session)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW vw_n8n_nsf_etapa2 AS
SELECT
    e2.id,
    e2.workflow_session,
    e2.execution_id,
    e2.workflow_version,
    e2.resultado_etapa_2,
    e2.next_step,
    e2.tipo_sim,
    e2.ruta_multisim,
    e2.qr_escaneo_ok,
    e2.qr_gestion,
    e2.reposicion_ok,
    e2.linea_portada,
    e2.portacion_completada,
    e2.nip_estado,
    e2.espera_nip_confirmada,
    e2.gestor_nip_ok,
    e2.suma_ok,
    e2.gestor_suma_ok,
    e2.servicio_normalizado,
    e1.resultado_etapa_1,
    e1.next_step AS etapa1_next_step,
    e2.created_at,
    e2.updated_at
FROM n8n_nsf_etapa2 AS e2
INNER JOIN n8n_nsf_respuestas AS e1
    ON e1.workflow_session = e2.workflow_session;

-- Verificaciones de instalación
SELECT DATABASE() AS base_seleccionada;

SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('n8n_nsf_etapa2', 'vw_n8n_nsf_etapa2')
ORDER BY TABLE_TYPE, TABLE_NAME;

SELECT
    CONSTRAINT_NAME,
    TABLE_NAME,
    REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME = 'fk_nsf_etapa2_etapa1_session';

-- Resultados operativos esperados:
-- reposicion_qr
-- espera_nip
-- gestor_nip_vencido
-- gestor_sincronizacion_suma
-- continuar_parte_3
