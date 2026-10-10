-- Reversión manual de 0011. Rol dueño vc_dueno.
BEGIN;
ALTER TABLE vc.claves_api DROP COLUMN nombre;
DELETE FROM vc_meta.migraciones WHERE version = '0011';
COMMIT;
