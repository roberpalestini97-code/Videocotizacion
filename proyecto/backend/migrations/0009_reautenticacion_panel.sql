-- 0009 · Ventana corta de reautenticación en la sesión del panel.
--
-- reautenticado_hasta es el fin de esa ventana (R39). No alarga el
-- vencimiento absoluto ni el de inactividad. El UPDATE es solo esa columna.
-- Reversión: 0009_reautenticacion_panel.revertir.sql (manual, rol dueño vc_dueno).

ALTER TABLE vc.ingresos_panel
    ADD COLUMN reautenticado_hasta timestamptz;

GRANT UPDATE (reautenticado_hasta) ON vc.ingresos_panel TO vc_api;
