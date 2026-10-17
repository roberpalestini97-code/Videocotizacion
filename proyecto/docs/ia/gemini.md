# LLM con clave gratuita: Google Gemini (T13)

Estado: adaptador en `internal/proveedores/gemini`. Las pruebas automáticas usan un servidor falso
(`httptest`). Con la clave de AI Studio (fuera del repo) se midió la API real el 2026-10-12: ver
«Medición» y «Costo por minuto». Nivel gratuito: solo datos ficticios.

Decisión de Rober (2026-10-10): el cliente habla con el navegador (reconocimiento de voz es-AR del
navegador) y el navegador sintetiza la voz del avatar; el servidor NO hace STT ni TTS. El LLM es
Gemini por REST con clave gratuita de AI Studio. El puerto `proveedores.Extractor` queda abierto para
cambiar de proveedor (ADR 0003): cambiar es otro adaptador y `PROVEEDOR_LLM=<otro>`.

## Aviso importante: datos y nivel gratuito

En los términos de la API (https://ai.google.dev/gemini-api/terms, "Last updated 2026-04-28 UTC",
consultados el 2026-10-10), para los **servicios no pagos** Google dice que usa el contenido enviado y
las respuestas para proveer y **mejorar sus productos** y tecnologías de aprendizaje automático, que
**revisores humanos pueden leer, anotar y procesar** entradas y salidas, y pide: *"Do not submit
sensitive, confidential, or personal information to the Unpaid Services."* Para los **servicios pagos**
dice que no usa los prompts ni las respuestas para mejorar sus productos (los registra por un tiempo
limitado para abuso y obligaciones legales, bajo un anexo de tratamiento de datos). La tabla de precios
(https://ai.google.dev/gemini-api/docs/pricing) marca "Used to improve our products": nivel gratuito
**Yes**, pago **No**. Además: mayores de 18 años, y en el EEE, Suiza y Reino Unido solo servicios pagos.

Por eso:

- **Con clave gratuita: solo datos y personas ficticias** (pruebas internas, demos con actores).
  Nada de clientes reales: el turno manda al modelo el texto del cliente y fotogramas de su casa.
- **Con clientes reales**: pasar a plan pago (o a otro proveedor con condiciones de no
  entrenamiento) y **consultarlo con el abogado** (Ley 25.326, transferencia internacional de datos;
  ver ADR 0003 y 0006). Hasta entonces no se abre al público.
- El adaptador ya minimiza: no manda ids de sesión ni de tenant, teléfono, nombre, código de
  referencia ni tokens (lo verifica `TestSesionDePuntaAPuntaConPostgresYGemini`). Pero el texto y la
  imagen del cliente sí van: son el insumo del turno.

## Crear la clave (gratis)

1. Entrar a https://aistudio.google.com/apikey con una cuenta de Google (mayor de 18).
2. Aceptar los términos. AI Studio crea un proyecto de Google Cloud por defecto con su clave (cada clave
   está atada a un proyecto; los límites son **por proyecto**, no por clave).
3. "Create API key" en ese proyecto. Copiarla una sola vez a un gestor de contraseñas.
4. Recomendado por Google (https://ai.google.dev/gemini-api/docs/api-key): restringir la clave a la API
   de Gemini (y por IP si la VM tiene IP fija), no subirla al repo, no ponerla en el navegador
   (siempre detrás del backend, como acá) y poner alertas de facturación si algún día se activa el pago.

## Entorno de la máquina de desarrollo

Los valores con los que levantamos backend y videollamada, y cómo crearlos en un clone nuevo, están en `ENTORNO.md` (raíz del monorepo) y en `backend/.env.example`. La clave no se commitea: va en `GEMINI_API_KEY` dentro de `backend/.env`.

## Variables

| Variable | Obligatoria | Valor |
|---|---|---|
| `PROVEEDOR_LLM` | sí | `gemini` |
| `PROVEEDOR_STT` / `PROVEEDOR_TTS` | sí | `navegador` (la voz es del cliente; el servidor no la procesa) |
| `PROVEEDOR_WHATSAPP` | sí | `enlace` (arma `wa.me`, no envía nada) |
| `GEMINI_API_KEY` | una de las dos | la clave. Preferible el archivo en producción |
| `GEMINI_API_KEY_FILE` | una de las dos | ruta a un archivo con la clave (secreto de Docker); no las dos a la vez |
| `GEMINI_MODEL` | no | por defecto `gemini-3.1-flash-lite` |
| `GEMINI_TIMEOUT` | no | por intento HTTP, por defecto `20s`. Con 2 reintentos cubre un Gemini saturado que a veces no cierra el socket (si no, un solo intento de 60s deja la consola en silencio) |
| `GEMINI_REINTENTOS` | no | 0..5, por defecto 2; solo ante HTTP 429 y 5xx, con backoff exponencial y jitter (respeta `Retry-After` hasta 10 s) |
| `GEMINI_URL_BASE` | no | solo pruebas locales (`http://127.0.0.1:...`); en producción, vacío o `https://` |

Ejemplo de desarrollo (datos ficticios):

```sh
ENTORNO=desarrollo ALMACEN=memoria \
PROVEEDOR_STT=navegador PROVEEDOR_TTS=navegador PROVEEDOR_WHATSAPP=enlace \
PROVEEDOR_LLM=gemini GEMINI_API_KEY_FILE=$HOME/.config/vc/gemini.key \
go run ./cmd/api servir
```

Ojo: la clave en Docker va en `infra/secrets/gemini_api_key` (no se versiona) y el compose
la monta como `GEMINI_API_KEY_FILE`. El contenedor recibe `PROVEEDOR_STT=navegador`,
`PROVEEDOR_TTS=navegador`, `PROVEEDOR_LLM=gemini` y `PROVEEDOR_WHATSAPP=enlace`.

## Modelo por defecto (verificado 2026-10-13)

`gemini-3.1-flash-lite`: el 2026-10-13 `gemini-3.5-flash-lite` (y 3.8-flash) devolvían HTTP 503 o
se colgaban; `gemini-3.1-flash-lite` respondió 200 en 6–9 s con `responseJsonSchema`. Acepta
imagen y salida estructurada. Cambiar con `GEMINI_MODEL`. Los 2.5 no están habilitados en esta
clave (HTTP 404).

## Cómo llama el adaptador (`internal/proveedores/gemini`)

- `POST {URL_BASE}/models/{modelo}:generateContent`, clave **solo** en `x-goog-api-key` (nunca en la URL,
  errores ni logs; el paquete no loguea; prueba `TestLaClaveNoApareceEnErroresNiLogs`).
- `systemInstruction` = el prompt del oficio (`conductas/prompts/*.md`, `CuerpoPrompt`).
- `contents[0]` (rol `user`): los datos ya anotados (última salida validada, sin ids), el mensaje del
  cliente marcado como dato y no como instrucción, la corrección de Go si es el reintento, y hasta 4
  fotogramas JPEG como `inlineData` base64 (el WebSocket manda los 2 más recientes; cada imagen va una
  sola vez y no se guarda).
- `generationConfig`: `responseMimeType: application/json`, `responseJsonSchema` derivado de
  `conductas/esquema-salida-llm.schema.json`, `temperature` 0.2, `maxOutputTokens` 2048, 1 candidato.
  `responseSchema` (OpenAPI) lo rechaza `gemini-3.5-flash-lite` con HTTP 400 (`INVALID_ARGUMENT`),
  que el turno ve como `proveedor_no_disponible` y el avatar no llega a hablar.
  El esquema completo también devuelve 400: la suma de los enums pasa el tope del modelo.
  `tipo_cliente` (no cambia el precio) viaja como `string` con los valores en la descripción;
  Go sigue exigiendo el enum.
- El `responseJsonSchema` es JSON Schema (tipos en minúscula): se conservan `type`, `enum`
  (`const` → enum de un valor), `additionalProperties`, requeridos, `items`, `min/maxItems`,
  `minimum/maximum` y `propertyOrdering`; `["tipo","null"]` pasa a `anyOf`. Se descartan
  `not/pattern`, `if/then`, `uniqueItems`, `exclusiveMinimum`, `min/maxLength` y `default`.
  **El esquema del proveedor no es garantía**: Go vuelve a
  validar todo con `cotizador.ValidarSalidaLLM` (campos desconocidos como `precio`/`monto`/`descuento`
  se rechazan; montos en `respuesta_hablada` se reemplazan por plantilla). Si no valida: 1 reintento con
  una corrección fija; si vuelve a fallar, el avatar contesta con plantilla y no se guarda nada.
- Límites: cuerpo HTTP ≤ 256 KiB, texto JSON ≤ 32 KiB; `finishReason` distinto de `STOP` (p. ej.
  `MAX_TOKENS`, `SAFETY`) o `promptFeedback.blockReason` → `validacion_fallida`.
- Errores al catálogo, sin cuerpo ni URL: 429 → `proveedor_no_disponible` con causa
  `ErrCuotaProveedor` (la sesión cierra con `cuota_agotada` y deriva a WhatsApp); 5xx, 4xx, red y
  cancelación → `proveedor_no_disponible`.
- Consumo: `usageMetadata.promptTokenCount` (entrada) y `candidatesTokenCount + thoughtsTokenCount`
  (salida) por turno (`TextoSalida.Tokens*`, en el log del turno) y acumulado (`Extractor.Consumo()`).

## Arquitectura (proveedores elegidos)

Una VM corre la API Go, PostgreSQL y el proxy (Compose, T11). El navegador del cliente hace el
reconocimiento de voz (es-AR) y la síntesis del avatar: el servidor no paga STT ni TTS. El único
modelo de pago posible es Gemini, llamado por REST desde el backend (la clave no sale al navegador).
WhatsApp es un enlace `wa.me`, sin API de Meta. Cambiar de LLM es otro adaptador de
`proveedores.Extractor` (ADR 0003).

## Medición 2026-10-12

Comando: `go run ./cmd/medir-gemini` desde `proyecto/backend` (lee `GEMINI_API_KEY` de `.env`, no la
imprime). Usa el adaptador de producción: prompt `conductas/prompts/pintura.md`, `responseJsonSchema`
derivado del esquema 1.0, temperatura 0.2, sin reintentos, timeout 60 s. Textos y fotos son ficticios
(pared lisa, sin personas). Cada salida pasó `cotizador.ValidarSalidaLLM`.

`tokens_salida` es `candidatesTokenCount + thoughtsTokenCount` (el adaptador no los separa; no hay
`thinkingConfig`).

| Caso | Latencia | Tokens entrada | Tokens salida | JSON válido |
|---|---:|---:|---:|---|
| texto 1 | 4546 ms | 640 | 421 | sí |
| texto 2 | 2595 ms | 626 | 473 | sí |
| texto 3 | 1944 ms | 631 | 343 | sí |
| texto + 2 JPEG 64×48 | 2757 ms | 2757 | 326 | sí |
| texto + 1 JPEG 960×540 (8753 bytes) | 2553 ms | 1729 | 388 | sí |

Una pasada anterior el mismo día, solo texto, también 3/3 válidas (1994–3699 ms; entrada 626–640).
La latencia de texto de esta tabla va de 1,9 s a 4,5 s. Cada pedido se midió sin
`DatosPrevios`: en una llamada real, del segundo turno en adelante el JSON ya validado
viaja otra vez (unos cientos de tokens de entrada más por turno).

Un fotograma de 960×540 sumó unos 1100 tokens de entrada respecto del texto solo (~630). Dos
fotogramas chicos sumaron unos 2100. El turno real manda como máximo 2 JPEG de hasta 1024 px.

## Costo por minuto

Fuente de precios: https://ai.google.dev/gemini-api/docs/pricing , consultada el 2026-10-12.
`gemini-3.5-flash-lite`, columna Standard del plan pago: **0,30 USD / 1 M tokens de entrada**
(texto, imagen, video o audio) y **2,50 USD / 1 M de salida**, thoughts incluidos. El nivel gratuito
figura «Free of charge» y «Used to improve our products: Yes». Batch y Flex salen más baratos en esa
página; este adaptador no usa Batch.

STT, TTS y el enlace de WhatsApp: **0 USD** de proveedor.

Costo de un turno en plan pago Standard, con los tokens de la tabla:

| Caso | USD por turno |
|---|---:|
| texto (promedio 632 entrada, 412 salida) | 0,00122 |
| 2 fotogramas (2757 / 326) | 0,00164 |
| 1 fotograma 960×540 (1729 / 388) | 0,00149 |

La llamada no se cobra por minuto de audio. El costo por minuto es turnos por minuto × costo del turno.
Supuesto de una cotización corta (no medido en una llamada completa): 4 turnos con 2 fotogramas en 3
minutos → 4 × 0,00164 = **0,0066 USD por llamada**, **0,0022 USD por minuto**. Rango con estos tokens:

- 1 turno de solo texto por minuto: **0,0012 USD/min**
- 2 turnos con 2 fotogramas por minuto: **0,0033 USD/min**

Ejemplo: 100 llamadas de ese supuesto son unos 0,66 USD de Gemini. El tope mensual lo define Rober
(pregunta P-gasto, todavía abierta). Pasar a plan pago (Tier 1 en
https://ai.google.dev/gemini-api/docs/rate-limits , tope de facturación 250 USD) hace falta antes de
clientes reales, porque el nivel gratuito permite que Google use el contenido para mejorar sus productos.

## Límites que siguen sin número

RPM, TPM y RPD del proyecto **no están** en la documentación pública (misma página de rate limits,
«Last updated 2026-10-09 UTC»): se ven en AI Studio y cambian por modelo y cuenta. RPD se reinicia a
medianoche del Pacífico. No se disparó una ráfaga hasta el 429 para no gastar la cuota del día.
El nivel gratuito no tiene tope de gasto por 10 minutos; Tier 1 pago sí (10 USD / 10 min, según esa página).

## A verificar todavía

- Los 12 ejemplos de `conductas/` contra el modelo real (rúbrica de T17).
- El techo de RPM/RPD de esta cuenta, leído en AI Studio (no adivinado).
- Revisión independiente de T13 y T25 (quien mide no se revisa).
