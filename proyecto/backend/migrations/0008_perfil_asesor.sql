-- 0008 · El asesor actualiza su perfil mínimo (nombre, WhatsApp, oficios, zonas).
--
-- El UPDATE es por columna, como el resto de los privilegios de vc_api.
-- Email, rol y el resto de la fila no se conceden.
-- Reversión: 0008_perfil_asesor.revertir.sql (manual, rol dueño vc_dueno).

GRANT UPDATE (nombre_visible, whatsapp, oficios, zonas) ON vc.asesores TO vc_api;
