# ADR 0002 — Pipeline de voz: transporte, STT, LLM extractor, precio en Go, TTS y visemas

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho; reemplaza la versión de T01)

## Contexto
El cliente habla con un avatar con apariencia de trabajador constructor que corre en el
navegador (decisión 1 del BRIEF: 3D con visemas más modo de clips pregrabados). La respuesta
tiene que sentirse conversacional, y el precio tiene que ser exacto, auditable y salir solo
al final (decisión 5). Un LLM no es confiable para hacer cuentas ni para resistir inyección
de prompts que pidan "un descuento".

## Decisión
1. Transporte: un WebSocket sobre TLS por sesión, autenticado con el token de sesión.
   Subida: tramas binarias (audio del micrófono y fotogramas de 0006) con un encabezado
   binario corto. Bajada: eventos JSON (texto, visemas, pizarrón, estado) y tramas de audio.
   Los eventos y el encabezado binario son BORRADOR: no se congelan todavía (BRIEF).
2. STT en streaming detrás del puerto `Transcriptor` (0003); el backend recibe parciales y
   finales; solo los finales disparan un turno del LLM.
3. LLM solo extrae datos: recibe transcripción (y fotogramas, 0006) y devuelve JSON validado
   contra un JSON Schema 2020-12 estricto (`additionalProperties: false`), SIN campos de monto
   ni de precio. Salida: `datos` (oficio, tarea, zona, cantidades, estado de superficie,
   altura, urgencia, etc.), `faltantes`, `siguiente_paso` y `respuesta_hablada`.
4. `respuesta_hablada` no puede contener montos: Go la valida (patrones de moneda y cifras
   con `$`, "pesos", "mil") y, si falla, la descarta y usa una frase de plantilla.
5. Si la salida no valida contra el esquema: 1 reintento con el error; si vuelve a fallar,
   plantilla segura y se registra el incidente (sin datos personales).
6. Precio calculado en Go, en centavos `int64`, desde las tablas de tarifas por oficio y
   zona (`tarifas/`). Las cantidades se normalizan a enteros (centésimas de la unidad, p. ej.
   m² × 100) antes de multiplicar; nunca se usa float en el cálculo (hallazgo N1 de T16).
   El tarifario 2026 es provisorio (`referencia_publica_sin_validar`) y no se activa en
   producción sin validación de un profesional.
   **Rango, no precio único (B1, T44, contrato 0.1.5).** El tarifario solo tiene rangos, así que
   el presupuesto se emite como `total_min_centavos`–`total_max_centavos`, con mínimo y máximo por
   ítem (mismo redondeo entero para cada extremo). `precio_final_centavos` es opcional y solo va
   cuando el tarifario está `validada` y el rango es un punto (min = max); con tarifas sin validar
   el contrato lo prohíbe. La versión del tarifario se publica como `tarifas-<año>@<version>`
   (B2: `tarifas-2026@0.1.0`), armada por Go desde el nombre y el campo `version` del archivo.
7. El precio se anuncia al final con una frase armada por Go (plantilla), no por el LLM: "entre
   $X y $Y, orientativo; lo confirma el profesional" (o un único monto si hay `precio_final_centavos`).
8. TTS detrás del puerto `Sintetizador`; se envía el audio y, si el proveedor da marcas de
   tiempo de fonemas, se convierten a visemas en el servidor; si no, el navegador estima
   visemas del audio. En modo clips no se usa TTS: se elige un clip por `siguiente_paso`.
9. Esquema de `siguiente_paso` (objeto):
   `{ "accion": enum, "motivo": string ≤ 200, "campos": [string] }` con `accion` en:
   `preguntar` · `pedir_ver` (mostrar algo a la cámara) · `confirmar_datos` ·
   `emitir_presupuesto` · `fuera_de_zona` · `fuera_de_alcance` · `derivar_whatsapp` · `cerrar`.
   `fuera_de_zona` NO impide emitir: se puede emitir con la marca correspondiente (corrige el
   error de T24). La decisión final de emitir la toma Go, no el LLM.

## Alternativas consideradas
- LLM que calcula el precio: inexacto, manipulable por el cliente; descartado.
- Modelo voz a voz de punta a punta: menos control sobre montos y visemas; no permite
  validar la salida con esquema. Queda para reevaluar con costos reales (T13).
- WebRTC con servidor de medios: más robusto en redes malas pero suma infraestructura;
  se reevalúa si el WebSocket falla en las pruebas con dispositivos reales (T08).

## Consecuencias
- (+) Montos exactos y reproducibles; el LLM no puede "regalar" descuentos.
- (+) Rango honesto (B1): no se publica el máximo como si fuera el precio (lo que hacía la parte 1)
  ni el mínimo como gancho; el cliente ve la incertidumbre real de un tarifario sin validar.
- (−) Cambio incompatible de 0.1.5: `ItemCotizacion`, `Cotizacion` y `ResumenCotizacion.total`
  cambian de campos; go (dominio/api, que ya guarda min y max) y fe (tipos generados y mocks del
  panel) tienen que adaptarse. El panel y la plantilla de voz muestran dos cifras.
- (−) Un rango ancho (los de la tarifa pública llegan a ×2 o más) puede desalentar al cliente:
  Rober decide si se acota con presupuestos reales (P9); el contrato no cambia por eso.
- (+) Cada etapa se prueba con falsos (0001).
- (−) Latencia sumada STT + LLM + TTS; hay que medirla (no medida todavía).
- (−) Visemas estimados en el navegador sincronizan peor que los del proveedor.

## Verificación
- Validador de esquemas (ajv strict) con ejemplos positivos y negativos en 0 fallas; un
  negativo con campo `precio`/`monto` tiene que fallar.
- Pruebas de tabla en Go del cálculo: mismos datos → mismos centavos; sin float en el paquete
  (chequeo estático).
- Prueba del filtro: `respuesta_hablada` con montos se reemplaza por plantilla.
- Prueba con LLM falso que devuelve JSON inválido dos veces → plantilla segura.
- Caso "fuera de zona" emite presupuesto marcado.

## Supuestos
- T05 cambió 2 valores de `siguiente_paso` respecto de la versión anterior de este ADR; ese
  detalle se perdió. El enum de arriba es la propuesta vigente y cot debe conciliarlo.
- El token de sesión se manda en el primer mensaje del WebSocket, no en la URL (a probar en
  navegadores reales).
