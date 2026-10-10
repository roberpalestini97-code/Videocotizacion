-- 0002 · Credenciales de API, enlaces opacos y tokens de sesión (T04b parte 1).
--
-- Mismas reglas que 0001: tenant_id NOT NULL, RLS + FORCE con la política de
-- aislamiento, privilegios mínimos de vc_api (lista exacta en
-- internal/almacen/postgres/endurecimiento.go). Las credenciales se guardan
-- SOLO como HMAC-SHA256 con una clave del servidor (R1): nunca en claro.
-- Reversión: 0002_credenciales_y_enlaces.revertir.sql (manual, rol dueño).

-- Claves de API: secreta (vc_sec_, servidor a servidor) y pública del widget
-- (vc_pub_, atada a Origin exactos, R54/R55).
CREATE TABLE vc.claves_api (
    tenant_id   uuid        NOT NULL REFERENCES vc.tenants (tenant_id),
    clave_id    text COLLATE "C" NOT NULL CHECK (clave_id ~ '^(cpw|cse)_[0-9A-HJKMNP-TV-Z]{26}$'),
    tipo        text        NOT NULL CHECK (tipo IN ('secreta', 'publica')),
    hash        bytea       NOT NULL CHECK (octet_length(hash) = 32),
    prefijo     text        NOT NULL CHECK (prefijo ~ '^vc_(sec|pub)_[A-Za-z0-9_-]{4}$'),
    origenes    text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(origenes) <= 20),
    creada_en   timestamptz NOT NULL,
    revocada_en timestamptz,
    PRIMARY KEY (tenant_id, clave_id),
    CHECK ((tipo = 'publica') = (cardinality(origenes) > 0)),
    CHECK ((tipo = 'publica') = (clave_id LIKE 'cpw\_%'))
);
-- El hash identifica la credencial sin saber el tenant (búsqueda global).
CREATE UNIQUE INDEX claves_api_por_hash ON vc.claves_api (hash);

-- Enlace opaco del profesional (BRIEF decisión 2, R62).
CREATE TABLE vc.enlaces (
    tenant_id   uuid        NOT NULL,
    id_publico  text COLLATE "C" NOT NULL CHECK (id_publico ~ '^[A-Za-z0-9_-]{22}$'),
    asesor_id   text COLLATE "C" NOT NULL,
    creado_en   timestamptz NOT NULL,
    revocado_en timestamptz,
    PRIMARY KEY (tenant_id, id_publico),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

-- Token de una sola sesión (vc_ses_), emitido por crearSesion. Cae con su
-- sesión (retención).
CREATE TABLE vc.tokens_sesion (
    tenant_id   uuid        NOT NULL,
    hash        bytea       NOT NULL CHECK (octet_length(hash) = 32),
    sesion_id   text COLLATE "C" NOT NULL,
    emitido_en  timestamptz NOT NULL,
    vence_en    timestamptz NOT NULL,
    revocado_en timestamptz,
    PRIMARY KEY (tenant_id, sesion_id, hash),
    FOREIGN KEY (tenant_id, sesion_id) REFERENCES vc.sesiones (tenant_id, sesion_id) ON DELETE CASCADE,
    CHECK (vence_en > emitido_en)
);
CREATE UNIQUE INDEX tokens_sesion_por_hash ON vc.tokens_sesion (hash);

-- Uso del mes y simultáneas por tenant (cupo, R56/R57).
CREATE INDEX sesiones_por_creacion ON vc.sesiones (tenant_id, creada_en);

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['claves_api', 'enlaces', 'tokens_sesion']
    LOOP
        EXECUTE format('ALTER TABLE vc.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE vc.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY aislamiento_por_tenant ON vc.%I
                            USING (tenant_id = vc.tenant_actual())
                            WITH CHECK (tenant_id = vc.tenant_actual())', t);
    END LOOP;
END
$$;

-- Autenticación: la credencial llega SIN tenant; el tenant sale de ella
-- (ADR 0005 §3). Estas dos funciones son la única forma de buscar por hash
-- entre tenants y devuelven solo la fila que coincide con el hash exacto (un
-- HMAC de 256 bits: no se puede enumerar). Corren como el dueño, con una
-- política de solo lectura restringida a él.
CREATE POLICY dueno_autentica ON vc.claves_api FOR SELECT TO CURRENT_USER USING (true);
CREATE POLICY dueno_autentica ON vc.tokens_sesion FOR SELECT TO CURRENT_USER USING (true);

CREATE FUNCTION vc.buscar_clave(p_hash bytea)
    RETURNS TABLE (tenant_id uuid, clave_id text, tipo text, origenes text[], revocada boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$ SELECT c.tenant_id, c.clave_id, c.tipo, c.origenes, c.revocada_en IS NOT NULL
          FROM vc.claves_api c WHERE c.hash = p_hash $$;

CREATE FUNCTION vc.buscar_token_sesion(p_hash bytea)
    RETURNS TABLE (tenant_id uuid, sesion_id text, vence_en timestamptz, revocado boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$ SELECT t.tenant_id, t.sesion_id, t.vence_en, t.revocado_en IS NOT NULL
          FROM vc.tokens_sesion t WHERE t.hash = p_hash $$;

REVOKE ALL ON FUNCTION vc.buscar_clave(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc.buscar_token_sesion(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vc.buscar_clave(bytea) TO vc_api;
GRANT EXECUTE ON FUNCTION vc.buscar_token_sesion(bytea) TO vc_api;

GRANT SELECT, INSERT ON vc.claves_api TO vc_api;
GRANT UPDATE (revocada_en) ON vc.claves_api TO vc_api;
GRANT SELECT, INSERT ON vc.enlaces TO vc_api;
GRANT UPDATE (revocado_en) ON vc.enlaces TO vc_api;
GRANT SELECT, INSERT ON vc.tokens_sesion TO vc_api;
GRANT UPDATE (revocado_en) ON vc.tokens_sesion TO vc_api;
