# LLM con clave gratuita: Google Gemini (T13)

Estado: adaptador implementado y probado **solo contra un servidor falso** (`httptest`). No se llamó
nunca a la API real (no hay clave y el entorno de desarrollo no llega a `generativelanguage.googleapis.com`).

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

## Variables

| Variable | Obligatoria | Valor |
|---|---|---|
| `PROVEEDOR_LLM` | sí | `gemini` |
| `PROVEEDOR_STT` / `PROVEEDOR_TTS` | sí | `navegador` (la voz es del cliente; el servidor no la procesa) |
| `PROVEEDOR_WHATSAPP` | sí | `enlace` (arma `wa.me`, no envía nada) |
| `GEMINI_API_KEY` | una de las dos | la clave. Preferible el archivo en producción |
| `GEMINI_API_KEY_FILE` | una de las dos | ruta a un archivo con la clave (secreto de Docker); no las dos a la vez |
| `GEMINI_MODEL` | no | por defecto `gemini-3.5-flash-lite` |
| `GEMINI_TIMEOUT` | no | por intento, por defecto `20s` |
| `GEMINI_REINTENTOS` | no | 0..5, por defecto 2; solo ante HTTP 429 y 5xx, con backoff exponencial y jitter (respeta `Retry-After` hasta 10 s) |
| `GEMINI_URL_BASE` | no | solo pruebas locales (`http://127.0.0.1:...`); en producción, vacío o `https://` |

Ejemplo de desarrollo (datos ficticios):

```sh
ENTORNO=desarrollo ALMACEN=memoria \
PROVEEDOR_STT=navegador PROVEEDOR_TTS=navegador PROVEEDOR_WHATSAPP=enlace \
PROVEEDOR_LLM=gemini GEMINI_API_KEY_FILE=$HOME/.config/vc/gemini.key \
go run ./cmd/api servir
```

Ojo: `infra/docker-compose.yml` y `infra/.env.example` todavía usan nombres `VC_PROVEEDOR_*` /
`VC_LLM_API_KEY` que la API no lee (pendiente de ops, anotado en `docs/review/T13-huecos-del-contrato.md`).

## Modelo por defecto (verificado 2026-10-10)

`gemini-3.5-flash-lite`: según https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite es
**estable**, acepta **imágenes** (y texto, audio, video, PDF), soporta **salida estructurada**, entrada
1.048.576 tokens y salida 65.536; la página de modelos lo recomienda (junto con `gemini-3.8-flash`) para
proyectos nuevos, y la de precios lo lista con nivel gratuito. Alternativa más capaz: `gemini-3.8-flash`
(también con nivel gratuito). Los modelos 2.0 están dados de baja y los 2.5 tienen acceso limitado.

## Cómo llama el adaptador (`internal/proveedores/gemini`)

- `POST {URL_BASE}/models/{modelo}:generateContent`, clave **solo** en `x-goog-api-key` (nunca en la URL,
  errores ni logs; el paquete no loguea; prueba `TestLaClaveNoApareceEnErroresNiLogs`).
- `systemInstruction` = el prompt del oficio (`conductas/prompts/*.md`, `CuerpoPrompt`).
- `contents[0]` (rol `user`): los datos ya anotados (última salida validada, sin ids), el mensaje del
  cliente marcado como dato y no como instrucción, la corrección de Go si es el reintento, y hasta 4
  fotogramas JPEG como `inlineData` base64 (el WebSocket manda los 2 más recientes; cada imagen va una
  sola vez y no se guarda).
- `generationConfig`: `responseMimeType: application/json`, `responseSchema` derivado de
  `conductas/esquema-salida-llm.schema.json`, `temperature` 0.2, `maxOutputTokens` 2048, 1 candidato.
- El `responseSchema` es el subconjunto OpenAPI de Gemini: se conservan tipos, `nullable`, `enum`
  (`const` → enum de un valor), requeridos, `items`, `min/maxItems`, `minimum/maximum` y
  `propertyOrdering`; se descartan `additionalProperties`, `not/pattern`, `if/then`, `uniqueItems`,
  `exclusiveMinimum`, `min/maxLength` y `default`. **El esquema del proveedor no es garantía**: Go vuelve a
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

## A verificar con la clave real (no probado)

- Que `generateContent` siga aceptando `responseSchema` tal como lo arma el adaptador (la documentación
  nueva de salida estructurada muestra la Interactions API con `response_format`; la referencia de
  `generateContent` sigue vigente pero no se pudo leer la sección de `GenerationConfig`). Si devuelve 400,
  probar `responseJsonSchema` o la Interactions API: es un cambio acotado al adaptador.
- Límites reales del nivel gratuito (RPM, TPM, RPD): **no figuran en la documentación**; se ven en AI
  Studio ("View your active rate limits") y cambian por modelo y cuenta. RPD se reinicia a medianoche del
  Pacífico. Medir cuántos turnos por día alcanzan antes de una demo.
- Latencia por turno con 2 fotogramas, tokens reales por turno (imagen incluida) y si el modelo "piensa"
  por defecto (sube `thoughtsTokenCount`); no se configuró `thinkingConfig`.
- Calidad en español rioplatense con los 12 ejemplos de `conductas/` (correr un guion con la clave).
