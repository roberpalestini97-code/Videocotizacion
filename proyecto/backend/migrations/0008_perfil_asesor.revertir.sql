-- Reversión manual de 0008. Rol dueño vc_dueno.
BEGIN;
REVOKE UPDATE (nombre_visible, whatsapp, oficios, zonas) ON vc.asesores FROM vc_api;
DELETE FROM vc_meta.migraciones WHERE version = '0008';
COMMIT;
