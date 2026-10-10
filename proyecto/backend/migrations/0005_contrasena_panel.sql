-- 0005 · Hash Argon2id del asesor y cookie preliminar del panel.
--
-- El asesor público no gana una columna de contraseña. El login todavía no
-- conoce el tenant: vc.buscar_contrasena es SECURITY DEFINER, como
-- vc.buscar_clave, y la política de SELECT del dueño existe solo para que
-- esa función lea a pesar de FORCE RLS. vc_api no es el rol de esa política
-- y no puede leer la tabla sin tenant.
-- La cookie preliminar no autoriza el panel: acá se guarda el HMAC, nunca
-- el valor ni la contraseña. Falta el TOTP.
-- Reversión: 0005_contrasena_panel.revertir.sql (manual, rol dueño vc_dueno).

CREATE TABLE vc.contrasenas_asesor (
    tenant_id    uuid        NOT NULL,
    asesor_id    text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    email        text        NOT NULL CHECK (
        char_length(email) BETWEEN 3 AND 254
        AND email = lower(email)
        AND email ~ '^[^@<>]+@[^@<>]+$'
    ),
    hash         bytea       NOT NULL CHECK (octet_length(hash) = 32),
    sal          bytea       NOT NULL CHECK (octet_length(sal) = 16),
    memoria_kib  integer     NOT NULL CHECK (memoria_kib > 0),
    iteraciones  integer     NOT NULL CHECK (iteraciones > 0),
    paralelismo  smallint    NOT NULL CHECK (paralelismo > 0),
    creada_en    timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, asesor_id),
    UNIQUE (email),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

ALTER TABLE vc.contrasenas_asesor ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.contrasenas_asesor FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.contrasenas_asesor
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

CREATE POLICY dueno_lee_contrasena ON vc.contrasenas_asesor
    FOR SELECT TO CURRENT_USER
    USING (true);

CREATE FUNCTION vc.buscar_contrasena(p_email text)
    RETURNS TABLE (
        tenant_id uuid,
        asesor_id text,
        email text,
        hash bytea,
        sal bytea,
        memoria_kib integer,
        iteraciones integer,
        paralelismo smallint,
        creada_en timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$ SELECT c.tenant_id, c.asesor_id, c.email, c.hash, c.sal,
                 c.memoria_kib, c.iteraciones, c.paralelismo, c.creada_en
          FROM vc.contrasenas_asesor c
          WHERE c.email = lower(p_email) $$;

REVOKE ALL ON FUNCTION vc.buscar_contrasena(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vc.buscar_contrasena(text) TO vc_api;
GRANT SELECT, INSERT ON vc.contrasenas_asesor TO vc_api;

-- Cookie preliminar: identificador opaco ya hasheado. Sin TOTP no abre nada.
CREATE TABLE vc.ingresos_panel (
    tenant_id   uuid        NOT NULL,
    hash_cookie bytea       NOT NULL CHECK (octet_length(hash_cookie) = 32),
    hash_csrf   bytea       NOT NULL CHECK (octet_length(hash_csrf) = 32),
    asesor_id   text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    emitida_en  timestamptz NOT NULL,
    vence_en    timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, hash_cookie),
    UNIQUE (hash_cookie),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id),
    CHECK (vence_en > emitida_en)
);

ALTER TABLE vc.ingresos_panel ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.ingresos_panel FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.ingresos_panel
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

GRANT SELECT, INSERT ON vc.ingresos_panel TO vc_api;
