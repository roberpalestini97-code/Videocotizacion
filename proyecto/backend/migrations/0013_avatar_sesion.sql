-- 0013 · Avatar elegido al crear sesión (prompt T06 por oficio del avatar).
-- Reversión: 0013_avatar_sesion.revertir.sql (manual, rol dueño vc_dueno).

ALTER TABLE vc.sesiones
    ADD COLUMN avatar_id text NULL
    CHECK (avatar_id IS NULL OR avatar_id ~ '^av_[a-z0-9_]{2,30}$');
