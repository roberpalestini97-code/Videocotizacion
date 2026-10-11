-- Reversión manual de 0001 (S06). El migrador NO la aplica sola: la corre un
-- operador con el rol dueño, sabiendo que BORRA TODOS LOS DATOS del esquema vc.
--   psql "$DB_URL_DUENO" -v ON_ERROR_STOP=1 -f migrations/0001_esquema_inicial.revertir.sql
BEGIN;
-- DROP SCHEMA vc CASCADE borra también los objetos de 0002..N: si siguen
-- registradas, el migrador creería que están aplicadas y no las rehace.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM vc_meta.migraciones WHERE version > '0001') THEN
        RAISE EXCEPTION 'hay migraciones posteriores a 0001 registradas: revertí antes de la última a la primera';
    END IF;
END $$;
DROP SCHEMA vc CASCADE;
REVOKE ALL ON vc_meta.migraciones FROM vc_api;
REVOKE USAGE ON SCHEMA vc_meta FROM vc_api;
DELETE FROM vc_meta.migraciones WHERE version = '0001';
COMMIT;
