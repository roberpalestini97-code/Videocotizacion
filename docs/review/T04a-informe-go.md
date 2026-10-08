# T03 + T04a — Informe de go (2026-10-08). Falta revisión independiente (T43); go no se autoaprueba.

**Hecho y verificado** (en `backend/`, PostgreSQL 16.15 real, clúster propio en el scratchpad, puerto 55432, scram):
- T03: `cmd/api` (`servir`, `migrar`, `retencion`; código 1 si el arranque es inseguro, 2 si el comando es inválido), `internal/config` (falla si falta algo; en producción prohíbe `ALMACEN=memoria`, `PROVEEDOR_*=falso` y DSN sin `sslmode=verify-full`), `internal/arranque` (doble chequeo H4 aunque se saltee config), `internal/servidor` (timeouts, `MaxBytesReader` + 413, pánico → 500 sin traza, solo `/salud` y `/listo`), `internal/salud`, `internal/reloj` (real y falso), `internal/proveedores` (+ `falsos` deterministas, con contadores y fallas inyectables), `internal/arquitectura` (tabla de dependencias permitidas; falla con paquete nuevo no declarado; prueba de la prueba). H5: catálogo ya existente, copia idéntica a `contracts/` verificada por prueba. H1: `Secreto` probado también a través de `Config` (`%v %+v %#v`, JSON, slog).
- T04a: `migrations/0001_esquema_inicial.sql` (+ `.revertir.sql`), `internal/migrador` (SHA-256, advisory lock, se niega a correr como superusuario o `vc_api`), `almacen/memoria`, `almacen/postgres`, `almacen/conformidad` (12 casos, misma batería para ambos), `almacen/pgprueba`, `internal/retencion` (diaria en `servir` + `api retencion`), `scripts/crear-roles.sql`.
- Aislamiento probado con SQL directo como `vc_api`: sin `app.tenant_id` (o vacío) 0 filas e INSERT 42501; tenant manipulado → 22P02; con A no se ve/actualiza/borra nada de B; INSERT con `tenant_id` de B → WITH CHECK; `tenant_id` no actualizable; UPDATE/DELETE de consentimientos, TRUNCATE, DDL y `row_security=off` → 42501; el dueño también ve 0 filas (FORCE); pool de 1 conexión no arrastra tenant (R6).
- Arranque seguro probado: no arranca con dueño, superusuario, rol con BYPASSRLS, rol miembro del dueño, versión de esquema distinta, `ExigirTLS` sin TLS, tabla sin FORCE o sin `tenant_id`.
- Mutaciones: sacar `FORCE` o poner la política en `USING (true)` hace fallar las pruebas.

```
$ gofmt -l .                       (sin salida)
$ go vet ./...                     (sin salida)
$ golangci-lint run ./...          0 issues.
$ PG_PRUEBA_URL=postgres://postgres:***@127.0.0.1:55432/postgres go test -race -count=1 ./...
ok cmd/api 1.485s · ok almacen/conformidad 1.567s · ok almacen/postgres 2.137s · ok arquitectura 1.024s
ok arranque 1.401s · ok config 1.014s · ok cotizador 1.176s · ok dominio 1.194s · ok errores 1.036s
ok migrador 1.315s · ok proveedores/falsos 1.033s · ok reloj 1.012s · ok retencion 1.044s · ok salud 1.024s
ok secreto 1.014s · ok servidor 1.016s          (0 SKIP con PG; sin PG_PRUEBA_URL se omiten 7)
```

**No probado**: TLS hacia la base (solo que `ExigirTLS` rechaza una conexión sin TLS), Docker/compose, adaptadores reales (no existen: producción hoy NO arranca, a propósito), rutas de negocio/WebSocket (T04b), `EXPLAIN` del listado (S07, no adjunto), `staticcheck`/`govulncheck` (no instalados), concurrencia de varias instancias de `api migrar` (hay advisory lock, sin prueba).

**Decisiones de go** (a revisar): tablas en esquema `vc`, control de migraciones en `vc_meta`; `tenants` también con `tenant_id` y RLS; ids con `COLLATE "C"` (orden igual a Go); PK/FK compuestas `(tenant_id, id)`; `vc.tenant_actual()` con `NULLIF(...,'')` (tras un `SET LOCAL` previo la variable queda en `''`); filtro por `tenant_id` también en cada WHERE (segunda capa); consentimientos y registro de borrados solo-anexar (sin grant + trigger); hijos borrados en cascada (la API no tiene DELETE en consentimientos ni ítems); items con lote de INSERT (COPY no admite RLS); errores PG → catálogo (23505 → `estado_invalido`, 23503 → `no_encontrado`, 42501 → `error_interno`); variables `ENTORNO`, `ALMACEN`, `DB_URL`, `DB_URL_DUENO`, `PROVEEDOR_*` según ADR 0001/0003; se agregó `almacen.Global` (`TenantsParaRetencion`). Se pasaron por `gofmt` dos archivos previos (`errores/catalogo.go`, `cotizador_test.go`) sin cambiar lógica.

**Dependencias**: `pgx v5.8.0` del caché local; el proxy no deja llegar a `sum.golang.org`, así que `go.sum` se armó con `GOSUMDB=off` (hashes del caché, **sin verificar contra la base pública**) y `go mod tidy` completo queda pendiente (faltan entradas de testify, que solo usan las pruebas de pgx). Verificar en CI con red.

**Entorno**: el clúster de prueba corre con `setpriv` + `CAP_DAC_READ_SEARCH` porque `/tmp/claude-0` es 700 de root y el entorno revierte el `chmod`. Huecos del contrato: `docs/review/T04a-huecos-del-contrato.md` (C1–C8; el más importante, C2: plazo de consentimientos vs. consulta).
