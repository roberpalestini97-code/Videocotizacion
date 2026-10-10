# Estado de congelamiento del contrato — 0.1.4-borrador (2026-10-08)

Autor: arq. Rehecho desde cero tras la pérdida del entorno, a partir de `docs/BRIEF.md`,
`docs/respaldo-tablero.md` (T02, T31, T32, T35, T36, T37, T39, T41), ADR 0001–0006,
`docs/seguridad/requisitos-para-contrato.md` (R1–R70) y `T15-modelo-de-amenazas.md`.
**Falta revisión de un modelo distinto del autor, con seg como co-revisor** (regla del equipo).

| Pieza | Estado | Candidato a 1.0.0 |
|---|---|---|
| `openapi.yaml` (35 operaciones) + `schemas/*.schema.json` + `catalogo-errores.json` | borrador 0.1.4 | **Sí** (único candidato) |
| `eventos-sesion.md` + `schemas/eventos/*` (eventos WebSocket y encabezado binario) | **NO CONGELADO** | No |
| `../conductas/esquema-salida-llm.schema.json` (lo mantiene cot) | referenciado por ruta relativa desde `RespuestaModelo` | No (P5) |

## Condiciones para pasar el OpenAPI a 1.0.0
1. Revisión independiente (rev + seg) sin hallazgos obligatorios abiertos.
2. Verificación en 0 fallas (abajo) en CI (T12).
3. go implementa T04b contra este contrato y los vectores corren contra el servidor (hoy solo modo estático).
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
Implementada en `pruebas/ejecutar.mjs` (`decidir`) y contrastada con cada vector:
1. tasa excedida → 429 `limite_de_tasa`
2. sin credencial (o ruta del panel sin cookie) → 401 `credencial_ausente`; revocada → 401 `credencial_invalida`; sesión del panel vencida → 401 `sesion_vencida`
3. tipo de credencial no admitido → 403 `alcance_insuficiente`
4. clave secreta con `Origin` → 403 `clave_secreta_desde_navegador` (R2)
5. clave pública con `Origin` ausente/ajeno/comodín → 403 `origen_no_permitido`; panel (escritura) con Origin ajeno → 403 `origen_no_permitido`, sin CSRF → 403 `csrf_invalido`
6. `X-Desafio` ausente/vencido/reusado/de otro Origin o clave → 403 `desafio_invalido`
7. rol insuficiente → 403 `alcance_insuficiente`; acción sensible sin reautenticación ≤ 5 min → 401 `reautenticacion_requerida`
8. cuerpo inválido (incluye `tenant_id` en el cuerpo) → 422 `validacion_fallida`
9. login: intentos → 429 `intentos_excedidos`; contraseña → 401 `credenciales_incorrectas`; TOTP inválido o reusado → 401 `totp_invalido`
10. recurso inexistente, de otro tenant, de otra sesión o de otro asesor → **el mismo** 404 `no_encontrado` (R5, R41, R64)
11. estado de la sesión → 409 (`consentimiento_requerido`, `sesion_cerrada`, `estado_invalido`, `cotizacion_no_emitida`, `contacto_ya_registrado`)
12. cupo (solo `crearSesion` y `emitirTokenMedios`) → 429 `cuota_agotada` / `simultaneas_agotadas`; lecturas de contacto → 429 `limite_lecturas_contacto`
13. éxito.

Orden R61 (consentimiento → desafío → cupo → proveedores): el desafío se consume en `crearSesion`, que
no llama a proveedores ni reserva cupo; el consentimiento se registra después; `emitirTokenMedios` exige
consentimiento y reserva el cupo; recién con `sesion.autenticar` se llama a STT/LLM/TTS. Ningún proveedor
se toca antes de los tres.

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
  Implementación T04 (2026-10-10): `cotizador.OficioDesdeSalidaLLM` en `MapaDatosExtraidos`; turnos WS
  usan `prompts.MaterialTurno` para cargar `conductas/prompts/paisajismo.md` cuando la última salida LLM
  trae `"oficio":"paisajismo"` (el enum `Oficio` del contrato sigue en cinco valores; T06 distingue
  jardinería de paisajismo solo en el esquema de salida del modelo).
- S5 Rutas de gestión de claves **secretas** de API (R1) y webhooks (R30): fuera de este contrato (T04).
- S6 Montos de los ejemplos: ilustrativos, no son tarifas. Plazos de retención: propuesta, a validar con abogado.
- S7 Claves públicas del widget las administra un asesor con rol `administrador` desde el panel.

## Huecos conocidos
- Vectores solo en modo estático: no hay servidor (T04b). Pendiente un modo HTTP en `ejecutar.mjs`.
- Sin `oasdiff` contra 0.1.3: esa versión se perdió (O07 queda para la próxima versión).
- Exportación ARCO del cliente final (respuesta a `acceso`) no tiene ruta de entrega: se responde fuera de banda.
- Textos legales del aviso y del contacto: a validar con abogado (R11, R68).
