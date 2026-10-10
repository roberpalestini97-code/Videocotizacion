-- Reversión manual de 0005 (borra hashes y cookies preliminares). Rol dueño vc_dueno.
BEGIN;
DROP FUNCTION vc.buscar_contrasena(text);
DROP TABLE vc.ingresos_panel;
DROP TABLE vc.contrasenas_asesor;
DELETE FROM vc_meta.migraciones WHERE version = '0005';
COMMIT;
