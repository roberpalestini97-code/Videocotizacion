-- 0006 · Secreto TOTP cifrado, códigos de recuperación y pasos ya usados.
--
-- El secreto no se guarda en claro: es nonce || ciphertext AES-GCM. La clave
-- AES sale de CLAVE_HMAC en la aplicación. Los códigos de recuperación se
-- guardan solo como HMAC-SHA256 (columna metodo). El TOTP se lee dentro del
-- tenant que ya conoce la cookie preliminar.
-- vc.buscar_ingreso_panel existe para hallar esa cookie sin tenant. La
-- política del dueño es solo para esa función, bajo FORCE RLS. vc_api no es
-- el rol de la política.
-- Reversión: 0006_totp_panel.revertir.sql (manual, rol dueño vc_dueno).

CREATE TABLE vc.secretos_totp (
    tenant_id uuid        NOT NULL,
    asesor_id text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    cifrado   bytea       NOT NULL CHECK (octet_length(cifrado) BETWEEN 29 AND 128),
    creada_en timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, asesor_id),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

ALTER TABLE vc.secretos_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.secretos_totp FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.secretos_totp
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

GRANT SELECT, INSERT ON vc.secretos_totp TO vc_api;

CREATE TABLE vc.codigos_recuperacion (
    tenant_id uuid        NOT NULL,
    asesor_id text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    hash      bytea       NOT NULL CHECK (octet_length(hash) = 32),
    metodo    text        NOT NULL CHECK (metodo = 'hmac-sha256'),
    usado_en  timestamptz,
    PRIMARY KEY (tenant_id, hash),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

ALTER TABLE vc.codigos_recuperacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.codigos_recuperacion FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.codigos_recuperacion
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

GRANT SELECT, INSERT ON vc.codigos_recuperacion TO vc_api;
GRANT UPDATE (usado_en) ON vc.codigos_recuperacion TO vc_api;

CREATE TABLE vc.pasos_totp (
    tenant_id uuid        NOT NULL,
    asesor_id text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    paso      bigint      NOT NULL,
    usado_en  timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, asesor_id, paso),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

ALTER TABLE vc.pasos_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.pasos_totp FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.pasos_totp
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

GRANT SELECT, INSERT ON vc.pasos_totp TO vc_api;

ALTER TABLE vc.ingresos_panel
    ADD COLUMN preliminar boolean NOT NULL DEFAULT false,
    ADD COLUMN revocada_en timestamptz,
    ADD COLUMN vence_inactividad timestamptz;

GRANT UPDATE (revocada_en) ON vc.ingresos_panel TO vc_api;

CREATE POLICY dueno_lee_ingreso ON vc.ingresos_panel
    FOR SELECT TO CURRENT_USER
    USING (true);

CREATE FUNCTION vc.buscar_ingreso_panel(p_hash bytea)
    RETURNS TABLE (
        tenant_id uuid,
        asesor_id text,
        hash_csrf bytea,
        emitida_en timestamptz,
        vence_en timestamptz,
        preliminar boolean,
        revocada boolean,
        vence_inactividad timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$ SELECT i.tenant_id, i.asesor_id, i.hash_csrf, i.emitida_en, i.vence_en,
                 i.preliminar, i.revocada_en IS NOT NULL, i.vence_inactividad
          FROM vc.ingresos_panel i WHERE i.hash_cookie = p_hash $$;

REVOKE ALL ON FUNCTION vc.buscar_ingreso_panel(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vc.buscar_ingreso_panel(bytea) TO vc_api;
