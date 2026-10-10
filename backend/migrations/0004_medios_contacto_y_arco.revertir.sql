-- Reversión manual de 0004 (borra tokens de medios, contactos y solicitudes ARCO). Rol dueño.
BEGIN;
DROP TABLE vc.solicitudes_arco;
DROP TABLE vc.contactos;
DROP TABLE vc.tokens_medios;
DELETE FROM vc_meta.migraciones WHERE version = '0004';
COMMIT;
