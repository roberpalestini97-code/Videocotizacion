# Estado de congelamiento del contrato — 0.1.5-borrador (2026-10-09)

Autor: arq (T44 sobre 0.1.4). 0.1.4 se rehizo desde cero tras la pérdida del entorno, a partir de `docs/BRIEF.md`,
`docs/respaldo-tablero.md` (T02, T31, T32, T35, T36, T37, T39, T41), ADR 0001–0006,
`docs/seguridad/requisitos-para-contrato.md` (R1–R70) y `T15-modelo-de-amenazas.md`.
**Falta revisión de un modelo distinto del autor, con seg como co-revisor** (regla del equipo).

| Pieza | Estado | Candidato a 1.0.0 |
|---|---|---|
| `openapi.yaml` (35 operaciones + 13 preflight `OPTIONS`) + `schemas/*.schema.json` + `catalogo-errores.json` | borrador 0.1.5 | **Sí** (único candidato) |
| `eventos-sesion.md` + `schemas/eventos/*` (eventos WebSocket y encabezado binario) | **NO CONGELADO** | No |
| `../conductas/esquema-salida-llm.schema.json` (lo mantiene cot) | referenciado por ruta relativa desde `RespuestaModelo` | No (P5) |

## Condiciones para pasar el OpenAPI a 1.0.0
1. Revisión independiente (rev + seg) sin hallazgos obligatorios abiertos.
2. Verificación en 0 fallas (abajo) en CI (T12).
3. go implementa T04b contra este contrato (parte 2: `docs/review/T44-condiciones-para-go.md`) y los vectores corren contra el servidor.
4. Rober: dominio (P4) y mecanismo del desafío (P7). Hasta entonces `crearSesion` con clave pública
   no se abre al público (R53–R58, R60–R61, R65–R67).

## Cómo se genera y se verifica
- Fuente única: `fuente/*.mjs` → `node fuente/generar.mjs` reescribe `openapi.yaml`, `schemas/`,
  `catalogo-errores.json`, `negativos/` y `pruebas/vectores/`. **No editar esos archivos a mano.**
- Los `.schema.json` no declaran `$id`; quien los carga asigna `https://videocotizacion.local/contracts/schemas/<ruta>`
  (con `$id` fijo Redocly falla al validar ejemplos). Así `../../conductas/esquema-salida-llm.schema.json`
  resuelve al `$id` que declara cot.
- `cd verificacion && npm install` y luego, desde `contracts/`:
  `node verificacion/validar.mjs .` · `node pruebas/ejecutar.mjs .` ·
  `npx --prefix verificacion redocly lint openapi.yaml --config redocly.yaml` ·
  `npx --prefix verificacion spectral lint openapi.yaml --ruleset .spectral.yaml --fail-severity error`
  (o `npm run todo` dentro de `verificacion/`).

## Tabla de decisión (orden de evaluación que fija el contrato)
Implementada en `pruebas/ejecutar.mjs` (`decidir`) y contrastada con cada vector. **Cambió en 0.1.5 (H1, B6):**
1. límite por **IP** (IPv6 agrupada por /64; IP real según proxy de confianza, ADR 0005 §9) → 429 `limite_de_tasa`.
   Es el ÚNICO límite que se consume antes de autenticar.
2. `OPTIONS` (preflight CORS del widget) → 204; con `Access-Control-Allow-*` solo si el Origin está registrado en
   alguna clave pública activa y el método y los encabezados pedidos están permitidos; si no, 204 sin esos
   encabezados. No lee credenciales ni consume otros límites. Termina acá.
3. sin credencial (o ruta del panel sin cookie) → 401 `credencial_ausente`; revocada → 401 `credencial_invalida`; sesión del panel vencida → 401 `sesion_vencida`
4. tipo de credencial no admitido → 403 `alcance_insuficiente`
5. clave secreta con `Origin` → 403 `clave_secreta_desde_navegador` (R2)
6. clave pública con `Origin` ausente/ajeno/comodín → 403 `origen_no_permitido`; panel (escritura) con Origin ajeno → 403 `origen_no_permitido`, sin CSRF → 403 `csrf_invalido`
7. `X-Desafio` ausente/vencido/reusado/de otro Origin o clave → 403 `desafio_invalido` (se consume en el primer intento)
8. límite por **credencial** → 429 `limite_de_tasa`. Clave secreta, token de sesión y sesión del panel: por credencial.
   Clave pública: solo en operaciones con desafío (`crearSesion`, "límite de creación por clave"); `emitirDesafio`
   y las lecturas con clave pública solo tienen el límite por IP del paso 1 (más el tope global de desafíos
   pendientes). Ningún pedido rechazado en 3–7 consume este límite.
9. rol insuficiente → 403 `alcance_insuficiente`; acción sensible sin reautenticación ≤ 5 min → 401 `reautenticacion_requerida`
10. cuerpo inválido (incluye `tenant_id` en el cuerpo) → 422 `validacion_fallida`
11. login: intentos → 429 `intentos_excedidos`; contraseña → 401 `credenciales_incorrectas`; TOTP inválido o reusado → 401 `totp_invalido`
12. recurso inexistente, de otro tenant, de otra sesión o de otro asesor → **el mismo** 404 `no_encontrado` (R5, R41, R64)
13. límite por **enlace** (solo `crearSesion`, con el enlace ya resuelto) → 429 `limite_de_tasa`
14. estado de la sesión → 409 (`consentimiento_requerido`, `sesion_cerrada`, `estado_invalido`, `cotizacion_no_emitida`, `contacto_ya_registrado`)
15. cupo (solo `crearSesion`, que verifica sin reservar, y `emitirTokenMedios`, que reserva) → 429 `cuota_agotada`
    (tope mensual del tenant, del asesor o global; saldo < 60 s) / `simultaneas_agotadas` (tenant, asesor o global),
    sin revelar cuál tope fue; una reconexión con reserva vigente no reserva de nuevo; lecturas de contacto → 429 `limite_lecturas_contacto`
16. éxito.

Todo 429 y 503 lleva `Retry-After` **calculado** e igual a `reintentar_en_s` (H4): `limite_de_tasa` = espera del
limitador; `intentos_excedidos` = bloqueo restante; `cuota_agotada` = hasta las 00:00 del día 1 del mes siguiente
(hora argentina, UTC−3, máx. 31 días); `limite_lecturas_contacto` = hasta las 00:00 del día siguiente;
`simultaneas_agotadas` y 503 = estimación corta configurable (30 s). Los vectores llevan `retry_after` y C9 lo contrasta.

Orden R61 (consentimiento → desafío → cupo → proveedores): el desafío se consume en `crearSesion`, que
no llama a proveedores ni reserva cupo; el consentimiento se registra después; `emitirTokenMedios` exige
consentimiento y reserva el cupo; recién con `sesion.autenticar` se llama a STT/LLM/TTS. Ningún proveedor
se toca antes de los tres.

## Cambios de 0.1.5 (T44: hallazgos de la revisión T04b1 y huecos B/C)
- **H1** orden de la tabla: solo la tasa por IP antes de autenticar; por credencial en el paso 8 y por enlace en el 13.
  Vectores nuevos: rechazos previos no consumen; `emitirDesafio` no usa el límite de la clave; límite por credencial
  en cada operación con credencial.
- **H2** `Consumo` sale de contadores persistentes (`segundos_reservados`, `reinicia_en`, `alerta_tenant`); ADR 0004 §10.
- **H3/B3** `TokenMedios.reserva` (`duracion_maxima_s`, `recortada_por_cuota`, `vence_en`); topes de tenant, asesor y
  global con el mismo código; ADR 0005 §4.
- **H4** `Retry-After` en 429 **y 503**, máximo 2 678 400 s; `Error.reintentar_en_s` igual al encabezado.
- **B6** CORS: 13 operaciones `OPTIONS` (`x-vc-preflight`), `x-vc-cors` en las rutas del widget, encabezados
  `Access-Control-*` y `Vary` declarados; el panel es del mismo origen y no tiene CORS.
- **B1** cotización como rango: `ItemCotizacion.{precio_unitario,importe}_{min,max}_centavos`,
  `Cotizacion.total_{min,max}_centavos` y `precio_final_centavos` opcional (solo tarifario `validada` y rango de un
  punto; con `referencia_publica_sin_validar` el esquema lo prohíbe). `ResumenCotizacion.total` igual. **Rompe** a fe
  (tipos generados y mocks de `panel-asesor/`) y a go (`dominio`/`api`): deben regenerar y adaptar.
- **B2** `VersionTarifas` = `tarifas-<año>@<version del archivo>` (`tarifas-2026@0.1.0`); el archivo real no cambia.
- **C6** `ReglaRetencion.plazo_dias_min/max` (obligatorios si `configurable`); el plazo por tenant lo fija la CLI.
- Sin cambios de catálogo de errores.

## Cambios de 0.1.4 respecto de lo que se recuerda de 0.1.3 (T39) e incorporación de T41
- **T41 aplicado**: Origin exacto por clave (`Origin`, `ClaveWidgetSolicitud`), `X-Desafio` como esquema de
  seguridad combinado con la clave pública y `emitirDesafio`, `MotivoCierre` conciliado (R60 + ADR 0006),
  `LimitesSesion.sin_voz_s`, `simultaneas_agotadas` y reserva en `emitirTokenMedios`, contacto con aviso y
  consentimiento específicos (`ContactoSolicitud`), registro de lecturas (`RegistroLectura`, límite de
  lecturas de contacto).
- T39 mantenido: `SesionDetalle` sin código ni derivación; `contacto_disponible` solo en `ResumenCotizacion`;
  `CatalogoTextos`; 401 distinguidos por `codigo`; `Consumo.diario`; `EnlaceCompartir.texto_compartir`;
  versión en `info.description`.
- T24/T31: cotización fuera de zona se emite con `fuera_de_zona: true` (regla if/then en `Cotizacion`).
- N1 de T16: cantidades en `CantidadCentesimas` (entero), importe con redondeo entero documentado.
- `DatosExtraidos` alinea `estado_superficie`, `urgencia` y `plazo` con los enums de cot.

## Supuestos declarados
- S1 `MotivoCierre`: `cliente_cerro` reemplaza a `cliente_colgo` (ADR 0006); `error` de R60 se separa en
  `error_proveedor` y `error_interno`. ADR 0006 debe actualizarse con este enum.
- S2 ARCO del cliente final entra por el tenant (clave secreta), porque la clave pública solo crea sesiones (R54).
- S3 Mecanismo del desafío: prueba de trabajo SHA-256, marcado `provisorio` (P7).
- S4 Normalización Go de la salida del LLM: `santa_clara_del_mar` → `santa_clara`; `mar_del_plata`, `otra`
  → `otra` (fuera de zona); `paisajismo` → `jardineria`; `otro`/`sin_definir` → sin cotización.
  `altura.metros_max` → banda de `DatosExtraidos.altura`.
- S5 Gestión de claves **secretas** de API (R1), alta de tenants, del primer administrador y de enlaces, baja de
  asesores y retención por tenant: **CLI `api`**, no rutas HTTP (B8, C5, C6; ADR 0005 §10). Webhooks (R30): fuera.
- S6 Montos de los ejemplos: ilustrativos, no son tarifas. Plazos de retención: propuesta, a validar con abogado.
- S7 Claves públicas del widget las administra un asesor con rol `administrador` desde el panel.

- S8 Panel del mismo origen que la API (proxy inverso): `/v1/panel/*` sin CORS; un `OPTIONS` ahí es ruta no declarada (404).
- S9 Tope global de gasto en **segundos** de llamada (no en dinero): la conversión dinero → segundos es de ops con la
  cifra de Rober (P2). El tope global no se expone a los tenants (R52).

## Huecos conocidos
- Vectores solo en modo estático. go ya los corre contra el servidor de la parte 1 desde Go; falta un modo HTTP en `ejecutar.mjs`.
- No resueltos en T44 (quedan para la próxima versión): B5 (función exacta de la prueba de trabajo, P7), B7
  (semántica de `Idempotency-Key`), B9 (token de sesión con Origin: seg), B10–B12 y C1 (`/salud`, `/listo`).
- Retención de asesores y de consentimientos (H4 de T43, C2): **pendiente de Rober/abogado** (ADR 0004 §8).
- Sin `oasdiff` 0.1.4 → 0.1.5 en la verificación: los cambios incompatibles (B1, B2) se listan arriba a mano.
- Sin `oasdiff` contra 0.1.3: esa versión se perdió (O07 queda para la próxima versión).
- Exportación ARCO del cliente final (respuesta a `acceso`) no tiene ruta de entrega: se responde fuera de banda.
- Textos legales del aviso y del contacto: a validar con abogado (R11, R68).
