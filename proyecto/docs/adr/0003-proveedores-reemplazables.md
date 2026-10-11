# ADR 0003 — Proveedores externos reemplazables (STT, LLM, TTS, WhatsApp)

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho; reemplaza la versión de T01)

## Contexto
Los servicios de IA cambian de precio, calidad y condiciones con frecuencia; casi todos están
fuera de Argentina (transferencia internacional de datos, Ley 25.326 — a validar con abogado)
y Rober todavía no definió cómo los paga ni el gasto máximo mensual. No hay proveedor elegido
con costos verificados (eso es T13). El producto no puede quedar atado a uno.

## Decisión
1. Un puerto Go por capacidad, con tipos propios del dominio (nunca tipos del SDK del
   proveedor en la firma):
   - `Transcriptor` (audio en streaming → parciales y finales, idioma es-AR).
   - `Extractor` (transcripción + fotogramas opcionales → JSON validado, ver 0002).
   - `Sintetizador` (texto → audio + marcas de tiempo opcionales para visemas).
   - `Mensajeria` (armado del enlace `wa.me`; sin envío automático por ahora, ver 0006).
2. Cada puerto tiene: adaptador falso (determinista, fallas inyectables) y adaptador real
   seleccionable por configuración (`PROVEEDOR_STT=...`). Producción rechaza los falsos.
3. Cada llamada a un proveedor lleva: tiempo límite, reintento acotado solo en errores
   transitorios, cortacircuito por proveedor y medición de consumo (segundos de audio,
   tokens, caracteres) por tenant para cuotas y costos (0005).
4. Los prompts y el esquema de salida están versionados en el repositorio (`conductas/`),
   no en la consola del proveedor; la versión usada se guarda con cada cotización.
5. Minimización: al proveedor se manda solo lo necesario para el turno; nada de identificadores
   del cliente ni del tenant. Se prefieren opciones del proveedor sin retención/entrenamiento
   con los datos, cuando existan (a confirmar por proveedor).
6. Elegir o cambiar de proveedor es una decisión registrada (anexo o ADR nuevo) con costo por
   minuto medido, fuente y fecha.

## Alternativas consideradas
- Un solo proveedor "todo en uno" (voz a voz): menos piezas, pero sin control de montos y con
  dependencia total; descartado por ahora (ver 0002).
- Modelos propios en la VM: sin costo por uso, pero la VM inicial no tiene GPU y la calidad
  en español rioplatense es incierta; se reevalúa con datos.
- Integrar SDKs directamente en el dominio: más rápido al inicio, caro de cambiar.

## Consecuencias
- (+) Cambiar de proveedor no toca dominio ni contrato público.
- (+) Pruebas sin costo ni red; se pueden simular caídas.
- (−) El mínimo común entre proveedores puede dejar sin usar funciones propias de alguno.
- (−) Hay que mantener un adaptador por proveedor y su prueba de conformidad.

## Verificación
- Batería de conformidad por puerto que corre contra el falso y, en un job manual con
  credenciales, contra el real.
- Prueba: con el cortacircuito abierto, la sesión cierra con motivo `error_proveedor` y el
  cliente ve un mensaje claro (no un cuelgue).
- Prueba: el payload enviado al proveedor (capturado por el falso) no contiene `tenant_id`,
  teléfono, nombre ni el código de referencia.
- Revisión de imports: ningún paquete de dominio importa SDKs de proveedores.

## Supuestos
- Ningún proveedor está elegido; no hay precios en este ADR (sin precios inventados).
- Forma de pago al exterior y gasto máximo mensual: pendientes de Rober.
- La transferencia internacional de datos de voz e imagen queda "a validar con abogado".

## Adaptador Gemini (T13a)
Fecha de la consulta de documentación: 2026-10-11. Estado: implementado y probado **sin red** (contra
`httptest`); **nunca se probó contra Google** porque no hay clave real. Código:
`backend/internal/proveedores/gemini` (solo `net/http` + `encoding/json`, sin SDK; implementa solo el puerto
`Extractor`). Activación: `PROVEEDOR_LLM=gemini`, `GEMINI_API_KEY`, `GEMINI_MODELO` (opcional) y
`GEMINI_URL_BASE` (solo pruebas; el arranque la rechaza en producción). Sin `PROVEEDOR_LLM=gemini` sigue el falso;
producción sigue rechazando cualquier puerto falso (STT, TTS y WhatsApp siguen siendo falsos, así que hoy
producción no arranca igual: es lo esperado).

**Modelo por defecto: `gemini-3.5-flash-lite`.** Motivo: la página de modelos lo describe como el modelo más
rápido y económico de la familia 3.5 (estable, no preview) y la página de precios lo lista "Free of charge" en el
nivel gratuito; para extraer campos de un turno corto de conversación no hace falta el modelo más grande. Si la
calidad en español rioplatense o la lectura de fotogramas no alcanza, se sube a `gemini-3.8-flash` cambiando
solo `GEMINI_MODELO`. Precios de pago consultados (por 1 M de tokens, USD): 3.5 Flash-Lite 0,30 entrada / 2,50 salida;
3.8 Flash 0,75 / 3,75 hasta el 31/12/2026 y 1,50 / 7,50 desde el 1/1/2027. Son valores de la página consultada, a
reconfirmar antes de presupuestar.

**Contrato con Google:** `POST {base}/models/{modelo}:generateContent`; clave en el encabezado `x-goog-api-key`
(nunca en la URL); `systemInstruction` = `CuerpoPrompt`; un turno de usuario con la transcripción y los fotogramas
como `inlineData` (`image/jpeg`, ≤128 KiB, máx. 8); `generationConfig.responseMimeType=application/json` +
`responseJsonSchema`. El esquema que se manda es una **adaptación** del contrato
(`conductas/esquema-salida-llm.schema.json`): se quitan `const`, `if/then` de `plazo`, `not/pattern` de
`respuesta_hablada`, `maxLength`, `exclusiveMinimum`, `uniqueItems` y `default`; esas reglas pasan a la descripción en
prosa. **El contrato no se toca y el backend valida la salida contra el esquema completo antes de usarla**; el
esquema no tiene campos de monto. Una prueba compara propiedades, `required`, enums y tipos contra el archivo del contrato
para detectar deriva. Errores tipados: cuota agotada, bloqueo por seguridad del proveedor, respuesta no-JSON,
timeout, credencial, no disponible; ninguno trae el cuerpo crudo ni la clave. Reintento: máx. 2, solo 429/5xx, con
backoff y `Retry-After`; si pide esperar más de 8 s no se espera (hay un cliente en línea).

### ADVERTENCIA: datos del nivel gratuito
Según los términos de la API de Gemini consultados (ai.google.dev/gemini-api/terms) y la tabla de precios, en el
**nivel gratuito ("Unpaid Services") Google usa lo que se envía y recibe para mejorar sus productos y modelos, y
personas revisoras pueden leerlo**; el servicio pago no lo usa para eso. Los términos piden no enviar información
sensible, confidencial ni personal al servicio gratuito. Por eso:
- **Solo datos ficticios hasta pasar a plan pago** (cuenta de facturación activa en el proyecto de Google Cloud).
  Eso incluye los scripts `proyecto/scripts/probar-gemini.{sh,ps1}` y cualquier prueba con personas reales.
- Confirmar en los términos **vigentes** el día que se contrate; esto se leyó una vez y puede cambiar.
- Los términos dicen que para clientes disponibles en el EEE, Suiza y Reino Unido solo se pueden usar servicios pagos.
- **A validar con abogado**: transferencia internacional de datos personales (voz transcripta, imágenes del hogar del
  cliente) a servidores de Google en el exterior bajo la Ley 25.326, y el consentimiento informado que
  lo cubra. No se cita ningún artículo.

### Riesgos
1. **No verificado contra el servicio real**: nombres de modelos, soporte de `responseJsonSchema` en `generateContent`
   por parte de 3.5 Flash-Lite, aceptación del esquema (puede rechazarlo por tamaño/anidación → 400) y forma exacta del
   cuerpo de error. El humo con `probar-gemini` es el primer paso; si falla, se achica el esquema en el adaptador.
2. **Cuota del nivel gratuito**: los límites numéricos (RPM/TPM/RPD) no figuran en la documentación consultada; se ven
   en AI Studio (aistudio.google.com/rate-limit) y se aplican por proyecto, no por clave; el diario se reinicia a medianoche
   hora del Pacífico. Con 5 llamadas simultáneas es probable chocar con el límite: el adaptador devuelve `ErrCuotaAgotada`
   y el orquestador debe cerrar con `error_proveedor`.
3. **Modelos que cambian o se retiran** (la página lista varios apagados): el modelo se configura por variable y la
   versión usada se guarda con la cotización.
4. **Razonamiento del modelo**: los tokens de "thoughts" se facturan como salida; se suman a `TokensSalida`. `maxOutputTokens=4096`
   los incluye; si se corta (`MAX_TOKENS`) se devuelve respuesta no-JSON.
5. **Filtros de seguridad de Google** pueden bloquear un turno legítimo; el error es distinguible para responder con un mensaje claro.
6. **Latencia**: no medida. Una llamada por turno en una videollamada necesita medición real (p95) antes de decidir.
7. **Inyección por la transcripción/imagen**: el modelo solo extrae; aun así la salida se valida y el precio lo calcula Go.
8. Latencia y datos viajan por internet hacia el exterior: sin retención propia de imágenes (no se guardan).

Fuentes (consultadas el 2026-10-11 con un lector que resume páginas; los textos no se leyeron en bruto):
ai.google.dev/gemini-api/docs/models, /pricing, /rate-limits, /structured-output, /image-understanding,
/api-errors, /troubleshooting, /terms y ai.google.dev/api/generate-content. Las páginas de estructura e imagen
ahora documentan la API "Interactions"; el método `generateContent` que usa este adaptador se confirmó por la
referencia de la API, y los nombres de campos REST (`responseJsonSchema`, `inlineData`, `usageMetadata`) se
tomaron de esa referencia y de la API conocida: **marcados como a verificar con el humo real**.
