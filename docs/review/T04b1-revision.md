# Revisión T04b parte 1 · credenciales, abuso, sesiones y API pública
Revisor: rev (Sonnet 5.5; distinto del autor: go/Opus) · 2026-10-09 · Commit revisado: `d764492` (árbol limpio, no se tocó código de producción)

**Veredicto: APROBADA CON CAMBIOS.** No hay CRÍTICAS. Hay 2 ALTAS (H1, H2) y 2 MEDIAS obligatorias (H3, H4) que deben cerrarse antes de abrir `crearSesion` al público. Las ALTAS son reproducibles con las pruebas de la sección "Cómo reproducir".

## Comandos corridos
- `go test -race -count=1 ./...` con `PG_PRUEBA_URL` (PG 16 en 127.0.0.1:55432): 19 paquetes `ok`, 0 SKIP. `gofmt -l` vacío, `go vet` vacío, `golangci-lint run` 0 issues.
- 134 vectores contra el servidor real (memoria y PG): pasan; con ajv (en el repo, que tiene `node_modules`) también.
- Pruebas de ataque propias (`rev_ataques_test.go`, en una COPIA fuera del repo, ambos almacenes): tabla de decisión, Origin (ausente/ajeno/comodín/mayúsculas/barra final/puerto/doble), desafío (reusado/vencido/otra clave/otro Origin/sin trabajo/duplicado), aislamiento A↔B en las 3 rutas de lectura con clave secreta y con token, `tenant_id` en cuerpo (incluido `tenant_id`), 404 idénticos (sesión de B vs inexistente, enlace de B vs inexistente vs revocado), 401 idénticos (desconocida/revocada/basura), credenciales en logs, cuerpo de 200 KB con y sin Content-Length. **Todo pasó** salvo lo informado abajo.
- Servidor real (binario `api servir`, memoria): 404 uniforme para ruta/método desconocidos, 431 con encabezados de 70 KB, 413 con 1 MB chunked, sin credenciales en el log de arranque ni en los de error.
- PG propio (base `rev_db`, ya borrada) con el rol real `vc_api`: sin `app.tenant_id` 0 filas en `claves_api`/`tokens_sesion`; `UPDATE hash`, `DELETE`, `TRUNCATE` → permiso denegado; INSERT con tenant ajeno → viola la política; no puede crear funciones ni tablas; `buscar_clave` con hash inexistente → 0 filas; las 2 funciones SECURITY DEFINER son del dueño, con `search_path=pg_catalog, pg_temp` y sin EXECUTE a PUBLIC; las 4 tablas nuevas tienen ENABLE + FORCE.
- Tiempos (PG, 600 pedidos c/u): clave desconocida 160 µs, revocada 157-162 µs (indistinguibles); formato inválido 12 µs (el formato no es secreto).
- **31 mutaciones** en copia: 26 detectadas por las pruebas del autor, **5 sobreviven** (M18, M23, M26, M29, M30; ver H5). Tabla abajo.

## Hallazgos

### H1 · Un atacante agota los límites por clave pública ANTES de autenticar y deja sin servicio al widget — ALTA
- Ítem violado: R58 / ADR 0005 §5, error amplio 12 (el límite es contra el propio servicio).
- Evidencia: `backend/internal/api/autenticacion.go:152-160`. `PorCredencial` (600/min) y `CrearPorClave` (120/min) consumen fichas con el hash del valor del encabezado **antes** de `autenticar` (l.162) y de verificar Origin/desafío (l.174-193). La clave pública va embebida en la página, así que cualquiera la conoce.
- Reproducción: `go test -run TestREV_DrenarTasaDeClavePublica` (copia) → 13 IPs × 10 pedidos basura (sin Origin ni desafío, todos 403) agotan 120 fichas; el visitante legítimo desde otra IP recibe `429 limite_de_tasa` en `crearSesion` (`Retry-After: 5`). Con 5 IPs y cualquier ruta se agota `PorCredencial` y cae también `emitirDesafio`. `CrearPorIP` (10/min) solo frena por IP; IPv6 o una botnet chica lo esquiva.
- Impacto: cualquiera que lea el HTML del cliente apaga la cotización de ese tenant con ~13 IPs, sin pagar prueba de trabajo.
- Corrección: OBLIGATORIA. Mantener antes de autenticar solo los límites por IP (`PorIP`, `op.tasas`). Mover `PorCredencial` y `CrearPorClave` a después del paso 5 (Origin válido) y, para `crearSesion`, después del paso 6 (desafío consumido con éxito), igual que ya se hace con `CrearPorEnlace`. Con clave **secreta** válida pueden quedar donde están (no es pública). Ajustar el contrato si la tabla exige tasa en el paso 1 (es un cambio de orden: derivar a arq).
- Prueba de cierre: la prueba `TestREV_DrenarTasaDeClavePublica` debe terminar con el visitante legítimo en 201; más una prueba por cada limitador (hoy 4 de 6 no tienen: H5).

### H2 · El tope mensual se calcula sobre filas que la retención y el ARCO borran: el "tope duro" se reinicia — ALTA
- Ítem violado: R56 / ADR 0005 §4 ("tope duro"), error amplio 12.
- Evidencia: `backend/internal/almacen/postgres/credenciales.go:117-127` (y `memoria/credenciales.go:164-182`) suman `duracion_s` de `vc.sesiones`. `vc.tenants.retencion_dias` admite 1..3650 (`0001_esquema_inicial.sql:40`, `dominio/entidades.go:62`) y `BorrarVencidos` borra `vc.sesiones` (`postgres.go:592`). El ARCO de supresión (R23, parte 2) también las borra.
- Reproducción: copia, `TestREV_RetencionBorraConsumo` (ambos almacenes): tenant con `retencion_dias=1`, tope 600 s, sesión de 600 s → `crearSesion` da `429 cuota_agotada`; se avanza el reloj 48 h dentro del mismo mes, corre `retencion.Ejecutar` (borra 1 sesión) → `crearSesion` da **201**.
- Impacto: con un plazo de retención menor a ~31 días (el abogado puede recomendarlo) o con una solicitud de supresión, el tenant recupera los minutos consumidos; el gasto real en IA ya ocurrió.
- Corrección: OBLIGATORIA. Llevar el consumo a una tabla/contador propio que la retención no toque (`vc.consumo_mensual(tenant_id, mes, segundos)`, solo-anexar o con UPDATE de una columna), actualizado al cerrar la sesión en la misma transacción, o `CHECK (retencion_dias >= 62)` más no borrar sesiones por ARCO sino anonimizarlas. Lo primero es lo robusto y sirve para el panel de consumo (ADR §6).
- Prueba de cierre: la prueba de arriba debe dar 429 después de la retención; y un test de ARCO en la parte 2.

### H3 · `crearSesion` verifica cupo sin reservar; faltan el tope global y el de profesional de R56 — MEDIA (OBLIGATORIA antes de abrir al público, parte 2)
- Ítem violado: R56, R57 (ambos "Bloq. SÍ"); error amplio 12.
- Evidencia: `sesiones/sesiones.go:337` y `357-371`: lee consumo y activas y decide (check-then-act); no hay transacción ni bloqueo. `TestREV_CarreraSimultaneas` (copia): con tope 5, **20 `crearSesion` concurrentes → 20 aceptadas** (ambos almacenes) y 200 secuenciales → 200 aceptadas (sesiones en `creada` no cuentan como activas). Esto el autor lo declaró (B3) y lo difirió a `emitirTokenMedios`. Lo que **no** declaró: (a) `verificarCupo` mira solo el tenant; R56 pide además tope por profesional y un **tope global de gasto mensual** que nada supera; no hay ninguno. (b) El mensual cuenta solo sesiones cerradas, así que 5 llamadas pueden empezar a 499 de 500 min y llegar a ~575; para que sea tope duro la reserva debe descontar `duracion_maxima_s` del saldo. (c) La ventana de "activas" usa `VidaToken` (`sesiones.go:360`): si se acorta el token por debajo de `duracion_maxima_s` (hoy 1 h vs 15 min, sin config) una llamada viva deja de contar.
- Impacto: hoy cero costo (nadie llama a proveedores en esta parte; los `costo_cero` de los vectores son triviales porque `crearSesion` no tiene camino a proveedores); queda deuda que, si la parte 2 la hereda, rompe el bloqueo de R57/R67.
- Corrección: en la parte 2, reserva atómica en una sola sentencia/transacción (`UPDATE ... WHERE activas < tope RETURNING`, o `pg_advisory_xact_lock(tenant)`), que descuente minutos máximos del saldo, contador por asesor y tope global configurable (`GASTO_MAX_MENSUAL_*`); desacoplar la ventana de activas de `VidaToken` (usar `duracion_maxima_s`+margen o un estado "reservada" con vencimiento).
- Prueba de cierre: 20 concurrentes → exactamente 5 aceptadas con PG y `-race`; saldo 1 min + sesión de 15 min → rechazada o recortada.

### H4 · `Retry-After` siempre vale 5, también en `cuota_agotada` — MEDIA (sugerida; obligatoria si el widget reintenta solo)
- Evidencia: `api/autenticacion.go:122-124` descarta `espera` (solo la mete en el texto de la causa); `servidor/servidor.go:144-148` pone 5 s por defecto a todo 429/503. `TestREV_RetryAfterYTasa`: `Retry-After: 5` tras superar 20/min aunque faltaban 3 s; en `cuota_agotada` (cuota mensual) también 5 s.
- Impacto: un cliente bien portado reintenta cada 5 s contra un tope que se levanta el mes siguiente; el valor no sirve para R8/R57.
- Corrección: `errores.Envolver` + `ReintentarEnS` calculado (espera del limitador; en cuota mensual, segundos hasta el 1.º del mes ART o ausencia del encabezado; en simultáneas, un valor corto fijo). Prueba de cierre: assert del valor del encabezado en cada 429 de los vectores.

### H5 · Pruebas que no detectan mutaciones — MEDIA (sugerida salvo la de límites, obligatoria con H1)
Sobrevivieron a las pruebas del autor y a mis pruebas de tabla:
- **M29** sacar `PorCredencial`; **M30** hacer que los límites de operación (`CrearPorIP`, `DesafioPorIP`) nunca limiten; **M23** sacar `CrearPorClave`: solo `PorIP` (vectores) y `CrearPorEnlace` (`TestTasaDeCrearSesion`) tienen prueba. 4 de 6 limitadores sin prueba (R58 es "Bloq. SÍ" y pide ráfaga por cada eje).
- **M18** inicio de mes en UTC en vez de ART (`sesiones.go:359`): la prueba de cambio de mes solo mira el 429/201 del borde de arriba; ninguna sesión creada entre las 00:00 y las 03:00 UTC del día 1 (21:00-24:00 ART del último día) mira hacia atrás. Corrección: sesión creada el 30/09 22:00 ART no cuenta para octubre.
- **M26** `OriginValido` sin regex: nadie prueba que se rechace registrar `*`, `http://` o `null` como Origin de una clave (`dominio/credenciales.go:45`).
- Las pruebas de `costo_cero` de `crearSesion`/`leerSesion` no pueden fallar (no hay camino a proveedores); no cuentan como evidencia de R61 hasta la parte 2.

### H6 · Límites y desafíos por instancia, IP = `RemoteAddr` — MEDIA (declarado como B4; se confirma y se agrega impacto)
- `api/autenticacion.go:114-120`, `abuso.go` (todo en memoria). Detrás de un proxy/balanceador `RemoteAddr` es siempre la misma IP: `crearSesion` queda en **10/min para todo el sitio** y `PorIP` en 120/min en total. Sin proxy confiable configurable, desplegar tras un LB rompe el servicio; configurarlo mal lo deja evadible con `X-Forwarded-For`. IPv6: cada dirección tiene su propio balde (agrupar por /64). Con 2+ instancias el límite se multiplica y los desafíos emitidos en una no los conoce otra. `Desafios.Emitir` (`abuso.go:149-158`) recorre 100 000 entradas bajo el mutex cuando está lleno.
- Corrección: obligatoria antes de abrir al público (como ya dice B4): almacén compartido (PG o Redis) o afinidad, proxy confiable configurable, agrupar IPv6.

### H7 · BAJAS (sugeridas)
- `Authorization: bearer …` (esquema en minúscula, válido según RFC 9110) da 401 `credencial_invalida` (`autenticacion.go:211`, `CutPrefix` sensible a mayúsculas). Aceptar sin distinguir mayúsculas.
- `verificarFunciones` (`endurecimiento.go:187`) comprueba dueño/`search_path`/PUBLIC de `buscar_clave` y `buscar_token_sesion`, no su cuerpo: una migración futura que quite el `WHERE c.hash = p_hash` filtraría todas las claves y el arranque no lo notaría. Comparar `prosrc` normalizado como ya se hace con `tenant_actual`.
- `claves_api.origenes` sin CHECK de formato en la base (solo `Validar` en Go); agregar `CHECK (NOT EXISTS (... origen !~ '^https://...'))` con `unnest`.
- `arranque.go:125` ignora el error de `api.Registrar` (se valida antes con otro mux; funciona, pero es una doble llamada y un `_ =`).
- HMAC con una sola clave de servidor y sin id de versión: rotar `CREDENCIALES_CLAVE_HMAC` invalida todas las credenciales a la vez (R1 pide rotar *claves* con solapamiento, que es otra cosa). Prever `kid` si se va a rotar.
- Sesiones `creada` (sin consentir) se acumulan hasta la retención (hasta 90 días); sin barrido de las que nunca consintieron.

## Declarados por el autor, confirmados
B3 (sin reserva), B4 (por instancia), B6 (sin CORS: `OPTIONS` da 404, el widget en navegador no funciona), B8 (no hay alta operativa de la primera clave), B9 (token sin Origin), B1/B2 (precio máximo; versión del tarifario `0.1.0`). Sin hallazgo adicional sobre ellos salvo lo dicho en H3 y H6.

## Lo que está bien (verificado)
- Orden de la tabla de decisión respetado (secreta+Origin → 403 `clave_secreta_desde_navegador` también con `Origin: null`/vacío; pública sin Origin, ajeno, `*`, mayúsculas, barra final, puerto, http, doble encabezado → 403 `origen_no_permitido`; pública en lectura → 403 `alcance_insuficiente`; clave en el encabezado equivocado o dos credenciales → 401).
- Desafío: un solo uso (se borra al primer intento aunque falle), ligado a clave **y** Origin, vence, prueba de trabajo, header duplicado no lo evade.
- Credenciales: solo HMAC-SHA256 con clave de servidor ≥32 bytes obligatoria en producción; el valor en claro no está en la base ni en logs; 401 idéntico para desconocida/revocada/vencida; revocación inmediata (cada pedido consulta la base); comparación por índice sobre un HMAC con clave del servidor (no se puede construir un prefijo, así que la comparación no constante de PG es inexplotable).
- Aislamiento: clave de A y token de A contra sesión de B (leerSesion/leerCotizacion/leerDerivacion) → el mismo 404 byte a byte que una inexistente; enlace de B/inexistente/revocado → mismo 404; `tenant_id` en el cuerpo → 422; RLS + FORCE + privilegios mínimos + definers endurecidos (ver comandos).
- El precio sale solo de Go: `DecodificarSalidaLLM` rechaza campos desconocidos (mutación M27 detectada), `Pedido()` opera en centésimas por texto, la respuesta toma descripción y leyenda del tarifario/Go; no hay `float` en rutas de dinero (los `float64` son fichas del limitador).
- Cuerpo ≤64 KiB (413 con y sin Content-Length), JSON estricto, 400/415/422 consistentes, `problem+json` sin detalles internos, logs sin credenciales.

## Mutaciones (copia fuera del repo)
| # | Mutación | Resultado |
|---|---|---|
| M01 | secreta+Origin `>0`→`>1` | detectada |
| M02 | pública acepta cualquier Origin | detectada |
| M03 | desafío reutilizable | detectada |
| M04 | desafío sin ligar a Origin | detectada |
| M05 | desafío sin ligar a clave | detectada |
| M06 | sin prueba de trabajo | detectada |
| M07 | desafío vencido aceptado | detectada |
| M08 | token de otra sesión | detectada |
| M09 | clave revocada aceptada | detectada |
| M10 | token vencido aceptado | detectada |
| M11 | SHA-256 plano en vez de HMAC | detectada |
| M12 | tipo de credencial siempre admitido | detectada |
| M13 | credencial en encabezado equivocado | detectada |
| M14 | dos credenciales a la vez | detectada |
| M15 | enlace revocado válido | detectada |
| M16 | cuota mensual `>=`→`>` | detectada |
| M17 | mes calculado en UTC | detectada |
| M18 | inicio de mes en UTC (zona del `time.Date`) | **SOBREVIVE** |
| M19 | simultáneas `>=`→`>` | detectada |
| M20 | sin verificar cupo | detectada |
| M21 | campos desconocidos en el cuerpo | detectada |
| M22 | sin límite por enlace | detectada |
| M23 | sin límite por clave pública | **SOBREVIVE** |
| M24 | 0002 sin FORCE en `tokens_sesion` | detectada |
| M25 | sin `Retry-After` | detectada |
| M26 | `OriginValido` sin regex | **SOBREVIVE** |
| M27 | LLM puede mandar campos extra (precio) | detectada |
| M28 | derivación con sesión abierta | detectada |
| M29 | sin límite por credencial | **SOBREVIVE** |
| M30 | límites por operación (IP) nunca limitan | **SOBREVIVE** |
| M31 | desafíos pendientes sin tope | detectada |
Nota: las mutaciones corrieron en una copia sin `node_modules`, así que la validación ajv de los éxitos quedó omitida; no afecta a ninguna de estas.

## No verificado
TLS real a la base; Docker; varias instancias; CORS/preflight (no existe); navegador real; carga/slowloris real (solo encabezados y cuerpo grandes); `govulncheck` (no instalado); ARCO, WebSocket, `emitirTokenMedios`, `cerrarSesion` y panel (parte 2); tiempos con memoria (solo PG); rotación de la clave HMAC; el texto legal del aviso (a validar con abogado).

## Condición del veredicto
Cerrar H1 y H2 (ALTAS) y H4 si el widget reintenta automáticamente; llevar H3 y H6 como bloqueantes explícitos de la parte 2 (R56/R57/R58 siguen "Bloq. SÍ"); agregar las pruebas de H5 (límites por eje y borde de mes ART). H1 toca el orden de la tabla de decisión: pasa por arq. Después, go reabre a revisión (rev) solo H1, H2 y H5.
