-- Reversión manual de 0007. Rol dueño vc_dueno.
BEGIN;
ALTER TABLE vc.ingresos_panel DROP COLUMN csrf_cifrado;
DELETE FROM vc_meta.migraciones WHERE version = '0007';
COMMIT;
