-- Reversión manual de 0002 (borra credenciales, enlaces y tokens). Rol dueño.
BEGIN;
DROP FUNCTION vc.buscar_token_sesion(bytea);
DROP FUNCTION vc.buscar_clave(bytea);
DROP TABLE vc.tokens_sesion;
DROP TABLE vc.enlaces;
DROP TABLE vc.claves_api;
DROP INDEX vc.sesiones_por_creacion;
DELETE FROM vc_meta.migraciones WHERE version = '0002';
COMMIT;
