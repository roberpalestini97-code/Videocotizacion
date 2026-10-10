-- Reversión manual de 0003 (borra los contactos). Rol dueño vc_dueno.
BEGIN;
DROP TABLE vc.contactos;
DELETE FROM vc_meta.migraciones WHERE version = '0003';
COMMIT;
