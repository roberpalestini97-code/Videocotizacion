-- Reversión manual de 0013. Rol dueño vc_dueno.

ALTER TABLE vc.sesiones DROP COLUMN IF EXISTS avatar_id;

DELETE FROM vc_meta.migraciones WHERE version = '0013';
