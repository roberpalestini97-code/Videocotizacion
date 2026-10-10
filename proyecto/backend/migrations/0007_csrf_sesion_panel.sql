-- 0007 · CSRF de la sesión del panel, cifrado, para devolverlo al recargar.
--
-- El token no se guarda en claro: es nonce || ciphertext AES-GCM. La clave
-- AES sale de CLAVE_HMAC en la aplicación y no es la del secreto TOTP. La
-- cookie sigue siendo solo HMAC. La columna es nula en la cookie preliminar.
-- Reversión: 0007_csrf_sesion_panel.revertir.sql (manual, rol dueño vc_dueno).

ALTER TABLE vc.ingresos_panel
    ADD COLUMN csrf_cifrado bytea
    CHECK (csrf_cifrado IS NULL OR octet_length(csrf_cifrado) BETWEEN 29 AND 128);
