# T04b parte 1 + correcciones de T43 — Informe de go (2026-10-09). Falta revisión independiente; go no se autoaprueba.

**Verificado** (PG 16 real en 127.0.0.1:55432): `gofmt -l .` vacío · `go vet ./...` vacío · `golangci-lint run ./...` 0 issues · `go test -race -count=1 ./...` todos `ok` (19 paquetes, 0 SKIP con PG; sin `PG_PRUEBA_URL` se omiten las pruebas de base).

**Parte A (T43)** — cada una con prueba y mutación en copia fuera del repo (todas DETECTADAS):
- H1 `TestPoolNoArrastraTenant` usa el pool real del almacén (1 conexión): `set_config(...,false)` falla.
- H2 `VerificarArranque` compara los privilegios reales de `vc_api` (tablas, columnas, esquemas, funciones, base, atributos y membresías) con `PrivilegiosPermitidos`: `GRANT TRUNCATE` y `GRANT UPDATE cotizaciones` fallan.
- H3 definers (única lista `DefinersPermitidos`, `search_path` fijo, dueño, sin PUBLIC) y políticas exactas (incluida la del dueño): sin `search_path` y sin `REVOKE ... PUBLIC` fallan. C7 (vc_api lista ids de tenants, aceptado) y las opciones de H4 siguen escritas en `T04a-huecos-del-contrato.md`.
- H5 listado en dos consultas; la prueba analiza las sentencias preparadas por el propio almacén con `plan_cache_mode=force_generic_plan`: el `OR $3::boolean` falla.
- Bajos: `sslmode` repetido rechazado, `verify-ca` rechazado en producción, migrador con prueba de concurrencia (6 en paralelo; sin advisory lock falla), `context.Canceled` no es ERROR, `.gitattributes` (`* text=auto eol=lf`) ya en la raíz, `pgprueba` solo contra host local o `PG_PRUEBA_DESCARTABLE=1`. H4: NO decidido, no se borran asesores.

**Parte B (T04b-1)** — migración 0002 (claves_api, enlaces, tokens_sesion, derivaciones; RLS forzada; credenciales solo como HMAC-SHA256; búsqueda por hash vía 2 funciones SECURITY DEFINER endurecidas y verificadas al arrancar), paquetes `credenciales`, `abuso` (tasa por fichas, desafío de un uso), `sesiones`, `api`, cableado en `arranque`.
- Rutas: `emitirDesafio`, `crearSesion`, `leerSesion`, `leerCotizacion`, `leerDerivacion`. Proveedores solo falsos. El precio lo calcula Go (`cotizador`); una salida del LLM con monto no emite.
- Se corren **134 vectores del contrato** contra el servidor real (memoria y PostgreSQL): mismo status y código, `costo_cero` (0 llamadas a proveedores), grupos de 404 idénticos, `Retry-After` en 429/503; y las 58 respuestas de éxito se validan con ajv contra los esquemas del OpenAPI y las reglas de `ejecutar.mjs` (0 fallas; se omite si falta node o `verificacion/node_modules`). No se tocó `ejecutar.mjs` ni los vectores.
- Mutaciones B (detectadas): Origin con secreta, Origin con pública, desafío, tipo admitido, credencial revocada, token de otra sesión, enlace revocado, cuota `>=`→`>`, simultáneas, estado de la derivación, desafío reusable, tasa, precio del LLM; en 0002: sin FORCE, GRANT UPDATE de más, definer sin search_path, sin REVOKE PUBLIC, política del dueño sin TO.

**No probado**: TLS real hacia la base; Docker; varias instancias (tasa y desafíos son por instancia); CORS/preflight (no implementado); navegador real; carga; `govulncheck`; `ejecutar.mjs --contra` no se agregó (los vectores corren desde Go).
**Huecos y decisiones**: `docs/review/T04b1-huecos-del-contrato.md` (B1–B12). Los más importantes: B1 el contrato tiene un solo precio y se publica el **máximo** del rango (provisorio); B2 la versión del tarifario real (`0.1.0`) no cumple `AAAA.N`; B3 `crearSesion` verifica cupo pero no reserva (la reserva atómica R57 es de `emitirTokenMedios`, parte 2); B4 tasas por instancia y sin proxy de confianza; B6 sin CORS; B8 no hay forma operativa de dar de alta la primera clave.
**Pendiente (parte 2)**: WebSocket, `registrarConsentimiento`, `emitirTokenMedios`, `cerrarSesion`, contacto, ARCO, resto de rutas públicas y todo el panel/login. El arranque no carga el tarifario (cotizador nil): `Presupuestar` existe en el servicio pero no tiene ruta HTTP.
**Entorno**: cambios solo en `backend/` y `docs/review/`; sin commit.
