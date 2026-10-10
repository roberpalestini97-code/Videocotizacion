-- Reversión manual de 0009. Rol dueño vc_dueno.
BEGIN;
REVOKE UPDATE (reautenticado_hasta) ON vc.ingresos_panel FROM vc_api;
ALTER TABLE vc.ingresos_panel DROP COLUMN reautenticado_hasta;
DELETE FROM vc_meta.migraciones WHERE version = '0009';
COMMIT;
