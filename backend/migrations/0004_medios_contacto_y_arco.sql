-- 0004 · Token de medios, contacto del cliente y solicitudes ARCO (T04b parte 2a).
--
-- Mismas reglas que 0001/0002: tenant_id NOT NULL, RLS + FORCE con la política
-- de aislamiento, privilegios mínimos (lista exacta en endurecimiento.go).
-- Reversión: 0004_medios_contacto_y_arco.revertir.sql (manual, rol dueño).

-- Token del WebSocket de medios (R32): solo el HMAC; vida 5..60 s; un uso
-- (usado_en lo marca el WebSocket en la parte 2b). Cae con su sesión.
CREATE TABLE vc.tokens_medios (
    tenant_id   uuid        NOT NULL,
    hash        bytea       NOT NULL CHECK (octet_length(hash) = 32),
    sesion_id   text COLLATE "C" NOT NULL,
    emitido_en  timestamptz NOT NULL,
    vence_en    timestamptz NOT NULL,
    usado_en    timestamptz,
    revocado_en timestamptz,
    PRIMARY KEY (tenant_id, sesion_id, hash),
    FOREIGN KEY (tenant_id, sesion_id) REFERENCES vc.sesiones (tenant_id, sesion_id) ON DELETE CASCADE,
    CHECK (vence_en > emitido_en AND vence_en <= emitido_en + interval '60 seconds')
);
CREATE UNIQUE INDEX tokens_medios_por_hash ON vc.tokens_medios (hash);

-- Contacto opcional del cliente (R68): datos personales con consentimiento
-- específico y versionado. Uno por sesión; cae con la sesión (retención y
-- supresión ARCO).
CREATE TABLE vc.contactos (
    tenant_id          uuid        NOT NULL,
    sesion_id          text COLLATE "C" NOT NULL,
    nombre             text        NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
    telefono           text        CHECK (telefono ~ '^\+[1-9][0-9]{7,14}$'),
    email              text        CHECK (char_length(email) BETWEEN 3 AND 254),
    preferencia        text        CHECK (preferencia IN ('whatsapp', 'llamada', 'email')),
    aviso_version      text        NOT NULL CHECK (aviso_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$'),
    finalidad          text        NOT NULL CHECK (finalidad = 'que_el_profesional_te_contacte'),
    consentido_en      timestamptz NOT NULL,
    borrar_despues_de  timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, sesion_id),
    FOREIGN KEY (tenant_id, sesion_id) REFERENCES vc.sesiones (tenant_id, sesion_id) ON DELETE CASCADE,
    CHECK (telefono IS NOT NULL OR email IS NOT NULL),
    CHECK (borrar_despues_de > consentido_en)
);
CREATE TRIGGER contactos_solo_anexar BEFORE UPDATE ON vc.contactos
    FOR EACH ROW EXECUTE FUNCTION vc.impedir_modificacion();

-- Solicitudes ARCO (R22–R24) ANONIMIZADAS: sin teléfono, email ni código de
-- referencia. sesion_id y detalle solo cuando hubo coincidencia y queda algo
-- por atender (acceso, rectificación). Solo-anexar.
CREATE TABLE vc.solicitudes_arco (
    tenant_id       uuid        NOT NULL REFERENCES vc.tenants (tenant_id),
    solicitud_id    text COLLATE "C" NOT NULL CHECK (solicitud_id ~ '^arc_[0-9A-HJKMNP-TV-Z]{26}$'),
    tipo            text        NOT NULL CHECK (tipo IN ('acceso', 'rectificacion', 'supresion')),
    recibida_en     timestamptz NOT NULL,
    plazo_vence_en  timestamptz NOT NULL,
    resultado       text        NOT NULL CHECK (resultado IN ('pendiente', 'suprimida', 'sin_coincidencia')),
    sesion_id       text COLLATE "C" CHECK (sesion_id ~ '^ses_[0-9A-HJKMNP-TV-Z]{26}$'),
    detalle         text        CHECK (char_length(detalle) BETWEEN 1 AND 1000),
    PRIMARY KEY (tenant_id, solicitud_id),
    CHECK (plazo_vence_en > recibida_en),
    CHECK ((resultado = 'pendiente') = (sesion_id IS NOT NULL)),
    CHECK (detalle IS NULL OR (tipo = 'rectificacion' AND resultado = 'pendiente'))
);
CREATE TRIGGER solicitudes_arco_solo_anexar BEFORE UPDATE ON vc.solicitudes_arco
    FOR EACH ROW EXECUTE FUNCTION vc.impedir_modificacion();

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['tokens_medios', 'contactos', 'solicitudes_arco']
    LOOP
        EXECUTE format('ALTER TABLE vc.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE vc.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY aislamiento_por_tenant ON vc.%I
                            USING (tenant_id = vc.tenant_actual())
                            WITH CHECK (tenant_id = vc.tenant_actual())', t);
    END LOOP;
END
$$;

GRANT SELECT, INSERT ON vc.tokens_medios TO vc_api;
GRANT UPDATE (usado_en, revocado_en) ON vc.tokens_medios TO vc_api;
GRANT SELECT, INSERT ON vc.contactos TO vc_api;
GRANT SELECT, INSERT ON vc.solicitudes_arco TO vc_api;
