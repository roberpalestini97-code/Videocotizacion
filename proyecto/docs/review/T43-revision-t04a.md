# Revisión T43 · Persistencia PostgreSQL de T04a
Revisor: GPT-5.6 Sol (distinto del autor: agente `go`) · 2026-10-12 · Commit revisado: `b188b7c` más árbol de trabajo local (sin cambios detectados en los archivos de este alcance)

Comandos corridos:
- `go test ./internal/almacen/postgres ./internal/migrador` — OK. Pasaron ambos paquetes contra PostgreSQL real: `internal/almacen/postgres` en 29,157 s e `internal/migrador` en 28,943 s.
- `git status --short; git rev-parse --short HEAD` — commit `b188b7c`; había cambios locales ajenos a este alcance. No se modificaron ni descartaron.
- Búsquedas estáticas de `ENABLE/FORCE ROW LEVEL SECURITY`, `set_config`, uso de `pgconn.PgError`, privilegios y funciones `SECURITY DEFINER` — revisadas.

No probado: TLS contra una base remota; Docker/Compose; ejecución literal de `scripts/crear-roles.sql` (el arnés crea roles y base mediante SQL equivalente); carga o rendimiento fuera del `EXPLAIN` automatizado; restauración desde backup.

## Resultado de criterios
- S01, S03 y S04: OK. Todas las tablas de `vc` tienen `tenant_id NOT NULL`, RLS habilitada y forzada, y política con `USING`/`WITH CHECK`. La prueba recorre el catálogo, verifica cero filas sin tenant, impide escritura sin tenant y prueba aislamiento entre dos tenants.
- S02: OK. `vc_api` se crea sin superusuario ni `BYPASSRLS`; el arranque rechaza dueño, superusuario, `BYPASSRLS`, membresías, atributos y privilegios distintos de la lista exacta.
- S06: FALLA parcial. Las migraciones se aplican desde cero, son idempotentes, verifican hash, serializan ejecuciones concurrentes y tienen archivos de reversión; la reversión de 0015 no cubre todo dato válido que 0015 permite persistir.
- S07 y S08: OK para el alcance. Hay prueba del plan keyset con plan genérico y las consultas usan parámetros; los fragmentos construidos dinámicamente solo interpolan posiciones de parámetros.
- G02: OK. Los errores de PostgreSQL se traducen al catálogo y la prueba verifica que el detalle interno no llegue al problema público.
- G03 y G06: OK. Las operaciones por tenant reciben y propagan contexto, aplican timeout y corren en una transacción con `set_config('app.tenant_id', $1, true)`, equivalente a `SET LOCAL`.

## Hallazgos
### H1 · El migrador no exige ser el dueño de la base
- Severidad: ALTA
- Ítem violado: S02
- Evidencia: `backend/internal/migrador/migrador.go:163-179` solo rechaza `vc_api`, superusuario y `BYPASSRLS`; no verifica que `current_user` sea `pg_database.datdba`. `backend/internal/migrador/migrador_test.go:72-78` prueba API y superusuario, pero no un tercer rol no dueño con DDL delegado.
- Impacto: un rol distinto del dueño puede aplicar las migraciones si recibe DDL suficiente, dejando objetos y funciones `SECURITY DEFINER` bajo un propietario distinto del modelo operativo exigido.
- Corrección: OBLIGATORIA — exigir que `current_user` sea el dueño de la base antes de preparar `vc_meta` o aplicar una migración.
- Prueba de cierre: conceder a un rol no dueño los permisos mínimos para intentar DDL y comprobar que `migrador.Aplicar` lo rechaza; comprobar que el dueño de la base aplica desde cero.

### H2 · La reversión de 0015 puede fallar con datos válidos
- Severidad: MEDIA
- Ítem violado: S06
- Evidencia: `backend/migrations/0015_correcciones_base_verde.sql:29-33` cambia `respuestas_modelo.salida` de `jsonb` a `json` para aceptar y conservar salidas con `\u0000`. `backend/migrations/0015_correcciones_base_verde.revertir.sql:2-4` reconoce que volver a `jsonb` falla si existe una fila así. `backend/internal/almacen/postgres/postgres_test.go:629-638` confirma que esa fila es válida y se persiste, mientras `backend/internal/migrador/migrador_test.go:93-127` prueba las reversiones solo sobre tablas sin esos datos.
- Impacto: una reversión operativa puede quedar bloqueada precisamente por datos que la versión actual acepta; esas salidas pueden contener datos del turno y no deben eliminarse ni alterarse silenciosamente.
- Corrección: OBLIGATORIA — definir un plan seguro y explícito para este cambio no reversible: preflight que detecte filas incompatibles, respaldo/exportación verificable y estrategia de avance o restauración que preserve los bytes. No presentar como reversión general un script que solo funciona si no existen esas filas.
- Prueba de cierre: insertar una respuesta con `\u0000`, ejecutar el procedimiento documentado de reversión/recuperación y comprobar que termina en el estado declarado sin pérdida silenciosa; automatizar el caso.

### H3 · El bootstrap productivo de roles no se ejecuta literalmente en pruebas
- Severidad: BAJA
- Ítem violado: S02, cobertura
- Evidencia: `backend/scripts/crear-roles.sql:8-18` es el bootstrap operativo. `backend/internal/almacen/pgprueba/pgprueba.go:176-196` y `:120-126` reproducen sus sentencias en Go en vez de ejecutar ese archivo.
- Impacto: el script y el arnés pueden divergir sin que la suite detecte un fallo del procedimiento que se usará para crear una instalación real.
- Corrección: SUGERIDA — hacer que una prueba efímera ejecute el script con variables de `psql`, o agregar una verificación automatizada que compare sus atributos y grants efectivos con los esperados.
- Prueba de cierre: crear roles y base desde cero usando `crear-roles.sql`, aplicar migraciones como `vc_dueno` y abrir la API como `vc_api` con `TestArranqueSeguro`.

## Veredicto
APROBADA CON CAMBIOS

Condición: cerrar H1 y H2 y reabrir T43 a revisión independiente. H3 es sugerido y no bloquea.
