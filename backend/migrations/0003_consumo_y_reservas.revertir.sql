-- Reversión manual de 0003 (borra contadores, reservas y topes globales). Rol dueño.
BEGIN;
ALTER TABLE vc.claves_api DROP CONSTRAINT claves_api_origenes_formato;
DROP FUNCTION vc.topes_globales_vigentes();
DROP FUNCTION vc.reservar_cupo(uuid, text, text, date, timestamptz, integer);
DROP FUNCTION vc.liberar_cupo(text, timestamptz);
DROP TABLE vc.topes_globales;
DROP TABLE vc.consumo_global_mensual;
DROP TABLE vc.reservas_cupo;
DROP TABLE vc.consumo_asesor_diario;
DROP TABLE vc.consumo_asesor_mensual;
DROP TABLE vc.consumo_diario;
DROP TABLE vc.consumo_mensual;
ALTER TABLE vc.asesores DROP COLUMN simultaneas_tope, DROP COLUMN segundos_mes_tope;
DELETE FROM vc_meta.migraciones WHERE version = '0003';
COMMIT;
