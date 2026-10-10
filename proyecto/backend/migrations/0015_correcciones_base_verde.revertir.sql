-- Reversión manual de 0015. Rol dueño vc_dueno.
-- Ojo: volver salida a jsonb falla si alguna fila tiene \u0000 en un texto.
BEGIN;
ALTER TABLE vc.respuestas_modelo ALTER COLUMN salida TYPE jsonb USING salida::jsonb;
CREATE INDEX sesiones_por_creacion ON vc.sesiones (tenant_id, creada_en);
DROP POLICY dueno_lee_handshake ON vc.sesiones;
CREATE POLICY dueno_lee_handshake ON vc.sesiones
    FOR SELECT TO CURRENT_USER
    USING (true);
DELETE FROM vc_meta.migraciones WHERE version = '0015';
COMMIT;
