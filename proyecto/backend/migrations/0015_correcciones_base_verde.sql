-- 0015 · Correcciones que destaparon las pruebas contra PostgreSQL real
-- (en Cursor se omitían sin PG_PRUEBA_URL, así que nunca corrieron).
-- No se edita ninguna migración publicada: todo se corrige acá.
-- Reversión: 0015_correcciones_base_verde.revertir.sql (manual, rol dueño vc_dueno).

-- 1) RLS forzada también para el dueño (TestRLSConSQLDirecto/dueno_tambien_sujeto_a_RLS_forzada).
--    La política dueno_lee_handshake de 0004 era USING (true) para vc_dueno:
--    cualquier consulta del dueño sin app.tenant_id veía las sesiones de todos
--    los tenants. Ahora solo aplica cuando el dueño actúa por delegación, es
--    decir dentro de una función SECURITY DEFINER suya llamada por otro rol
--    (vc.buscar_sesion_medios desde vc_api): ahí current_user es vc_dueno y
--    session_user es quien llamó. Conectado directo como dueño, ambos son
--    vc_dueno y no ve nada sin tenant. vc_api no es el rol de la política.
--    (Una variable fijada con ALTER FUNCTION ... SET sería más precisa, pero
--    PostgreSQL no deja a un rol sin superusuario fijar una variable propia.)
DROP POLICY dueno_lee_handshake ON vc.sesiones;
CREATE POLICY dueno_lee_handshake ON vc.sesiones
    FOR SELECT TO CURRENT_USER
    USING (session_user <> current_user);

-- 2) Listado keyset por índice (TestPlanDelListadoUsaElIndice, H5 de T43).
--    sesiones_por_creacion (0002) no la usa ninguna consulta (el cupo filtra
--    solo por tenant_id y estado, que cubre la PK), pero con un solo asesor
--    por tenant el planificador la prefiere para el listado: recorre por
--    creada_en, filtra asesor y cursor, y ordena (Incremental Sort) en vez de
--    usar el cursor como condición de sesiones_por_asesor.
DROP INDEX vc.sesiones_por_creacion;

-- 3) La salida del LLM se guarda tal cual (R42, TestRespuestasModeloPostgres).
--    jsonb reordena claves, cambia espacios y rechaza \u0000 (que json.Valid
--    acepta): el INSERT de un turno válido fallaba y lo leído no era lo
--    escrito. json valida igual pero conserva el texto. Las filas ya guardadas
--    quedan como las normalizó jsonb (no se puede recuperar el original).
ALTER TABLE vc.respuestas_modelo ALTER COLUMN salida TYPE json USING salida::json;
