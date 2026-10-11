# Revisión de seguridad acotada — `backend/internal/rutas` sobre `main` (53a317c)

Fecha: 2026-10-11 · Rama: `fix/base-verde-linux` · Revisor: agente "go" (Claude). Quien escribió el código no revisa.
Alcance: `auth.go`, `tasa.go`, `sesion.go`, `medios.go`, `socket.go`, `socket_entrada.go`, `widget.go` y lo que tocan
(`almacen/postgres/cupo.go`, `almacen/memoria/cupo.go`, `servidor/servidor.go`, `rutas/panel.go`, `infra/Caddyfile`).
**No se corrigió nada de esta lista**: son hallazgos para que decidan arquitecto y Rober.

Evidencia: sondas con `httptest` sobre el almacén de memoria (archivo temporal, borrado después) y una prueba nueva
de conformidad `cupo_concurrente` (memoria + PostgreSQL 16 real), que sí quedó en el repo.

## Resumen

| # | Lupa | Severidad | Archivo:línea | Estado |
|---|------|-----------|---------------|--------|
| H1 | (1) tasa por credencial antes de Origin/desafío | **Alta** | `rutas/sesion.go:63`, `rutas/tasa.go:31-46` | Confirmado |
| H2 | (1) eje "ip" con `RemoteAddr` detrás de Caddy | **Alta** | `rutas/panel.go:145-154`, `rutas/tasa.go:32`, `rutas/panel.go:159,178` | Confirmado por lectura (Caddy no probado) |
| H3 | (2) cuota "mensual" que depende de filas que borra la retención | **Alta** | `almacen/postgres/cupo.go:40-47`, `almacen/memoria/cupo.go:73-79` | Confirmado por lectura |
| H4 | (6) sin CORS ni `OPTIONS` para el widget | **Alta** (bloqueante funcional) | `rutas/enlace.go:37-48`, `infra/Caddyfile:5` | Confirmado (OPTIONS → 404, sin `Access-Control-Allow-Origin`) |
| H5 | (5) simultáneas llenas responde `cuota_agotada` + `Retry-After: 3600` | Media | `almacen/postgres/cupo.go:61-62`, `servidor/servidor.go:146-147` | Confirmado (y fijado por `medios_test.go:131-136`) |
| H6 | (1) mapa de tasas sin purga | Media/Baja | `rutas/tasa.go:78-85` | Confirmado |
| H7 | (2) la duración solo cuenta al cerrar | Baja/Media | `almacen/postgres/cupo.go:41-45` | Por lectura |
| H8 | WS: datos de la sesión antes de autenticar | Baja | `rutas/socket.go:37-58` | Por lectura |
| — | (3) carrera check-then-act en cupo de simultáneas | OK | `almacen/postgres/cupo.go:28,54-62` | 20 concurrentes, tope 5: entran 5 exactas (x10 corridas, `-race`) |
| — | (4) 404 idénticos entre tenants | OK | `rutas/lectura.go:98-116` | Mismo cuerpo (sin `id_traza`) para otro tenant e inexistente |

## Detalle

### H1 · Alta · La tasa de `POST /v1/sesiones` se consume con la clave pública antes de validar Origin y desafío
`crearSesion` llama a `limitarCrearSesion` (sesion.go:63) antes de `autenticar` (:67) y de `libro.Consumir` (:74).
El eje `clave:` (tasa.go:33-36) se arma con el valor de `X-VC-Clave-Publica` tal cual llega. La clave pública es
pública por diseño (está en el widget del sitio del tenant) y el eje `enlace:` sale del `id_publico`, que viaja en el
enlace que se le manda al cliente.
**Sonda**: 10 `POST` con la clave pública de la víctima, `Origin: https://atacante.example`, sin desafío y desde 10 IP
distintas: los 10 dan 403 `origen_no_permitido`. Después, un pedido legítimo (Origin correcto, desafío resuelto,
IP nueva) recibe **429 `limite_de_tasa`, `Retry-After: 60`**. Con 10 pedidos por minuto se deja sin servicio a
todo el widget de un tenant (o a un enlace). `TestTopeCrearSesion` fija hoy ese comportamiento (R58 dice "antes de
la credencial").
Sugerencia, sin implementar: contar `clave`/`enlace` solo después de que la credencial, el Origin y el desafío
pasaron (o cobrar el desafío como costo antes de contar), y dejar antes de la credencial solo el eje IP.

### H2 · Alta · `ipDelPedido` usa `RemoteAddr`; detrás de Caddy todos comparten IP
`infra/Caddyfile` pone `reverse_proxy api:8080` para `api.<dominio>` y `panel.<dominio>`. No hay lectura de
`X-Forwarded-For`/`X-Real-IP` con proxies de confianza (grep sin resultados). Entonces el eje `ip:` de R58 se vuelve
un tope **global de 10 sesiones por minuto para todo el servicio**, y el bloqueo del panel por IP (panel.go:159,178)
lo puede disparar un atacante para todos los asesores. No probado con Caddy corriendo.

### H3 · Alta · La cuota "de 500 min por mes" no es mensual y depende de la retención
`ReservarTokenMedios` suma `duracion_s` de **todas** las sesiones del tenant que todavía existen, sin ventana de mes
(cupo.go:41-42; igual en memoria, `duracionAcumulada`). Consecuencias: (a) al llegar a 30 000 s el tenant queda
bloqueado hasta que la retención borre sesiones, no al cambiar el mes; (b) `BorrarVencidos` (postgres.go:691)
**devuelve cupo** al borrar filas: con `RetencionDias` corto (el dominio admite 1) el tope deja de existir.
El panel (`ConsumoDelAsesor`, exportacion.go:125-160) sí cuenta por mes calendario y por asesor: el número que ve el
asesor y el que se hace cumplir no coinciden. Sugerencia: contador de consumo por tenant y mes en una tabla propia que
la retención no borre (los segundos no son dato personal).

### H4 · Alta (funcional) · El widget no puede llamar a la API desde el navegador
El front está en `cotizar.<dominio>` y la API en `api.<dominio>` (Caddyfile:3-5): es cross-origin, y los pedidos
llevan `X-VC-Clave-Publica`, `X-Desafio` y `Content-Type: application/json`, así que el navegador hace preflight.
**Sonda**: `OPTIONS /v1/sesiones`, `/v1/widget/desafios` y `/v1/widget/enlaces/{id}` → **404**, sin
`Access-Control-Allow-*`; el `GET` exitoso tampoco trae `Access-Control-Allow-Origin` ni `Vary: Origin`. Caddy dice
explícitamente que no agrega CORS a la API. Sugerencia: `OPTIONS` que responda solo a Origin de alguna clave pública
vigente (o sin credencial, con allowlist de headers y métodos), `Access-Control-Allow-Origin` = el Origin validado,
`Vary: Origin`, sin `Allow-Credentials`. No probado en navegador real.

### H5 · Media · Código y `Retry-After` equivocados cuando faltan simultáneas
Con el cupo de simultáneas lleno, cupo.go:61-62 devuelve `cuota_agotada`, y servidor.go:146-147 le pone
`Retry-After: 3600` y el texto "Por ahora no hay cupo… Escribinos por WhatsApp". El contrato tiene
`simultaneas_agotadas` (429, `reintentar_en_s: 30`, "Probá en unos minutos") para ese caso (openapi.yaml:1103-1112).
Al cliente se le dice que espere una hora cuando bastan segundos. `TestCupoSimultaneas` (medios_test.go:131-136) fija
el comportamiento actual. `limite_de_tasa` sí calcula bien la espera (tasa.go:70-75).

### H6 · Media/Baja · `h.tasas` crece sin límite
`sumarTasa` (tasa.go:78-85) nunca borra entradas vencidas. Por IP solo se agregan ~10 entradas por minuto (sonda:
1000 claves basura desde una IP dejaron 22 entradas), pero con muchas IP (IPv6) la memoria crece indefinidamente.

### H7 · Baja/Media · La duración solo cuenta al cerrar
`duracion_s` se fija al cerrar; las sesiones `en_curso` no suman. Con 5 simultáneas de hasta 900 s el tope se puede
pasar en ~4 500 s por tanda.

### H8 · Baja · Handshake WS: lectura antes de autenticar
`conectarMedios` acepta con `InsecureSkipVerify: true` (socket.go:37) y valida el Origin a mano después
(socket.go:51), lo cual está bien. Pero `BuscarDatosMedios` corre sin credencial y los códigos de cierre distintos
(4401 sesión / 4403 origin / 4409 cerrada) dicen si un `sesion_id` existe y en qué estado está. Con ids de 128 bits
no es enumerable; tampoco hay tope de handshakes por IP (cada uno retiene 5 s).

## Lupas que pasaron
- **(3) Carrera en simultáneas**: `bloquearSesiones` (`FOR UPDATE` de todas las filas del tenant, en orden) más el
  `UPDATE … WHERE (SELECT count(*) …) < tope` serializan. Prueba nueva
  `conformidad/cupo_concurrente`: 20 reservas a la vez, tope 5 → 5 entran, 15 `cuota_agotada`, ningún HMAC
  guardado para las rechazadas; pasa en memoria y en PostgreSQL 16 (`-race`, `-count=10`).
- **(4) 404 entre tenants**: con la clave secreta de B, leer/cotización/cierre de una sesión de A y de una inexistente
  dan el mismo 404 `no_encontrado` (cuerpo idéntico salvo `id_traza`); `token-medios` da el mismo 403
  `alcance_insuficiente` en ambos casos; un `vc_ses_` usado en otra sesión da 404 igual.

## No verificado
Caddy real (H2, H4), navegador real (preflight de H4), tiempos de respuesta como oráculo (no se midió latencia).
