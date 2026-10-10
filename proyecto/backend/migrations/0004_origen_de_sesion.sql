-- 0004 · La sesión recuerda la clave que la creó y sus Origin (R55).
--
-- No es una tabla nueva: columnas en vc.sesiones, que ya tiene RLS forzada.
-- La política extra es solo para el dueño (vc_dueno, quien corre la
-- migración) y existe para que vc.buscar_sesion_medios, SECURITY DEFINER,
-- pueda leer una fila sin app.tenant_id. vc_api no es el rol de esa política.
-- Reversión: 0004_origen_de_sesion.revertir.sql (manual, rol dueño).

ALTER TABLE vc.sesiones
    ADD COLUMN clave_id text CHECK (clave_id IS NULL OR clave_id ~ '^(cpw|cse)_[0-9A-HJKMNP-TV-Z]{26}$'),
    ADD COLUMN origenes text[] NOT NULL DEFAULT '{}';

ALTER TABLE vc.sesiones ADD CONSTRAINT sesiones_origenes_de_la_clave CHECK (
    cardinality(origenes) <= 20
    AND (
        (clave_id IS NULL AND cardinality(origenes) = 0)
        OR (clave_id LIKE 'cse\_%' AND cardinality(origenes) = 0)
        OR (clave_id LIKE 'cpw\_%' AND cardinality(origenes) BETWEEN 1 AND 20)
    )
);

-- El handshake llega sin tenant: el id de sesión (128 bits) identifica una
-- fila y la función devuelve solo estado, clave y Origin. Cero filas o más
-- de una las descarta el llamador.
CREATE FUNCTION vc.buscar_sesion_medios(p_id text)
    RETURNS TABLE (tenant_id uuid, estado text, origenes text[], clave_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$ SELECT s.tenant_id, s.estado, s.origenes, s.clave_id
          FROM vc.sesiones s WHERE s.sesion_id = p_id $$;

REVOKE ALL ON FUNCTION vc.buscar_sesion_medios(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vc.buscar_sesion_medios(text) TO vc_api;

CREATE POLICY dueno_lee_handshake ON vc.sesiones
    FOR SELECT TO CURRENT_USER
    USING (true);
