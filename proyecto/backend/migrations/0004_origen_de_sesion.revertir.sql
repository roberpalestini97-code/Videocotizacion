-- Reversión manual de 0004. Rol dueño vc_dueno.
BEGIN;
DROP POLICY dueno_lee_handshake ON vc.sesiones;
DROP FUNCTION vc.buscar_sesion_medios(text);
ALTER TABLE vc.sesiones DROP CONSTRAINT sesiones_origenes_de_la_clave;
ALTER TABLE vc.sesiones DROP COLUMN origenes;
ALTER TABLE vc.sesiones DROP COLUMN clave_id;
DELETE FROM vc_meta.migraciones WHERE version = '0004';
COMMIT;
