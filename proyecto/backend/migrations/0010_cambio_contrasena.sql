-- 0010 · El asesor reemplaza su hash Argon2id.
--
-- El UPDATE es por columna: hash, sal y los parámetros. El email no se
-- concede. Revocar las otras sesiones usa revocada_en, que ya estaba.
-- Reversión: 0010_cambio_contrasena.revertir.sql (manual, rol dueño vc_dueno).

GRANT UPDATE (hash, sal, memoria_kib, iteraciones, paralelismo, creada_en)
    ON vc.contrasenas_asesor TO vc_api;
