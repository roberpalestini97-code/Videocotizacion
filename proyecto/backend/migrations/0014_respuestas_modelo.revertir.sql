-- Reversión manual de 0014. Rol dueño vc_dueno.

DROP TABLE IF EXISTS vc.respuestas_modelo;

DELETE FROM vc_meta.migraciones WHERE version = '0014';
