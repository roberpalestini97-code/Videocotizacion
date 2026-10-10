-- 0011 · Nombre visible de la clave pública del widget.
--
-- El valor en claro no se guarda. El nombre es el rótulo del panel.
-- Las claves ya sembradas quedan con nombre vacío.
-- Reversión: 0011_nombre_clave_widget.revertir.sql (manual, rol dueño vc_dueno).

ALTER TABLE vc.claves_api
    ADD COLUMN nombre text NOT NULL DEFAULT ''
    CHECK (char_length(nombre) <= 60 AND nombre !~ '[<>]');
