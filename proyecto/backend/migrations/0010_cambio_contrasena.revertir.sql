-- Reversión manual de 0010. Rol dueño vc_dueno.
BEGIN;
REVOKE UPDATE (hash, sal, memoria_kib, iteraciones, paralelismo, creada_en)
    ON vc.contrasenas_asesor FROM vc_api;
DELETE FROM vc_meta.migraciones WHERE version = '0010';
COMMIT;
