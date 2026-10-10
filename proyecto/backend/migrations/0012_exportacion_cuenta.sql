-- 0012 · Consentimiento del asesor y registro de lecturas (R49, R69, R70).
--
-- La exportación no fabrica la aceptación: la fila la inserta quien registra
-- el aviso. vc_api puede insertarla y leerla, sin UPDATE ni DELETE.
-- El registro es solo-anexar y no tiene teléfono, email ni nombre.
-- Reversión: 0012_exportacion_cuenta.revertir.sql (manual, rol dueño vc_dueno).

CREATE TABLE vc.consentimientos_asesor (
    tenant_id     uuid        NOT NULL,
    asesor_id     text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    aviso_version text        NOT NULL CHECK (aviso_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$'),
    aceptado_en   timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, asesor_id),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

ALTER TABLE vc.consentimientos_asesor ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.consentimientos_asesor FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.consentimientos_asesor
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

CREATE TRIGGER consentimientos_asesor_solo_anexar BEFORE UPDATE ON vc.consentimientos_asesor
    FOR EACH ROW EXECUTE FUNCTION vc.impedir_modificacion();

GRANT SELECT, INSERT ON vc.consentimientos_asesor TO vc_api;

CREATE TABLE vc.lecturas (
    tenant_id    uuid        NOT NULL,
    registro_id  text COLLATE "C" NOT NULL CHECK (registro_id ~ '^reg_[0-9A-HJKMNP-TV-Z]{26}$'),
    ocurrido_en  timestamptz NOT NULL,
    asesor_id    text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    accion       text        NOT NULL CHECK (accion IN (
                     'ver_detalle', 'ver_contacto', 'exportar_mi_cuenta', 'rotar_enlace',
                     'crear_clave_widget', 'revocar_clave_widget', 'inicio_sesion', 'cambio_contrasena')),
    recurso_id   text COLLATE "C" CHECK (recurso_id IS NULL OR recurso_id ~ '^[a-z]{3}_[0-9A-HJKMNP-TV-Z]{26}$'),
    PRIMARY KEY (tenant_id, registro_id),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

CREATE INDEX lecturas_por_asesor ON vc.lecturas (tenant_id, asesor_id, ocurrido_en, registro_id);

ALTER TABLE vc.lecturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.lecturas FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.lecturas
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

CREATE TRIGGER lecturas_solo_anexar BEFORE UPDATE ON vc.lecturas
    FOR EACH ROW EXECUTE FUNCTION vc.impedir_modificacion();

GRANT SELECT, INSERT ON vc.lecturas TO vc_api;
