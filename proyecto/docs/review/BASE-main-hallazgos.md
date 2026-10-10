# Revisión liviana de seguridad — base `main` (rama fix/base-verde)

Fecha: 2026-10-10. Alcance: `backend/migrations` (0001–0014 publicadas + 0015 nueva), `internal/almacen` e `internal/rutas`.
Quien escribe no revisa: este documento lo escribió el agente que hizo los arreglos de `fix/base-verde`; necesita una revisión independiente.

## Cómo se revisó (evidencia)

- Migraciones 0001–0015 aplicadas como `vc_dueno` sobre PostgreSQL 16.15 local (la misma versión menor que `infra/docker-compose.yml`, `postgres:16.15-alpine`) y consulta al catálogo:
  - `pg_class`: las 19 tablas de `vc` tienen `relrowsecurity` **y** `relforcerowsecurity` y columna `tenant_id`. Ninguna sin FORCE ni sin `tenant_id`.
  - `pg_proc`: 6 funciones `SECURITY DEFINER` (`buscar_clave`, `buscar_token_sesion`, `buscar_sesion_medios`, `buscar_contrasena`, `buscar_ingreso_panel`, `tenants_para_retencion`), todas del dueño, con `search_path=pg_catalog, pg_temp` y sin `EXECUTE` para `PUBLIC`. Ninguna sin `search_path` fijo.
  - `information_schema.role_table_grants` para `vc_api`: coincide con `PrivilegiosPermitidos` (`internal/almacen/postgres/endurecimiento.go`), que el arranque exige de forma exacta (`TestPrivilegiosExactosDeLaAPI`). No hay `UPDATE` de tabla completa, `TRUNCATE`, `REFERENCES` ni `TRIGGER`.
- `go test -race -count=1 ./...` con `PG_PRUEBA_URL` (0 SKIP) después de los arreglos.
- Lectura de `rutas/panel_cotizacion_detalle.go`, `rutas/socket_entrada.go`, `almacen/postgres/{postgres,handshake,cupo,respuesta_modelo,endurecimiento}.go`. No es una auditoría completa de `rutas`.

## Corregidos en esta rama (migración 0015, nunca se editó una publicada)

| # | Sev. | Hallazgo | Arreglo |
|---|------|----------|---------|
| C1 | Alta | `dueno_lee_handshake` (0004) era `USING (true)` para `vc_dueno` en `vc.sesiones`: conectado como dueño sin `app.tenant_id` se veían las sesiones de todos los tenants. Rompía `TestRLSConSQLDirecto/dueno_tambien_sujeto_a_RLS_forzada`, que nunca corrió en Cursor (sin `PG_PRUEBA_URL`). No es artefacto del clúster: `pgprueba` crea `vc_dueno` `NOSUPERUSER NOBYPASSRLS`. | 0015: la política solo aplica por delegación (`session_user <> current_user`, o sea dentro de una `SECURITY DEFINER` del dueño llamada por `vc_api`). El arranque espera esa condición. Prueba nueva `TestBuscarDatosMediosPostgres` (el handshake sigue funcionando). |
| C2 | Media | `vc.respuestas_modelo.salida` era `jsonb`: reordena claves y cambia espacios (lo leído no era lo escrito, a diferencia del almacén en memoria) y **rechaza `\u0000`**, que `json.Valid` acepta. Un turno con ese texto fallaba al guardar y `socket_entrada.go` solo lo logueaba: se perdía el registro de R42. | 0015: columna `json` (valida y conserva el texto). Las filas ya guardadas quedan normalizadas. Caso `\u0000` agregado a `TestRespuestasModeloPostgres`. |
| C3 | Baja (rendimiento) | `sesiones_por_creacion` (0002, `(tenant_id, creada_en)`) no la usa ninguna consulta (el cupo filtra por `tenant_id` y `estado`, que cubre la PK), pero con un asesor por tenant el planificador la prefería para el listado keyset: `Index Cond: (tenant_id, creada_en <= $3)` + `Filter` del cursor + `Incremental Sort`. Reproducido con un experimento que la borra: el plan vuelve a `sesiones_por_asesor` con el cursor como condición de índice. Costos por defecto, no es artefacto del clúster. | 0015: `DROP INDEX vc.sesiones_por_creacion`. Si R56 llega a filtrar uso por mes, revaluar con `TestPlanDelListadoUsaElIndice`. |

## Pendientes (diseño: listados, NO arreglados)

| # | Sev. | Hallazgo | Sugerencia |
|---|------|----------|------------|
| P1 | Media | Otras cinco políticas del dueño siguen `USING (true)`: `tenants.dueno_lista_tenants`, `claves_api.dueno_autentica`, `tokens_sesion.dueno_autentica`, `contrasenas_asesor.dueno_lee_contrasena`, `ingresos_panel.dueno_lee_ingreso`. Quien se conecte con `DB_URL_DUENO` ve, sin tenant, hashes de claves, de tokens y de contraseñas de todos los tenants. | Misma condición de delegación que C1 en una migración nueva, y extender `dueno_tambien_sujeto_a_RLS_forzada` a esas tablas. Decide arquitecto. |
| P2 | Media | `versiones.prompt` del panel (`mapaSesionDetalle`) se recalcula con `prompts.MaterialTurno` sobre el markdown **actual**, no se guarda por turno. R42 pide la versión del prompt por consulta: editar un prompt (o el arreglo CRLF de esta rama) cambia lo que el panel muestra para consultas viejas. | Persistir la referencia usada en cada turno (columna en `respuestas_modelo` o en la cotización). |
| P3 | Media | El número de turno y el tope `turnosLLMMax` viven en memoria del proceso (`usoMedios` en `rutas/socket_entrada.go`). Tras un reinicio o con dos instancias, el turno vuelve a 1: la PK `(tenant_id, sesion_id, turno)` choca, `EstadoInvalido` se traga y se pierde el registro; además el tope de turnos LLM (costo) se reinicia. | Derivar el turno de la base (`max(turno)+1` en la misma transacción) y llevar el tope por sesión en la base. **T25 (feat/T13-llm-orquestador):** el turno sale de `max(turno)` de `respuestas_modelo` + 1 (con un reintento si otro socket ganó el número); el tope cuenta lo guardado + los intentos fallidos del proceso. Límite declarado: tras un reinicio no se cuentan los intentos fallidos previos (no guardan nada). |
| P4 | Baja | Si falla guardar la respuesta del modelo o la cotización del turno, `ejecutarTurnoConTexto` solo hace `Warn` y sigue: la consulta queda sin rastro de R42 y el cliente no se entera. | Cerrar el turno con error o al menos métrica/alerta. **T25:** si falla guardar la respuesta o la cotización, el cliente recibe `error` `error_interno` y NO se muestra precio; log `Error` sin datos del cliente. |
| P5 | Baja | `vc_api` tiene `INSERT` en `vc.tenants` (0001). Si el alta de tenants no es una operación de la API pública, sobra. | Confirmar uso; si es administrativa, pasarla al dueño o a un comando aparte. |
| P6 | Baja | Las reversiones `0013` y `0014` no tienen `BEGIN/COMMIT` (las demás sí): con `psql -f` una falla a mitad deja estado intermedio. | Agregar la transacción en esos archivos (son manuales, no los aplica el migrador ni cambian su SHA). |
| P7 | Info | `verificarFunciones` controla nombre, `search_path`, dueño y `PUBLIC` de las `SECURITY DEFINER`, no su cuerpo. Su comentario dice "una sola función" y hay seis. | Comparar `prosrc` (o un hash) como con `tenant_actual`; corregir el comentario. |
| P8 | Info | `vc.buscar_contrasena(email)` busca entre tenants por email (por diseño, para el ingreso al panel). Depende del límite de intentos del login, que no se revisó acá. | Revisar con la suite de abuso del panel. |
| P9 | Info | `RespuestaModelo.Validar` no acota el tamaño de `SalidaJSON` y la columna tampoco. | Tope en dominio coherente con el `max_tokens` del proveedor. |

## No probado

- Revisión completa de `internal/rutas` (autenticación del panel, CSRF, límites de tasa): solo lectura puntual de los archivos citados.
- `redocly` y `spectral` del contrato.
- Comportamiento con PgBouncer u otro pooler (la condición de C1 usa `session_user`).
