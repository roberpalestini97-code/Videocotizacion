-- Reversión manual de 0006. Rol dueño vc_dueno.
BEGIN;
DROP FUNCTION vc.buscar_ingreso_panel(bytea);
DROP POLICY dueno_lee_ingreso ON vc.ingresos_panel;
ALTER TABLE vc.ingresos_panel
    DROP COLUMN preliminar,
    DROP COLUMN revocada_en,
    DROP COLUMN vence_inactividad;
DROP TABLE vc.pasos_totp;
DROP TABLE vc.codigos_recuperacion;
DROP TABLE vc.secretos_totp;
DELETE FROM vc_meta.migraciones WHERE version = '0006';
COMMIT;
