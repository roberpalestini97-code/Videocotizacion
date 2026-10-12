# Revisión T13 y T25 · Medición de Costo/Latencia de Gemini y Orquestador de Turno
Revisor: Agente rev (independiente; modelo distinto del autor) · 2026-10-12 · Commit b188b7c (main)
Comandos corridos:
- `go test ./internal/proveedores/gemini ./internal/turno ./internal/cotizador` (ok, cached / 15.35s)
- `git status`, `git diff proyecto/docs/ia/gemini.md`, `git diff proyecto/docs/tablero/datos.js`
- Verificación aritmética manual de tasas de tokens y costos por minuto
No probado:
- Ejecución directa de `cmd/medir-gemini` con clave real (restricción estricta de seguridad: no acceder a `backend/.env` ni a `GEMINI_API_KEY`).
- Pruebas con `docker compose up` en vivo (sin daemon de Docker activo en este entorno).
- Concurrencia con `-race` en Go (requiere toolchain CGO/gcc no disponible en entorno Windows local).

---

## 1. Alcance y Contexto de la Revisión

La presente revisión independiente analiza:
1. **Medición T13**: adapter `internal/proveedores/gemini`, medición real del 2026-10-12 publicada en `docs/ia/gemini.md`, script de prueba `backend/cmd/medir-gemini/main.go`, protección de secretos/logs y verificación aritmética de costos y latencias.
2. **Orquestador T25**: orquestación del turno de medios en `backend/internal/rutas/socket_entrada.go`, lógica de turno en `backend/internal/turno`, cálculo de precios exclusivo en Go (`backend/internal/cotizador`), validación estricta de salida del LLM y mitigación de inyecciones adversarias.
3. **Estado de los huecos del contrato**: vigencia del informe previo `docs/review/T13-huecos-del-contrato.md` respecto al contrato y a la infraestructura.

---

## 2. Verificación de la Aritmética Publicada (T13)

Se contrastaron minuciosamente los valores y cálculos publicados en `docs/ia/gemini.md` (sección *Medición 2026-10-12* y *Costo por minuto*):

1. **Turno de solo texto (promedio de 3 casos)**:
   - Tokens de entrada: \((640 + 626 + 631) / 3 = 1897 / 3 = 632{,}33\dots\) \(\rightarrow\) 632 tokens.
   - Tokens de salida: \((421 + 473 + 343) / 3 = 1237 / 3 = 412{,}33\dots\) \(\rightarrow\) 412 tokens.
   - Tarifas Google Gemini (Plan Standard pago, `gemini-3.5-flash-lite`):
     - Entrada: 0,30 USD / 1.000.000 tokens (\(0{,}00000030\) USD/token).
     - Salida: 2,50 USD / 1.000.000 tokens (\(0{,}00000250\) USD/token).
   - Cálculo:
     \[
     (632 \times 0{,}00000030) + (412 \times 0{,}00000250) = 0{,}00018960 + 0{,}00103000 = 0{,}00121960\text{ USD}
     \]
     Redondeo a 5 decimales: **0,00122 USD/turno**. **VERIFICADO (Exacto)**.

2. **Turno con texto + 2 fotogramas (2757 entrada / 326 salida)**:
   - Cálculo:
     \[
     (2757 \times 0{,}00000030) + (326 \times 0{,}00000250) = 0{,}00082710 + 0{,}00081500 = 0{,}00164210\text{ USD}
     \]
     Redondeo a 5 decimales: **0,00164 USD/turno**. **VERIFICADO (Exacto)**.

3. **Turno con texto + 1 fotograma 960×540 (1729 entrada / 388 salida)**:
   - Cálculo:
     \[
     (1729 \times 0{,}00000030) + (388 \times 0{,}00000250) = 0{,}00051870 + 0{,}00097000 = 0{,}00148870\text{ USD}
     \]
     Redondeo a 5 decimales: **0,00149 USD/turno**. **VERIFICADO (Exacto)**.

4. **Costo por minuto en llamada corta supuesta**:
   - Supuesto: 4 turnos con 2 fotogramas en 3 minutos.
   - Costo total de llamada:
     \[
     4 \times 0{,}0016421\text{ USD} = 0{,}0065684\text{ USD} \approx 0{,}0066\text{ USD/llamada}
     \]
   - Costo por minuto:
     \[
     0{,}0065684 / 3 = 0{,}0021894\dots\text{ USD/min} \approx 0{,}0022\text{ USD/min}
     \]
     **VERIFICADO (Exacto)**.
   - Costo de 100 llamadas del supuesto: \(100 \times 0{,}0065684 \approx 0{,}66\text{ USD}\). **VERIFICADO**.

---

## 3. Hallazgos

### H1 · Omisión de `DatosPrevios` acumulados en la medición de turnos subsecuentes (T13)
- **Severidad:** BAJA
- **Ítem violado:** Estimación realista de costos (L07 / ADR 0005).
- **Evidencia:** En `backend/cmd/medir-gemini/main.go` (líneas 65-98), todas las llamadas de prueba inicializan `proveedores.PedidoExtraccion` con `DatosPrevios` omitido (`nil`). En una conversación real de 4 turnos, los turnos 2, 3 y 4 incluyen en el prompt los datos estructurados acumulados del turno anterior (`internal/proveedores/gemini/gemini.go` líneas 315-318: `"Datos ya anotados en turnos anteriores..."`), lo que añade ~300 a ~450 tokens adicionales de entrada por turno.
- **Impacto:** En los turnos 2, 3 y 4, los tokens de entrada no serán ~632 sino ~1000 tokens, lo que añade aprox. 0,00012 USD por turno (un incremento de ~7% en el costo de esos turnos). Aunque el desvío absoluto es marginal, debe documentarse como premisa.
- **Corrección:** SUGERIDA — Agregar en `docs/ia/gemini.md` una aclaración sobre la acumulación de contexto JSON en turnos multi-turno y/o adaptar `medir-gemini` para encadenar las salidas previas.
- **Prueba de cierre:** Documentación actualizada con el rango de impacto multi-turno.

---

### H2 · Latencia elevada de Gemini REST para videollamada interactiva (T13)
- **Severidad:** MEDIA
- **Ítem violado:** Criterio de interactividad en videollamada (ADR 0002 / T13).
- **Evidencia:** En la tabla de `docs/ia/gemini.md`, las latencias de procesamiento del modelo van de 1944 ms a 4546 ms (promedio ~2,8 segundos solo en la API de Google). Sumando el tiempo de silencio que requiere el reconocedor del cliente para emitir la transcripción final (~500–1000 ms), el viaje de red del WebSocket (~50–100 ms) y el arranque de la síntesis en el navegador (~200 ms), el tiempo total de respuesta percibido por el usuario se ubica entre 2,7 s y 5,8 s. Además, si ocurre un reintento por falla de esquema (`extraerValidada`), el tiempo de espera puede duplicarse (~8–9 s).
- **Impacto:** Pausas de 3 a 5 segundos de silencio total entre que el cliente termina de hablar y el avatar responde pueden causar incomodidad, dudas sobre si se cortó la llamada o interrupciones por parte del cliente.
- **Corrección:** SUGERIDA — Prever en el front un estado visual interactivo inmediato (ej. avatar en actitud de escucha/atención al recibir la transcripción) y registrar métricas de latencia de punta a punta en producción.
- **Prueba de cierre:** Métricas de latencia monitoreadas en pruebas de usuario de la llamada completa.

---

### H3 · Fotogramas sintéticos uniformes en `medir-gemini` vs. imágenes reales (T13)
- **Severidad:** BAJA
- **Ítem violado:** Cobertura de casos de prueba realistas (G09).
- **Evidencia:** En `backend/cmd/medir-gemini/main.go` líneas 84-95, las imágenes de prueba son generadas sintéticamente mediante `jpegChico` rellenando un rectángulo con un color plano RGBA uniforme, resultando en un archivo de solo 8.753 bytes para 960×540 px. Un fotograma real de cámara con texturas y compresión JPEG ronda los 60–120 KiB.
- **Impacto:** Si bien la tokenización en Gemini depende de la cuadrícula de resolución y no del tamaño comprimido (por lo que el conteo de tokens es representativo), la latencia de serialización base64 y transferencia de red HTTP de imágenes reales de ~120 KiB puede ser algo superior a la medida con 8 KiB.
- **Corrección:** SUGERIDA — Incluir en el harness de medición al menos una muestra de fotografía real hogareña respetando el tope de 128 KiB.
- **Prueba de cierre:** Ejecución de `medir-gemini` con fotogramas fotográficos reales.

---

### H4 · Excelente protección de clave API y datos sensibles en adaptador Gemini (T13)
- **Severidad:** BAJA (Conforme / Práctica destacada).
- **Ítem violado:** Cumplimiento G04 y Error Amplio 4.
- **Evidencia:**
  - La clave solo se transmite en el header `x-goog-api-key` (`gemini.go:218`).
  - La URL base se valida estrictamente: rechaza HTTP (salvo loopback local), query params (`u.RawQuery != ""`) y credenciales en URL (`gemini.go:110-117`).
  - Al capturar errores de `http.Client.Do`, se desenvuelve explícitamente `*url.Error` para que nunca se imprima la URL ni parámetros de red en logs ni trazas (`gemini.go:223-228`).
  - Las respuestas HTTP 4xx/5xx nunca vuelcan el cuerpo recibido en los errores devueltos al catálogo (`gemini.go:235-246`).
  - El paquete no posee dependencias de log ni imprime stdout/stderr.
  - El test `TestLaClaveNoApareceEnErroresNiLogs` corrobora que la clave no aparece en ningún error ni formateo `%v`, `%+v` o `%#v`.
  - El aviso legal sobre el nivel gratuito de Google y la prohibición de enviar datos reales de clientes está claramente documentado en `docs/ia/gemini.md`.
- **Impacto:** Se previene la fuga involuntaria de credenciales a logs o interfaces externas.
- **Corrección:** NINGUNA.
- **Prueba de cierre:** `go test ./internal/proveedores/gemini` verificado limpio.

---

### H5 · Desalineación de variables de entorno entre Docker Compose y Config Go (H10 de T13)
- **Severidad:** ALTA
- **Ítem violado:** D02, Error Amplio 8, H10 de `docs/review/T13-huecos-del-contrato.md`.
- **Evidencia:** En `infra/docker-compose.yml` (líneas 124-129) se inyectan al contenedor de la API las variables:
  `VC_PROVEEDOR_STT`, `VC_PROVEEDOR_LLM`, `VC_PROVEEDOR_TTS`, `VC_STT_API_KEY`, `VC_LLM_API_KEY`, `VC_TTS_API_KEY`.
  Sin embargo, la API en Go (`backend/internal/config/config.go` líneas 58, 128, 217, 231) lee exclusivamente:
  `PROVEEDOR_LLM`, `PROVEEDOR_STT`, `PROVEEDOR_TTS`, `PROVEEDOR_WHATSAPP`, `GEMINI_API_KEY` o `GEMINI_API_KEY_FILE`.
- **Impacto:** Si se despliega la API con Docker Compose tal como está configurado hoy, el backend no detectará el proveedor Gemini ni su clave y fallará en el arranque con error `PROVEEDOR_LLM=gemini necesita GEMINI_API_KEY o GEMINI_API_KEY_FILE`.
- **Corrección:** OBLIGATORIA (para Ops / T11) — Alinear las variables de entorno en `infra/docker-compose.yml` e `infra/.env.example` con los nombres que espera `config.go`, y utilizar el secreto de Docker mediante `GEMINI_API_KEY_FILE`.
- **Prueba de cierre:** `docker compose config` sin variables vacías y arranque exitoso de la API en contenedor Docker.

---

### H6 · Riesgo de cierre prematuro de sesión por temporizador de silencio (H8 de T13 / T25)
- **Severidad:** MEDIA
- **Ítem violado:** L07, H8 de `docs/review/T13-huecos-del-contrato.md`.
- **Evidencia:** En `backend/internal/rutas/socket_silencio.go`, el tiempo de inactividad provisorio es `sinVozProvisorioS = 20s`. A los 2/3 del plazo (~13,3 s) se emite `sesion.aviso { aviso: "sin_voz_proximo" }`, y a los 20 s se corta la llamada con `dominio.MotivoSinVoz`. Si bien el temporizador se pausa durante el procesamiento del turno en el backend (`c.vig.pausar()`), se reanuda inmediatamente al emitir los mensajes WS. En respuestas habladas extensas del avatar (por ejemplo 30–45 palabras sintetizadas que insumen 12–15 segundos en ser reproducidas por el navegador), el cliente puede recibir el aviso de inactividad mientras el avatar aún está hablando, o sufrir el corte a los pocos segundos de que el avatar termine.
- **Impacto:** Cierres de sesión intempestivos con derivación no deseada a WhatsApp durante interacciones normales.
- **Corrección:** OBLIGATORIA — Elevar el plazo de `sin_voz_s` a un valor prudencial (ej. 45 a 60 segundos) o incorporar en el cálculo de reactivación del vigilante la duración estimada de la alocución del avatar (`avatar.visemas` o longitud del texto).
- **Prueba de cierre:** Test de sesión con texto largo de respuesta verificando que el cliente dispone de al menos 20 segundos para responder tras la finalización del habla.

---

### H7 · Riguroso cumplimiento de cálculo de precio en Go y aislamiento del LLM (T25)
- **Severidad:** BAJA (Conforme / Práctica destacada).
- **Ítem violado:** Cumplimiento estricto G01, L01, L02, Error Amplio 2, Error Amplio 3.
- **Evidencia:**
  - El esquema JSON enviado al LLM prohíbe de forma absoluta campos monetarios (`monto`, `precio`, `descuento`).
  - Go valida la salida con `DisallowUnknownFields` y `cotizador.ValidarSalidaLLM`.
  - Si el modelo incluye menciones de moneda o montos en `respuesta_hablada`, `cotizador.HabladaConMontos` lo detecta mediante regex y el orquestador lo sustituye por `FraseHabladaSegura` (`turno/texto.go:117-121`).
  - Al emitir cotización, el precio sale exclusivamente del motor determinista en Go (`cotizador.Cotizar`), operando con enteros `int64` centavos basados en el tarifario fijo; el texto hablado es una plantilla fija (`FraseCotizacion`), nunca redactado por el LLM.
  - Resistencia a inyección adversaria probada en `TestInyeccionNoCambiaElPrecioYSeMarca`.
  - Persistencia previa (P3/P4): la respuesta del modelo y la cotización se insertan en PostgreSQL antes de emitir los eventos WebSocket. Si la base falla, se aborta y se responde `error_interno`, impidiendo que el cliente vea un precio que no quedó registrado.
- **Impacto:** Garantía absoluta contra alucinaciones monetarias del modelo y cumplimiento total de las decisiones fundacionales de arquitectura.
- **Corrección:** NINGUNA.
- **Prueba de cierre:** Suite `go test ./internal/turno ./internal/cotizador` ejecutada y aprobada.

---

### H8 · Huecos de contrato OpenAPI abiertos y pendientes de homologación (T13 / T25)
- **Severidad:** MEDIA
- **Ítem violado:** O05, O07, trazabilidad OpenAPI.
- **Evidencia:** Se corroboró que los 11 puntos documentados en `proyecto/docs/review/T13-huecos-del-contrato.md` siguen vigentes en su totalidad:
  - H1: Ausencia de evento WS para derivación sin cotización (se solventa provisoriamente vía `GET /derivacion` con sesión cerrada).
  - H2/H3: `MotivoCierre` no distingue causas finas de derivación ni cuota/tope de turnos.
  - H4: `intento_inyeccion` no expuesto en `SesionDetalle` para el panel del asesor.
  - H5: `avatar.visemas` no discrimina si los tiempos provienen de texto o audio.
  - H6: `texto.enviar` no distingue entrada de voz del navegador de texto mecanografiado.
  - H7: `pizarron.corregir` continúa sin implementación en backend.
  - H9: Orden de eventos en el cierre no explicitado en contrato.
  - H11: Conteo de intentos fallidos de turnos tras reinicio de la instancia de API.
- **Impacto:** Divergencia temporal entre los esquemas oficiales OpenAPI y los comportamientos adoptados por el backend.
- **Corrección:** SUGERIDA — Elevar formalmente el documento `T13-huecos-del-contrato.md` al Arquitecto para su resolución e incorporación en la versión congelada del contrato.
- **Prueba de cierre:** Emisión de ADR o actualización del contrato OpenAPI por el Arquitecto.

---

## 4. Veredicto

**APROBADA CON CAMBIOS**

### Condición de Cierre:
1. **Obligatoria para Ops / T11**: Corregir la discrepancia de nombres de variables en `infra/docker-compose.yml` e `infra/.env.example` (H5 / H10) para permitir el arranque de la API en contenedor Docker con proveedor Gemini.
2. **Obligatoria para Backend**: Ajustar el temporizador provisorio de silencio `sin_voz_s` (H6 / H8) a un valor holgado (ej. 45 s) para evitar cortes espurios durante la reproducción del habla del avatar.
3. **Sugerida para Arquitecto**: Tomar conocimiento de los huecos de contrato H1 a H9 y H11 para planificar su incorporación en el contrato de eventos y OpenAPI.

Los aspectos nucleares de T13 (adaptador Gemini, protección estricta de la clave, minimización de datos y medición aritmética) y T25 (orquestador de turno, cálculo exclusivo de precios en Go, validación estricta de salida y persistencia segura de estado) se encuentran sólidamente implementados y verificados.
