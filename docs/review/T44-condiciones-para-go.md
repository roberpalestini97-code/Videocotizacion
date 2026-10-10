# T44 — Condiciones para T04b parte 2 (go)

Autor: arq · 2026-10-09 · Contrato **0.1.5-borrador**. Detalle en ADR 0004 §8 y §10, ADR 0005 §4–§12 y
`contracts/estado-de-congelamiento.md` (tabla de decisión). Cada condición se cierra con la prueba indicada.

| # | Condición | Prueba de cierre |
|---|---|---|
| G1 | **H1**: antes de autenticar solo los límites por IP (`PorIP`, `CrearPorIP`, `DesafioPorIP`). `PorCredencial` después de Origin y desafío (paso 8); con clave pública solo en `crearSesion`. `CrearPorEnlace` después de resolver el enlace (paso 13). | `TestREV_DrenarTasaDeClavePublica` → 201 para el visitante legítimo; una prueba de ráfaga por limitador (mata M23, M29, M30); vectores `abuso` H1 en verde. |
| G2 | **H2**: migración con `vc.consumo_mensual`, `vc.consumo_diario`, contadores por asesor, `vc.consumo_global_mensual`, `vc.topes_globales`, `vc.reservas_cupo`; el cupo NUNCA suma `vc.sesiones`. `leerConsumo`/`leerConsumoPanel` desde contadores (`segundos_reservados`, `reinicia_en`, `alerta_tenant`). | `TestREV_RetencionBorraConsumo` → 429 después de la retención (memoria y PG); `vc_api` sin UPDATE/DELETE sobre contadores ni acceso a los globales. |
| G3 | **H3/B3**: `vc.reservar_cupo` / `vc.liberar_cupo` `SECURITY DEFINER` (verificadas al arrancar con `prosrc`, como pide H7), bloqueo global → tenant → asesor, reserva de `duracion_maxima_s` con recorte ≥ 60 s, vencimiento propio (no `VidaToken`), reconexión sin doble reserva, liberación en la transacción del cierre. `api servir` no arranca sin fila en `vc.topes_globales`. | 20 `emitirTokenMedios` concurrentes, tope 5, PG + `-race` → exactamente 5; saldo 60 s ≤ x < duración → `reserva.recortada_por_cuota`; < 60 s → 429; tope de asesor y global → 429 `cuota_agotada`. |
| G4 | **H4**: `Retry-After` calculado en todo 429 y 503 e igual a `reintentar_en_s` (tabla en ADR 0005 §12); borde de mes en hora argentina. | Assert del encabezado en cada 429/503 de los vectores (campo `retry_after`); sesión del 30/09 22:00 ART no cuenta en octubre (mata M18). |
| G5 | **B6**: los 13 `OPTIONS` del contrato (paso 2 de la tabla), `Access-Control-Allow-Origin` exacto según ADR 0005 §11, `Vary`, `Expose-Headers: Retry-After`; nada de CORS en `/v1/panel/*`. | Vectores categoría `cors` (91) contra el servidor; Origin ajeno/ausente → 204 sin `Access-Control-Allow-*`. |
| G6 | **B1/B2**: respuestas con `*_min_centavos`/`*_max_centavos`; `precio_final_centavos` solo con tarifario `validada` y min = max; `tarifas.version` = `tarifas-2026@0.1.0` desde el archivo real (sacar el parche `"2026.1"` de `api_test.go`). | Vectores `cotizacion` (C7: suma y redondeo de min y max) con el tarifario real cargado. |
| G7 | **B4/H6**: `PROXIES_CONFIANZA` + `X-Forwarded-For` de derecha a izquierda; IPv6 por /64; candado `pg_try_advisory_lock` de una sola instancia. | Prueba con `RemoteAddr` confiable y no confiable; dos IPv6 del mismo /64 comparten balde; segunda instancia no arranca. |
| G8 | **B8/C5/C6**: comandos `api tenant crear|configurar`, `api topes configurar`, `api asesor crear|configurar|baja`, `api clave-secreta crear|listar|revocar` (ADR 0005 §10); secretos una sola vez por stdout, nunca en logs; constancia en `vc.registro_operaciones`. `api asesor baja` NO borra datos hasta que se decida ADR 0004 §8. | Alta de punta a punta en una base vacía: tenant → administrador → login con TOTP → clave pública desde el panel → `crearSesion` 201. Log sin secretos. |
| G9 | No cerrar por cuenta propia: retención de asesores y de consentimientos (ADR 0004 §8, pendiente de Rober/abogado), B5, B7, B9, B10–B12, C1. Si hace falta decidir algo para avanzar, se declara como supuesto y pasa por arq. | — |

Condición de salida: go reabre a revisión (rev, con seg) G1–G4 y G7 como obligatorias antes de abrir
`crearSesion` al público; G5, G6 y G8 antes de integrar el widget y el panel con el backend real. fe tiene que
regenerar tipos y mocks del panel por B1/B2 (cambio incompatible de 0.1.5).
