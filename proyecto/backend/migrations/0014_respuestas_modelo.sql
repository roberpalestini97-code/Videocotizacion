-- 0014 · Salida del LLM por turno (R42, RespuestaModelo).
-- Reversión: 0014_respuestas_modelo.revertir.sql (manual, rol dueño vc_dueno).

CREATE TABLE vc.respuestas_modelo (
    tenant_id      uuid        NOT NULL,
    sesion_id      text COLLATE "C" NOT NULL CHECK (sesion_id ~ '^ses_[0-9A-HJKMNP-TV-Z]{26}$'),
    turno          int         NOT NULL CHECK (turno >= 1 AND turno <= 500),
    registrada_en  timestamptz NOT NULL,
    salida         jsonb       NOT NULL,
    PRIMARY KEY (tenant_id, sesion_id, turno),
    FOREIGN KEY (tenant_id, sesion_id) REFERENCES vc.sesiones (tenant_id, sesion_id) ON DELETE CASCADE
);

ALTER TABLE vc.respuestas_modelo ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.respuestas_modelo FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.respuestas_modelo
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

GRANT SELECT, INSERT ON vc.respuestas_modelo TO vc_api;
