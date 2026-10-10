# ADR 0006 — Video del cliente, pizarrón, derivación a WhatsApp, entrada, panel y antiabuso

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho; integra T32, T35, T37 y las condiciones de T40 previstas en T41)

## Contexto
Rober decidió (BRIEF 2–6): entrada por enlace opaco de cada profesional, cámara obligatoria,
pizarrón en vivo, precio solo al final, consulta guardada para el backoffice con resumen en el
panel, y sin pasarela de pago (se deriva a WhatsApp). `crearSesion` con clave pública es la
ruta más expuesta a abuso de costos y bots (T40).

## Decisión
1. Entrada: `https://cotizar.<dominio>/c/<id_publico>` en el front de Lovable, botón
   "Iniciar VideoCotización". `id_publico` es aleatorio (≥ 128 bits), no secuencial, revocable,
   y resuelve tenant + profesional en el servidor. No expone teléfono ni nombre completo.
2. Consentimiento antes de abrir cámara y micrófono (aviso de finalidad, sin fotogramas
   guardados). Sin consentimiento o sin cámara, la sesión no empieza (motivo `sin_camara`).
3. Fotogramas: el navegador muestrea JPEG ≤ 1024 px de lado, ≤ 128 KiB, uno cada 3 s, por el
   mismo WebSocket (0002). El servidor valida tipo, tamaño y dimensiones; descarta lo demás.
   Se usan solo en memoria para que el `Extractor` saque datos; NUNCA se guardan en base,
   disco, logs ni trazas. Lo que se guarda son los datos extraídos (0004).
4. Pizarrón en vivo: evento `pizarron.actualizado` con los datos ya validados (oficio, tarea,
   medidas, estado, zona, faltantes). No muestra montos; no interrumpe el audio.
5. Precio solo al final: evento `cotizacion.emitida` con ítems y total en centavos (0002).
   Se guarda consulta + presupuesto; el panel muestra un resumen.
6. Derivación a WhatsApp: enlace `https://wa.me/<numero_profesional>?text=<texto>` con un
   código de referencia opaco, único por tenant, sin datos personales, que el asesor busca en
   el panel. El backend no envía mensajes. El enlace va en el cierre y en el panel.
7. Contacto del cliente: opcional, con aviso y consentimiento explícitos; si no lo deja, el
   seguimiento es por el código de referencia.
8. Panel del asesor (SPA React + TS + Vite): Perfil, Mis cotizaciones, Registros. Sesión con
   cookie `__Host-vc_panel` (Secure, HttpOnly, SameSite=Strict), `X-CSRF-Token` en escrituras,
   TOTP y reautenticación para acciones sensibles. Cada lectura de datos personales queda en
   el registro de lecturas (0004).
9. Antiabuso en `crearSesion` con clave pública:
   - Origin por tenant: lista permitida; se valida en HTTP y en el handshake del WebSocket.
   - Desafío `X-Desafio`: el servidor emite un desafío firmado, de un solo uso y vencimiento
     corto; sin desafío válido no se crea sesión.
   - Cuota dinámica (por enlace, origen e IP) que se ajusta según el consumo, siempre por
     debajo de los topes duros del tenant (0005), que no se superan nunca.
   - Corte por silencio `sin_voz_s` y duración máxima por llamada (valores configurables).
   - Motivos de cierre en enum: `cliente_colgo`, `sin_voz`, `sin_camara`, `duracion_maxima`,
     `cuota_agotada`, `error_proveedor`, `desafio_invalido`, `completada`.
   - No se abre al público hasta cumplir R53–R58, R60–R61 y R65–R67 de T40 (probados con
     proveedores falsos).

## Alternativas consideradas
- Cámara opcional: decisión contraria de Rober; descartado.
- Guardar fotogramas como evidencia: más riesgo legal y costo; descartado.
- Pasarela de pago o envío automático por API de WhatsApp: fuera de alcance por decisión 6.
- Captcha de terceros en lugar de desafío propio: posible implementación del desafío, a
  evaluar (suma un proveedor más, 0003).

## Consecuencias
- (+) El modelo "ve" el trabajo sin que se guarden imágenes del cliente.
- (+) El costo por abuso queda acotado por Origin, desafío, cuota dinámica y topes duros.
- (−) Cámara obligatoria deja afuera a quien no puede o no quiere mostrarla.
- (−) Fotogramas aumentan tokens por turno (costo a medir en T13).

## Verificación
- Pruebas de contrato: fotograma > 128 KiB, > 1024 px o no JPEG → rechazado.
- Prueba: tras una sesión con fotogramas, no hay bytes de imagen en base, disco ni logs
  (búsqueda de firma JPEG `FF D8 FF` en volcado de base y salida de logs).
- Pruebas: sin `X-Desafio`, desafío reusado o vencido, u Origin ajeno → no se crea sesión.
- Prueba: `pizarron.actualizado` nunca contiene campos de monto (validación de esquema).
- Prueba: el enlace `wa.me` contiene el código y ningún dato personal del cliente.
- Panel: escritura sin `X-CSRF-Token` → rechazada; acción sensible sin reautenticación → 401.

## Supuestos
- Mecanismo concreto del desafío (prueba de trabajo propia o proveedor): a confirmar en T41.
- Valores de `sin_voz_s`, duración máxima y cuota dinámica: a definir con datos reales.
- El texto de R53–R70 de T40 se perdió; seg debe rehacerlo antes de abrir al público.
- Consentimiento, finalidad y retención de imagen: a validar con abogado (Ley 25.326).
