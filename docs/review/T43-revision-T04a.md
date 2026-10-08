# Revisión T43 · T03 + T04a (backend Go: esquema PostgreSQL con RLS, almacén, migrador, arranque, retención)
Revisor: rev (Sonnet 5.5), distinto del autor: go (Opus) · 2026-10-08 · commit b03730e (rama `respaldo`)

**Veredicto: APROBADA CON CAMBIOS.** No encontré fuga entre tenants, secreto expuesto ni precio fuera de Go. No hay hallazgos CRÍTICOS ni ALTOS. Quedan 3 MEDIOS que tocan seguridad o datos personales (H1, H2, H3, obligatorios, acotados) y el resto BAJOS (sugeridos).

## Comandos corridos
- `gofmt -l .` y `go vet ./...`: sin salida. `golangci-lint run ./...`: 0 issues (config por defecto, no hay `.golangci.yml`). `go mod verify`: ok (solo contra el caché local).
- `PG_PRUEBA_URL=... go test -race -count=1 ./...`: todo `ok`. Con `-v` en almacen, migrador, arranque, retención y cmd/api: 0 SKIP.
- SQL a mano como `vc_api` en una base propia (`rev_t43`, ya borrada; no toqué otras): `SET ROLE`/`SET SESSION AUTHORIZATION vc_dueno`, `CREATE TABLE` en `public`, `CREATE TEMP`, `CREATE SCHEMA`, `CREATE FUNCTION` en `vc`, `CREATE OR REPLACE vc.tenant_actual`, `ALTER FUNCTION` del definer, `CREATE OPERATOR`, `COPY ... TO PROGRAM`/archivo, `pg_read_file`, `ALTER ROLE ... SET app.tenant_id`, `ALTER ROLE ... BYPASSRLS/SUPERUSER`, `GRANT ALL`: todo denegado. Sin tenant: 0 filas en `tenants`. `vc.tenants_para_retencion()` devuelve solo ids. Única cosa permitida fuera de lo esperado: `ALTER ROLE vc_api SET search_path` sobre sí mismo (sin efecto: `public` no es escribible; lo reviertí).
- Catálogo: las 7 tablas `vc.*` tienen `relrowsecurity` y `relforcerowsecurity` en true, `tenant_id` NOT NULL, una sola política `ALL` con `USING` y `WITH CHECK` contra `vc.tenant_actual()`. Hay además `dueno_lista_tenants` (SELECT, solo `vc_dueno`). GRANTs de `vc_api`: tenants/asesores/consentimientos/items/registro_borrados `SELECT,INSERT`; sesiones y cotizaciones `SELECT,INSERT,DELETE` (+ `UPDATE` de 5 columnas en sesiones); `SELECT` en `vc_meta.migraciones`. Sin TRUNCATE ni REFERENCES. El definer corre como `vc_dueno`, con `search_path=pg_catalog, pg_temp`.
- Estrés de aislamiento (en copia, no está en el repo): 16 goroutines × 400 iteraciones alternando tenants A/B con pool de 2 conexiones, `-race`: 0 fugas.
- Migrador: 4 `api migrar` simultáneos sobre base vacía (todos terminan bien, uno aplica); como superusuario y como `vc_api` se niega; con `sha256` alterado frena; segunda corrida idempotente.
- Logs: `api servir` con clave mala, host inexistente y rol dueño: la clave no aparece (sí host/usuario/base); la línea de arranque muestra `db_url: [REDACTADO]`.
- EXPLAIN del listado en 30.000 sesiones: usa `sesiones_por_asesor` (S07 ok con el plan custom), ver H5. `sesiones_por_vencimiento` se usa en la retención.
- Parseo de `sslmode`: probé 4 DSN contra `pgconn.ParseConfig` (ver H6).

## Mutaciones (en copias fuera del repo; "detectada" = alguna prueba falla)
| # | Mutación | Resultado |
|---|---|---|
| M1 | sacar `FORCE ROW LEVEL SECURITY` (todas) | detectada (TestArranqueSeguro, TestRLSConSQLDirecto, TestPoolNoArrastraTenant, conformidad) |
| M31 | sacar `FORCE` solo en `registro_borrados` | detectada |
| M2 | política `USING (true)` | detectada |
| M3 | `WITH CHECK (true)` | detectada |
| M4 | política del dueño `TO PUBLIC USING (true)` | detectada |
| M6 | sacar `NULLIF` de `tenant_actual()` | detectada |
| M7 | `GRANT DELETE` en consentimientos | detectada |
| M8 / M13 | sacar chequeo de superusuario / de BYPASSRLS al arrancar | detectadas |
| M9b | migrador sin comparar SHA-256 | detectada |
| M11 | 23505 → `error_interno` | detectada |
| M15 | retención con `<` en vez de `<=` | detectada |
| M17 | `Secreto.LogValue` devuelve el valor | detectada |
| M25 | retención sin constancia | detectada |
| M27 | keyset inclusivo | detectada |
| M28 | sin `MaxBytesReader` | detectada |
| **M5** | `set_config('app.tenant_id', $1, **false**)` (SET de sesión) | **SOBREVIVE** (H1) |
| **M32** | `GRANT TRUNCATE` en `items_cotizacion` | **SOBREVIVE** (H2) |
| **M33** | `GRANT UPDATE` en `cotizaciones` | **SOBREVIVE** (H2) |
| **M12** | definer sin `SET search_path` | **SOBREVIVE** (H3) |
| M19 | `tenants_para_retencion` sin `REVOKE ... FROM PUBLIC` | sobrevive (H3) |
| **M10** | migrador sin advisory lock | **SOBREVIVE** (H7) |
| M14 | sacar el chequeo "miembro del dueño de la base" | sobrevive porque el chequeo de "dueño de objetos" lo cubre; redundante, sin impacto |
| M30 | sacar `tenant_id = $1` del WHERE de `LeerSesion` | sobrevive: lo cubre RLS (esperado; la "segunda capa" no tiene prueba propia) |
Descartadas por mal armadas: M21 (no compila), M29 (equivalente).

## Hallazgos

### H1 · La prueba del pool no detecta `SET` de sesión en vez de `SET LOCAL` (R6)
- Severidad: MEDIA (toca aislamiento entre tenants)
- Ítem violado: error amplio 6 y 7; G06; S03
- Evidencia: `internal/almacen/postgres/postgres.go:194` usa `set_config(..., true)` (correcto). Cambiarlo a `false` deja todas las pruebas en verde (M5). `TestPoolNoArrastraTenant` (`postgres_test.go:369`) alterna tenants, pero cada transacción vuelve a fijar su tenant; la parte "fuera de una transacción" (`:386`) usa un `pgxpool` propio, no el del almacén, así que no prueba el código de producción.
- Impacto: hoy no hay fuga (todo pasa por `enTenant`, y mi estrés lo confirma), pero cualquier consulta futura fuera de `enTenant` (como `TenantsParaRetencion`, que usa el pool directo) heredaría el último tenant sin que ninguna prueba avise.
- Corrección: OBLIGATORIA. Probar con el pool del propio almacén (hook de prueba o `ConexionesMax: 1` y una consulta `current_setting('app.tenant_id', true)` sobre la misma conexión justo después de `LeerSesion`) que queda vacío. Opcional: `DISCARD ALL`/`RESET` en `AfterRelease` del pool.
- Prueba de cierre: repetir M5 y ver la prueba en rojo.

### H2 · Los privilegios de `vc_api` solo se prueban por ejemplos; un GRANT de más pasa
- Severidad: MEDIA (TRUNCATE no respeta RLS: borraría datos de todos los tenants; UPDATE de cotizaciones permitiría alterar presupuestos)
- Ítem violado: S02; ADR 0004 §3 ("solo los privilegios DML necesarios por tabla"); error amplio 6
- Evidencia: `migrations/0001_esquema_inicial.sql:198-205`. M32 y M33 sobreviven; el subtest `privilegios_minimos` (`postgres_test.go:292`) solo intenta 8 sentencias puntuales (TRUNCATE solo sobre `sesiones`). `VerificarArranque` (`postgres.go:83`) no mira privilegios.
- Impacto: un GRANT agregado por error en una migración futura no lo detecta nadie.
- Corrección: OBLIGATORIA. Prueba (y, mejor, chequeo de arranque) que enumere con `has_table_privilege`/`has_column_privilege` todo lo que `vc_api` tiene en `vc.*` y lo compare con una tabla permitida, fallando ante cualquier extra, en especial TRUNCATE, REFERENCES, TRIGGER y UPDATE no listado.
- Prueba de cierre: M32 y M33 en rojo.

### H3 · Función SECURITY DEFINER y política del dueño sin pruebas de endurecimiento
- Severidad: MEDIA (la parte de datos personales es BAJA; el definer expone solo ids de tenant)
- Ítem violado: S01/S03 (superficie de excepción a RLS); ADR 0004 consecuencias ("camino explícito y auditado")
- Evidencia: `0001_esquema_inicial.sql:188-194`. El diseño es correcto (probé que `vc_api` no puede modificarla; `search_path` fijo; solo ids). Pero M12 (sin `search_path`) y M19 (sin `REVOKE ... FROM PUBLIC`) sobreviven, y ninguna prueba verifica `proconfig`, `prosecdef`, `proowner` ni `proacl`. Además, la función entrega a cualquier proceso con `vc_api` la lista de todos los tenants (no es un secreto, pero ADR 0005 pide no confirmar existencia entre tenants); está declarado en C7 y lo acepto, falta dejarlo escrito en el ADR.
- Corrección: OBLIGATORIA (la prueba); SUGERIDA (anotar en ADR 0004 que la API conoce los ids de todos los tenants y que el camino de retención no se expone por HTTP). Prueba: consulta a `pg_proc` que exija `prosecdef`, `proconfig` con `search_path=pg_catalog, pg_temp`, dueño `vc_dueno` y ACL sin PUBLIC; que sea la única función SECURITY DEFINER del esquema `vc`.
- Prueba de cierre: M12 y M19 en rojo.

### H4 · Retención: `asesores` no se borra y `consentimientos.borrar_despues_de` es una columna muerta
- Severidad: MEDIA (datos personales; plazos a validar con abogado)
- Ítem violado: S09; ADR 0004 §8 ("cada tabla con datos personales tiene `borrar_despues_de`; un job diario borra lo vencido"); error amplio 11
- Evidencia: `postgres.go:552-582`: solo borra `cotizaciones` y `sesiones` (consentimientos e ítems por cascada). `vc.asesores` guarda email y WhatsApp y tiene `borrar_despues_de` (`0001:56`) pero nunca se borra (declarado como C5). `vc.consentimientos.borrar_despues_de` (`0001:93`) no se evalúa nunca: el consentimiento muere con la sesión (C2). Si un día una cotización tiene un plazo mayor que su sesión, la cascada la borra antes de su fecha.
- Impacto: datos personales de asesores sin borrado real aunque tengan fecha; lo que hace el job es lo que dice el ADR para sesión/consulta, y no borra nada de más (verificado en `conformidad` y en M15).
- Corrección: OBLIGATORIA decidir (arq/seg) antes de T04b: borrar `asesores` vencidos (hoy ninguna FK de sesiones lo permite sin borrar sus sesiones; hace falta definir qué pasa) o documentar en el ADR que el asesor se borra solo por ARCO; y agregar un CHECK/trigger que impida `cotizaciones.borrar_despues_de > sesiones.borrar_despues_de` o retirar la columna del consentimiento.
- Prueba de cierre: caso de conformidad con asesor vencido y con consentimiento de plazo distinto.

### H5 · El listado keyset puede degradarse a recorrer desde el principio con plan genérico
- Severidad: MEDIA (S07; rendimiento, no seguridad)
- Ítem violado: S07
- Evidencia: `postgres.go:370`: `AND ($3::boolean OR (creada_en, sesion_id) < ($4, $5))`. Con `plan_cache_mode = force_generic_plan` el EXPLAIN muestra `Filter: ($3 OR (ROW(...) < ROW($4,$5)))` y `Rows Removed by Filter: 28999` en 30.000 filas: el cursor deja de ser condición de índice. pgx prepara las consultas y PostgreSQL pasa a plan genérico solo tras 5 ejecuciones.
- Corrección: SUGERIDA. Dos consultas (primera página sin cursor / páginas siguientes con la condición fija) en vez del `OR` con booleano.
- Prueba de cierre: EXPLAIN con plan genérico muestra `ROW(...) <` dentro de `Index Cond`.

### H6 · Verificación de TLS y de rol: huecos menores
- Severidad: BAJA
- Evidencia: (a) `config.go:199` `sslmode()` toma el primer `sslmode=` en formato clave=valor, pero pgx usa el último: `host=h sslmode=verify-full sslmode=disable` pasa la configuración y conecta sin TLS (probado con `ParseConfig`). `api servir`/`retencion` lo atajan con `pg_stat_ssl`; `api migrar` no tiene chequeo de conexión. (b) Acepta `verify-ca` aunque el informe dice `verify-full` (no valida el nombre del servidor). (c) `VerificarArranque` (`postgres.go:83`) no mira `rolcreaterole`, `rolcreatedb`, `rolreplication`, membresía en roles predefinidos, ni que cada tabla tenga una política no trivial: una migración futura con `USING (true)` arranca igual y solo la salva la suite.
- Corrección: SUGERIDA. Rechazar `sslmode` repetido, exigir solo `verify-full`, agregar `pg_stat_ssl` al migrador, y chequear atributos extra del rol y `pg_policies.qual` contra la forma esperada.

### H7 · Migrador: bloqueo sin prueba, orden de chequeos, CRLF
- Severidad: BAJA
- Evidencia: M10 sobrevive (`migrador.go:87`); la concurrencia la probé a mano (4 procesos, ok) pero no está en la suite (el informe lo declara). `migrador.go:133-137` detecta "la base tiene una migración que este binario no conoce" después de aplicar las pendientes. No detecta huecos de numeración. El SHA-256 se calcula sobre los bytes embebidos: el BRIEF copia el proyecto a Windows; si Git convierte `.sql` a CRLF, el hash cambia y `api migrar` frena con "ya aplicada cambió". No hay `.gitattributes`. Sin timeout en la toma del lock (espera indefinida si otro proceso lo retiene).
- Corrección: SUGERIDA. Prueba de concurrencia; mover el chequeo de versión desconocida antes de aplicar; `.gitattributes` con `*.sql text eol=lf`; `lock_timeout`.

### H8 · `pgprueba` crea roles con clave fija en cualquier clúster al que apunte `PG_PRUEBA_URL`
- Severidad: BAJA
- Evidencia: `pgprueba.go:34,148-160`: `CREATE ROLE vc_dueno/vc_api ... PASSWORD 'vc-prueba-solo-local'` si no existen; solo documenta "no usar contra un clúster real". Dejé el clúster como lo encontré (las bases temporales de las pruebas se borran solas).
- Corrección: SUGERIDA. Exigir host `127.0.0.1`/`localhost` o una variable explícita `PG_PRUEBA_DESCARTABLE=1`.

### H9 · Mapeo de errores y detalles
- Severidad: BAJA
- Evidencia: `postgres.go:221-232`. 23505→`estado_invalido`, 23503→`no_encontrado`, 42501→`error_interno` están bien para la API actual (probados en `traducir_test.go`; 42501 es un bug del código, no del cliente; con tenant ajeno no se filtra existencia porque el tenant de la fila lo fija la política). Dos matices: el cliente no puede distinguir "ya existe" de "estado inválido" (C4, falta un código `conflicto`); y `context.Canceled` (el cliente cortó) se informa como `servicio_no_disponible` a nivel ERROR, lo que ensucia las alertas. El cuerpo al cliente nunca lleva la causa (probado); la causa va al log y los mensajes de pgx no incluyen valores de fila (`PgError.Error()` omite `Detail`), salvo 22P02, que repite el valor inválido: negligible porque todo se valida antes.
- Corrección: SUGERIDA.

### H10 · Calidad menor
- Severidad: BAJA
- `proveedores.go:108` `Conjunto.Completo()` solo lo usa una prueba; `memoria.go:412` `RegistroBorrados` es código de producción para pruebas. `arranque_test.go` y `retencion_test.go` usan `time.Sleep(30ms)` para dar tiempo a la retención (frágil bajo carga; `-race` pasó 2 veces). `retencion.Programar` lanza una pasada completa al arrancar en cada instancia (con varias instancias se duplica el trabajo y las constancias). `registro_borrados` crece una fila por tenant por día sin plazo propio. Conteos de `BorrarVencidos` se calculan con un SELECT previo y no con `DELETE ... RETURNING`: con concurrencia en READ COMMITTED la constancia puede diferir de lo borrado. `/listo` sin autenticación hace un Ping al pool por pedido (sin límite de tasa hasta T04b) y el servidor escucha en `:8080` por defecto.
- Corrección: SUGERIDA.

## Fuera del alcance de 0001 (informativo, no es hallazgo)
El esquema no incluye todavía registro de lecturas (ADR 0004 §9), claves de API con hash y orígenes (ADR 0005 §2), ni consumo/cuotas. Cuando lleguen, cada tabla nueva debe entrar a las pruebas de RLS (`tablas` en `postgres_test.go:27` es una lista escrita a mano: conviene derivarla del catálogo, así una tabla olvidada falla).

## Respuestas a los puntos pedidos
1. RLS: todas con ENABLE+FORCE, `tenant_id` NOT NULL, política única restrictiva en la práctica, sin permisivas extra salvo la del dueño (verificada). GRANTs correctos hoy, sin prueba exhaustiva (H2). Definer correcto, sin prueba (H3).
2. Arrastre de tenant: no hay hoy (SET LOCAL vía `set_config(...,true)` en transacción con `pgx.BeginFunc`; 12.800 lecturas concurrentes sin fuga), pero la prueba no lo garantiza (H1).
3. Inyección SQL: ninguna. Todo parametrizado; lo único concatenado son constantes (`columnasSesion`); `pgx.Identifier.Sanitize` y `format('%I')` en lo dinámico.
4. Arranque: superusuario, BYPASSRLS, dueño/miembro del dueño, tabla sin FORCE o sin `tenant_id`, versión de esquema y TLS (con `pg_stat_ssl`) se verifican y están probados. Huecos en H6.
5. Migrador: SHA-256 comparado y probado, advisory lock funciona (manual) pero sin prueba, se niega como superusuario/`vc_api`/BYPASSRLS. No verifica que el rol sea realmente el dueño de la base (H7).
6. Errores PG: ver H9.
7. Secretos: sin hallazgos. `Secreto` probado, DSN inválido no se propaga, `Migrar` no filtra la clave.
8. Retención: borra lo que dice el ADR y nada más para sesión/consentimiento/cotización/ítems; no cubre asesores (H4).
9. Calidad: H10; sin goroutines huérfanas (`Servir` cancela y espera la retención), sin errores ignorados sin justificación (los `_ =` son cierres/rollbacks diferidos).

## No probado
TLS real hacia la base (el clúster de prueba no tiene TLS; solo vi que `ExigirTLS` rechaza una conexión sin TLS), Docker, `govulncheck` y `staticcheck` (no instalados; golangci-lint por defecto sí corrió), `go.sum` contra `sum.golang.org` (go lo armó con `GOSUMDB=off`; `go mod verify` solo compara con el caché), carga real y `EXPLAIN` con datos de producción, varias instancias de `api servir` con retención simultánea, backups/restauración, `proveedores/falsos`, `salud`, `reloj`, `dominio`, `cotizador` y `errores` (solo vi que sus pruebas pasan), `almacen/memoria` (leí el comienzo y la batería de conformidad, no línea por línea).

## Condición del veredicto
Cerrar H1, H2, H3 y decidir H4 (arq + seg) antes de T04b; H5 a H10 sugeridos. go reabre a rev para la verificación de H1–H3 (mutaciones M5, M32, M33, M12, M19 en rojo).
