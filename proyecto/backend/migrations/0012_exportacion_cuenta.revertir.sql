-- Reversión manual de 0012. Rol dueño vc_dueno.
BEGIN;
DROP TABLE vc.lecturas;
DROP TABLE vc.consentimientos_asesor;
DELETE FROM vc_meta.migraciones WHERE version = '0012';
COMMIT;
