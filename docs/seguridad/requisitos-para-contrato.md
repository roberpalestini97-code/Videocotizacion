# Requisitos de seguridad y datos para el contrato (R1–R70)

Estado: **rehecho tras el reinicio (2026-10-08)**. Autor: seg. Revisión pendiente.
Origen: R1–R32 (T14/T15), R33–R52 (T33: panel, video, qué se guarda), R53–R70 (T40: abuso de costos, enlace opaco, contacto). La numeración R53–R70 respeta el veredicto de T40; el texto exacto de R1–R52 se reconstruyó y puede diferir del original perdido.

**Verificación**: toda prueba corre con **proveedores falsos** (STT, LLM, TTS, visión, WhatsApp) que **cuentan llamadas y tokens**; "costo 0" = contadores de los falsos en 0.
**Prioridad**: P0 (antes de cualquier tenant real), P1 (antes de vender la API), P2 (mejora).
**Bloq.**: **SÍ** = bloquea abrir `crearSesion` con clave pública al público por abuso de costos (veredicto T40). Lo legal marcado **[ABOGADO]**.

## R1–R32 · API, multi-tenant, LLM y Ley 25.326

| ID | Requisito | Cómo se verifica | Prio. | Bloq. |
|---|---|---|---|---|
| R1 | Clave secreta por tenant (`vc_sec_`, ≥128 bits): se muestra una vez, se guarda con HMAC, rota con solapamiento y se revoca en ≤60 s | Prueba: clave revocada → 401 a los 60 s; la base no contiene la clave en claro | P0 | |
| R2 | La clave secreta no se acepta desde navegador: con `Origin` presente → 403 y alerta | Prueba: request con clave secreta + Origin → 403 | P1 | |
| R3 | `tenant_id` sale solo de la credencial; ninguna ruta lo acepta como entrada | Lint del OpenAPI: no hay parámetro `tenant_id`; prueba con `tenant_id` ajeno en el cuerpo → ignorado/400 | P0 | |
| R4 | RLS + FORCE en toda tabla con `tenant_id`; rol de API sin BYPASSRLS ni dueño; arranque aborta si el rol los tiene; sin `app.tenant_id` → 0 filas | Prueba contra PostgreSQL 16: consulta sin variable → 0 filas; arranque con rol dueño → error | P0 | |
| R5 | Acceso a recurso de otro tenant responde 404, igual que inexistente | Plan de aislamiento: cada ruta × 2 tenants | P0 | |
| R6 | `app.tenant_id` solo con `SET LOCAL` dentro de transacción | Prueba con pool de 1 conexión alternando tenants | P0 | |
| R7 | Ids públicos no secuenciales | Prueba: 1000 ids sin orden ni colisión | P1 | |
| R8 | Límite de tasa por credencial y ruta; 429 con `Retry-After` | Prueba de ráfaga → 429 | P0 | |
| R9 | Tamaño máximo de cuerpo y de mensaje WebSocket; timeouts de lectura/escritura | Prueba: cuerpo > máximo → 413; WS > máximo → cierre | P0 | |
| R10 | Consentimiento (versión del aviso, mayor de 18) antes de emitir token de medios (O1) | Prueba: sin consentimiento → sin token y falsos en 0 | P0 | |
| R11 | Aviso de privacidad con los incisos del art. 6, versionado y fechado | Lista de chequeo en prueba de contrato **[ABOGADO]** texto | P0 | |
| R12 | Registro de consentimientos solo-anexar (versión, hora, sesión) | Prueba: UPDATE/DELETE con rol de API → error | P0 | |
| R13 | Finalidad: cotizar y derivar. Sin entrenamiento ni marketing con datos de clientes; proveedores con "no entrenar" | Inventario de proveedores revisado; config de proveedor | P1 | |
| R14 | El LLM solo extrae: JSON Schema estricto, `additionalProperties: false`, sin montos ni campos sobre personas | ajv strict + 8 negativos (incluido campo `precio`) rechazados | P0 | |
| R15 | Precio en Go, `int64` centavos, desde tarifas versionadas; rotulado "orientativo" | Prueba: salida del LLM falso con monto → rechazada; total = suma de ítems | P0 | |
| R16 | Entrada del cliente (voz, texto, imagen) delimitada como dato; sin herramientas con efectos; sin secretos en prompts | Vectores de inyección contra LLM falso y luego real (T17) | P0 | |
| R17 | Vectores de inyección por imagen (texto en carteles) | Suite de vectores en T17 | P1 | |
| R18 | Reglas base inmutables por encima de las conductas del tenant | Prueba: conducta del tenant que pide precio → validación la rechaza | P1 | |
| R19 | Salida del modelo a pizarrón/avatar: texto plano, escapado, longitud máxima | Prueba: salida con `<script>` llega escapada | P0 | |
| R20 | Tarifario `referencia_publica_sin_validar` no se activa en producción | Prueba: arranque prod con ese tarifario → error | P0 | |
| R21 | Tabla de retención por tipo de dato en el contrato, configurable | Revisión del OpenAPI; plazos **[ABOGADO]** | P0 | |
| R22 | ARCO acceso: solicitud registrada, respuesta sin cargo, alerta antes del plazo | Prueba de ruta + reloj falso | P1 | |
| R23 | ARCO rectificación/supresión: borra consulta y contacto, deja solicitud anonimizada | Prueba: después de suprimir, 0 filas con datos del titular | P1 | |
| R24 | Identificación del solicitante ARCO con dos factores (código de referencia + contacto) | Prueba: un solo factor → respuesta genérica sin datos | P1 | |
| R25 | Inventario de proveedores (país, finalidad, retención, base de transferencia); proveedor sin aprobación no se activa | Prueba: proveedor sin marca de aprobado → arranque falla **[ABOGADO]** | P0 | |
| R26 | Contrato de encargo con cada tenant (art. 25) | Documento firmado **[ABOGADO]** | P1 | |
| R27 | TLS 1.2+ en tránsito, incluida la base; backups cifrados; secretos fuera del repo | Escaneo de secretos en CI; prueba de conexión sin TLS → rechazada | P0 | |
| R28 | Logs sin datos personales, secretos, transcripciones ni imágenes | Prueba: sesión completa con falsos; grep de marcadores en logs → 0 | P0 | |
| R29 | Inscripción de la base ante la AAIP | Constancia **[ABOGADO]** | P0 | |
| R30 | Si hay webhooks a tenants: firma HMAC con marca de tiempo y ventana | Prueba de firma y repetición | P2 | |
| R31 | Errores `problem+json` sin detalles internos; versionado y deprecación | Spectral + prueba de error 500 sin traza | P1 | |
| R32 | Token de WebSocket corto, de un uso, ligado a la sesión, con Origin verificado | Prueba: reutilizar token → cierre | P0 | |

## R33–R52 · Panel del asesor, video y qué se guarda (T33)

| ID | Requisito | Cómo se verifica | Prio. | Bloq. |
|---|---|---|---|---|
| R33 | Cookie `__Host-vc_panel`: Secure, HttpOnly, SameSite=Strict, Path=/, sin Domain; valor opaco ≥128 bits guardado con hash | Prueba de encabezado `Set-Cookie` | P0 | |
| R34 | Vencimiento por inactividad (propuesta 30 min) y absoluto (12 h); cerrar sesión invalida en servidor | Prueba con reloj falso | P0 | |
| R35 | Rotación del id de sesión al login y tras TOTP | Prueba: id previo inválido tras login | P0 | |
| R36 | `X-CSRF-Token` en métodos no seguros, ligado a la sesión, comparación en tiempo constante, más chequeo de Origin del panel | Prueba: POST sin token o con Origin ajeno → 403 | P0 | |
| R37 | Contraseña con Argon2id; mensajes uniformes; límite de intentos por cuenta e IP | Prueba: 10 fallos → bloqueo progresivo; mismo mensaje usuario/clave | P0 | |
| R38 | TOTP obligatorio (RFC 6238), secreto cifrado, ventana ±1, sin reuso del código, recuperación de un uso con hash | Prueba con reloj falso: reuso → rechazo | P0 | |
| R39 | Reautenticación (contraseña + TOTP, válida ≤5 min) para: cambiar credenciales, rotar enlace o claves, exportar, borrar cuenta. 401 distingue `reautenticacion_requerida` de `sesion_vencida` | Prueba por acción sensible | P0 | |
| R40 | Perfil del asesor mínimo (nombre visible, oficios, zonas, WhatsApp, email); sin DNI; aviso y consentimiento del asesor | ajv: campos extra rechazados | P0 | |
| R41 | El asesor ve solo sus consultas (RLS + filtro por asesor) | Plan de aislamiento 2 asesores × 2 tenants | P0 | |
| R42 | Por consulta se guarda: datos extraídos validados, ítems y total en centavos, versión de tarifa y prompt, respuestas del modelo, motivo de cierre, duración, contacto si consintió | Prueba de esquema de persistencia | P0 | |
| R43 | Fotogramas y audio nunca se persisten (disco, base, logs, colas); retención cero en proveedor si existe | Prueba: sesión con falsos; búsqueda de bytes JPEG en base/logs → 0 | P0 | |
| R44 | Job diario de borrado según R21, con registro de lo borrado (solo ids) | Prueba con reloj falso: vencidos → 0 filas | P0 | |
| R45 | Rechazo de cámara → sin sesión, motivo `sin_consentimiento`, alternativa WhatsApp | Prueba de flujo | P0 | |
| R46 | Aviso visible de asistente automático y presupuesto "orientativo" | Revisión de textos del catálogo | P0 | |
| R47 | Visión limitada al trabajo; sin rasgos ni reconocimiento de personas | Vectores con personas en cuadro → esquema sin campos de personas | P0 | |
| R48 | El cliente puede corregir el pizarrón; se guarda la versión final | Prueba de evento de corrección | P1 | |
| R49 | ARCO del cliente final y del asesor (exportación propia desde "Mi cuenta") | Prueba de exportación con reautenticación | P1 | |
| R50 | Código de referencia de `wa.me` sin datos personales, no predecible | Prueba: código no contiene teléfono/nombre; entropía mínima | P0 | |
| R51 | Panel con CSP estricta (sin inline), `frame-ancestors 'none'`, HSTS; build sin mock ni credenciales de demo | Prueba del build (ya existía en T38) + encabezados | P0 | |
| R52 | Consumo del asesor visible sin exponer costos de otros tenants | Plan de aislamiento | P1 | |

## R53–R70 · Abuso de costos, enlace opaco, contacto y registros (T40)

| ID | Requisito | Cómo se verifica | Prio. | Bloq. |
|---|---|---|---|---|
| R53 | `X-Desafio` obligatorio en `crearSesion` con clave pública: un solo uso, vence en ≤120 s, ligado a clave + Origin | Prueba: sin desafío, vencido o repetido → 403 y falsos en 0 | P0 | **SÍ** |
| R54 | Clave pública (`vc_pub_`) solo crea sesión y lee configuración pública; rotable y revocable | Prueba: clave pública en cada ruta de lectura → 403 | P0 | **SÍ** |
| R55 | Lista de `Origin` exactos por clave (https, sin comodines); Origin ausente o ajeno → 403; CORS solo para la lista | Prueba con Origin ajeno, ausente y con comodín | P0 | **SÍ** |
| R56 | Cuota dinámica por profesional y tenant **con topes duros** (incluido un tope global de gasto mensual que nada supera); al tope → `cuota_agotada` antes de tocar proveedores | Prueba con reloj y contador falsos: al tope → 429 y falsos en 0 | P0 | **SÍ** |
| R57 | Simultáneas: global 5 y por tenant/profesional, reserva atómica; excedente → 429 con `Retry-After` | Prueba concurrente de 20 pedidos → exactamente 5 aceptados | P0 | **SÍ** |
| R58 | Límite de `crearSesion` por IP, por clave pública y por enlace opaco | Prueba de ráfaga por cada eje | P0 | **SÍ** |
| R59 | Alertas de consumo al 50/80/100 % por profesional, tenant y global | Prueba con contador falso | P1 | |
| R60 | Corte por silencio `sin_voz_s` y duración máxima; `motivo_cierre` enumerado (`completada`, `sin_voz`, `duracion_maxima`, `cuota_agotada`, `sin_consentimiento`, `error`, `cliente_cerro`) | Prueba: sesión muda con reloj falso → cierre `sin_voz` y STT/TTS se detienen | P0 | **SÍ** |
| R61 | Orden obligatorio: consentimiento → desafío → cupo → recién ahí proveedores | Prueba por cada paso faltante → falsos en 0 | P0 | **SÍ** |
| R62 | `id_publico` del enlace opaco: ≥128 bits aleatorios, rotable desde el panel (con reautenticación) | Prueba de entropía y de rotación (viejo → 404) | P0 | |
| R63 | El enlace solo expone perfil público mínimo del profesional | ajv sobre la respuesta | P0 | |
| R64 | Respuesta idéntica (código, cuerpo y tiempo aproximado) para enlace inexistente, revocado o de otro tenant | Prueba comparativa | P1 | |
| R65 | Fotogramas: JPEG real (bytes mágicos), ≤128 KiB, ≤1024 px, ≤1 cada 3 s (el servidor descarta el resto), tope por sesión | Prueba: ráfaga y archivos inválidos → descartados sin llamar a visión | P0 | **SÍ** |
| R66 | Topes de caracteres/tokens por turno y por sesión, de turnos LLM y de segundos de audio entrante | Prueba: excedente → truncado o cierre; tokens del falso ≤ tope | P0 | **SÍ** |
| R67 | Suite de abuso de costos en CI (bot sin desafío, Origin falso, ráfagas, sesión muda, fotogramas de más, texto gigante) con resultado "costo 0" o dentro de tope | La suite corre verde en CI | P0 | **SÍ** |
| R68 | Contacto: aviso visible antes de enviar, consentimiento no premarcado y versionado, finalidad "que el profesional te contacte"; solo lo ve el asesor de esa consulta (`contacto_disponible`); sin publicidad | Prueba de flujo y de aislamiento; **[ABOGADO]** texto | P0 | |
| R69 | Registro de lecturas solo-anexar: quién, cuándo, qué consulta/contacto; visible en "Registros"; límite y alerta de lecturas de contacto | Prueba: leer detalle → 1 fila; UPDATE/DELETE → error | P0 | |
| R70 | Eventos de seguridad registrados sin datos personales (solo ids) y plan de respuesta a incidentes probado | Prueba de redacción + simulacro documentado | P1 | |

## Resumen para abrir `crearSesion` con clave pública al público
- **Bloquean por abuso de costos (T40)**: R53, R54, R55, R56, R57, R58, R60, R61, R65, R66, R67.
- **También necesarios antes del público (no son de costo)**: R4, R5, R10, R11, R12, R14, R16, R25, R28, R29, R43.
- R56 necesita la cifra de **gasto máximo mensual** de Rober; hasta entonces, tope provisorio bajo.
