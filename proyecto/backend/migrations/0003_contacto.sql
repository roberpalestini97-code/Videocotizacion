-- 0003 · Contacto opcional del cliente (R68), solo-anexar.
--
-- Mismas reglas que 0002: tenant_id NOT NULL, RLS + FORCE, privilegios mínimos
-- de vc_api (INSERT y SELECT; sin UPDATE ni DELETE). La fila cae solo en
-- cascada cuando vence la sesión. El texto legal del aviso sigue a validar
-- con abogado: acá se guarda la versión, no un texto inventado.
-- Reversión: 0003_contacto.revertir.sql (manual, rol dueño vc_dueno).

CREATE TABLE vc.contactos (
    tenant_id         uuid        NOT NULL,
    sesion_id         text COLLATE "C" NOT NULL CHECK (sesion_id ~ '^ses_[0-9A-HJKMNP-TV-Z]{26}$'),
    asesor_id         text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    nombre            text        NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80 AND nombre !~ '[<>]'),
    telefono          text        CHECK (telefono ~ '^\+[1-9][0-9]{7,14}$'),
    email             text        CHECK (email IS NULL OR (char_length(email) BETWEEN 3 AND 254 AND email ~ '^[^@<>]+@[^@<>]+$')),
    preferencia       text        CHECK (preferencia IS NULL OR preferencia IN ('whatsapp', 'llamada', 'email')),
    aviso_version     text        NOT NULL CHECK (aviso_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$'),
    registrado_en     timestamptz NOT NULL,
    borrar_despues_de timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, sesion_id),
    FOREIGN KEY (tenant_id, sesion_id) REFERENCES vc.sesiones (tenant_id, sesion_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id),
    CHECK (telefono IS NOT NULL OR email IS NOT NULL),
    CHECK (borrar_despues_de > registrado_en)
);

ALTER TABLE vc.contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vc.contactos FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_tenant ON vc.contactos
    USING (tenant_id = vc.tenant_actual())
    WITH CHECK (tenant_id = vc.tenant_actual());

-- La API no tiene UPDATE. El trigger es la misma traba que en consentimientos.
CREATE TRIGGER contactos_solo_anexar BEFORE UPDATE ON vc.contactos
    FOR EACH ROW EXECUTE FUNCTION vc.impedir_modificacion();

GRANT SELECT, INSERT ON vc.contactos TO vc_api;
