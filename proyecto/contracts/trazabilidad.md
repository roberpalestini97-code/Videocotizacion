# Trazabilidad R1–R70 → contrato 0.1.4-borrador

"Contrato" = lo que el OpenAPI/esquemas fijan y la verificación prueba hoy. "Backend" = lo implementa go
(T04/T25/T27) y lo prueba qa contra el servidor. "Legal" = a validar con abogado. Vectores: `pruebas/vectores/<categoría>.json`.

| R | Dónde lo cubre el contrato | Resto |
|---|---|---|
| R1 | `claveSecreta` (bearer `vc_sec_`), 401 `credencial_invalida`; vectores autenticacion "revocada" | Hash HMAC, rotación, revocación ≤60 s y rutas de gestión: backend (S5) |
| R2 | `crearSesion` y demás rutas con clave secreta: 403 `clave_secreta_desde_navegador`; vectores autenticacion | Alerta al tenant: backend |
| R3 | Ningún parámetro `tenant_id` (regla Spectral `vc-sin-tenant-id-como-entrada`); `additionalProperties:false` rechaza `tenant_id` en cuerpos (negativos automáticos y vectores aislamiento → 422) | Derivar tenant de la credencial: backend |
| R4 | — | Backend (RLS, rol, arranque seguro; ADR 0004) |
| R5 | 404 único `no_encontrado` en cada ruta con recurso; vectores aislamiento (tenant A↔B, inexistente, otra sesión) | Plan contra servidor: pruebas |
| R6 | — | Backend |
| R7 | Ids `xxx_` + 26 Crockford (`Id*.schema.json`), `IdPublicoEnlace` 128 bits; negativos "id secuencial" | Generación aleatoria: backend |
| R8 | 429 `limite_de_tasa` + `Retry-After` en todas las operaciones; vectores abuso "ráfaga" | Valores por ruta: backend |
| R9 | Límites `maxLength`/`maxItems` en todos los esquemas; 413 en rutas con cuerpo; límites WS en `eventos-sesion.md` (NO CONGELADO) | Tamaños máximos y timeouts: backend |
| R10 | `ConsentimientoSolicitud` (todo `const: true`, mayor de 18); `SesionCreada` sin token de medios (negativo O1); `emitirTokenMedios` 409 `consentimiento_requerido` | — |
| R11 | `AvisoPrivacidad` con 8 incisos y `a_validar_con_abogado`; `leerAvisoPrivacidad` | Texto: legal |
| R12 | `ConsentimientoRegistrado` (id `cns_`) | Tabla solo-anexar: backend |
| R13 | Finalidades en `TablaRetencion`; `ContactoSolicitud.consentimiento.finalidad` const | Proveedores "no entrenar": backend/ops |
| R14 | Salida del LLM: esquema de cot referenciado desde `RespuestaModelo`; validar.mjs comprueba que no tenga campos de dinero y que `siguiente_paso` sea {accion, motivo, campos} del ADR 0002; ejemplos/negativos de cot corren dentro de `RespuestaModelo` | Validación en Go: backend |
| R15 | `Cotizacion`/`ItemCotizacion` en `Centavos` int64, `orientativa: true`, regla de importe y suma (vectores cotizacion, 5 no conformes) | Cálculo en Go: backend |
| R16 | — | Backend + T17 |
| R17 | — | T17 |
| R18 | — | Backend/cot |
| R19 | Patrón de texto plano (sin `<` `>`) en todo texto de pizarrón, avatar, transcripción, ítems, observaciones; negativos con `<script>` | Escapado en el front: fe |
| R20 | `Cotizacion.tarifas.estado` expone `referencia_publica_sin_validar` | Bloqueo en producción: backend |
| R21 | `leerRetencion` → `TablaRetencion` (plazos configurables) | Plazos: legal |
| R22 | `crearSolicitudArco` (tipo `acceso`), 202 sin cargo, `plazo_vence_en` | Alerta y respuesta: backend |
| R23 | `crearSolicitudArco` (`rectificacion`, `supresion`) | Borrado y anonimización: backend |
| R24 | `SolicitudArco` exige código de referencia + `verificacion`; acuse genérico idéntico | Comparación: backend |
| R25 | — | Backend/ops (inventario de proveedores), legal |
| R26 | — | Legal |
| R27 | `servers` solo https; `ws_url` solo `wss://` (negativo "ws sin TLS") | TLS a la base: ops |
| R28 | `referencia_externa` sin `@`; `Error` sin campos internos (negativo "stack"); `RegistroLectura` solo ids | Logs: backend |
| R29 | — | Legal |
| R30 | — | Fuera del contrato (no hay webhooks, S5) |
| R31 | `Error` RFC 9457 con `codigo` del catálogo en toda respuesta 4xx/5xx (regla Spectral `vc-errores-problem-json`); versionado `/v1` + `Deprecation`/`Sunset` + `GET /v1/version` | — |
| R32 | `TokenMedios`: `vc_med_`, ≤60 s, `un_solo_uso`, URL sin token (negativo); `sesion.autenticar` y cierre `4401` (NO CONGELADO) | Implementación: backend |
| R33 | `cookiePanel` `__Host-vc_panel`; encabezado `Set-Cookie` con patrón Secure/HttpOnly/SameSite=Strict/Path=/ | — |
| R34 | `SesionPanel.vence_inactividad_en/vence_absoluto_en`; `cerrarSesionPanel`; 401 `sesion_vencida` (vectores) | Reloj: backend |
| R35 | `verificarTotp` emite `Set-Cookie` nueva | Rotación real: backend |
| R36 | Esquema `csrf` (`X-CSRF-Token`) en toda escritura del panel; 403 `csrf_invalido` y `origen_no_permitido` (vectores) | Comparación en tiempo constante: backend |
| R37 | `credenciales_incorrectas` uniforme; 429 `intentos_excedidos` | Argon2id, bloqueo progresivo: backend |
| R38 | `TotpSolicitud` (código o recuperación, exactamente uno); `totp_invalido` también para reuso (vectores) | Ventana ±1, cifrado: backend |
| R39 | `reautenticar` (≤300 s); `x-vc-reautenticacion` en cambiar contraseña, rotar enlace, claves del widget, exportar; 401 `reautenticacion_requerida` ≠ `sesion_vencida` | — |
| R40 | `PerfilAsesor` mínimo, sin DNI (negativo), con consentimiento del asesor | — |
| R41 | Vectores aislamiento "otro asesor del mismo tenant" → 404 en detalle y contacto | Filtro por asesor: backend |
| R42 | `SesionDetalle`: datos extraídos, cotización, versiones de tarifa/prompt/esquema, `respuestas_modelo`, motivo y duración | Persistencia: backend |
| R43 | `TablaRetencion`: fotogramas, audio y transcripción `persistido: false`; `SesionDetalle` rechaza `fotogramas` (negativo) | Prueba de bytes JPEG en base/logs: pruebas |
| R44 | — | Backend (job diario) |
| R45 | `cerrarSesion` con `sin_consentimiento`/`sin_camara` devuelve `derivacion` (vectores estado) | — |
| R46 | `EnlacePublico.asistente_automatico: true`, `ConsentimientoSolicitud.informado_asistente_automatico`, `orientativa: true`; textos en `CatalogoTextos` | Texto: legal |
| R47 | `DatosExtraidos` cerrado, sin campos de personas (negativos `rostro`, `edad_aparente`, `dni`) | Prompt de visión: cot/T17 |
| R48 | `pizarron.corregir` y `DatosExtraidos.corregido_por_cliente` (eventos NO CONGELADOS) | — |
| R49 | `exportarMiCuenta` con reautenticación | Exportación del cliente final: hueco (ver estado) |
| R50 | `CodigoReferencia` 50 bits sin I/L/O/U; `DerivacionWhatsApp.url_wa_me` patrón; vectores derivacion (teléfono/email en el texto → no conforme) | Entropía real: backend |
| R51 | — | fe/ops (CSP, HSTS, build) |
| R52 | `Consumo` sin montos (negativo `costo_centavos`); `leerConsumoPanel` con `ambito: asesor` | Aislamiento: pruebas |
| R53 | Esquema `desafio` (`X-Desafio`) AND `clavePublica` en `crearSesion`; `DesafioEmitido.vence_en_s ≤ 120`; vectores abuso (ausente, vencido, reusado, otro Origin, otra clave) con `costo_cero` | Un solo uso real: backend |
| R54 | `clavePublica` solo en `crearSesion`, `emitirDesafio`, `leerEnlacePublico`, `leerAvisoPrivacidad`; 403 `alcance_insuficiente` en el resto (vectores autenticacion) | — |
| R55 | `Origin` exacto (sin comodines, https, sin ruta; 7 negativos); 403 `origen_no_permitido` (vectores ajeno/ausente/comodín) | CORS: backend/ops |
| R56 | 429 `cuota_agotada` en `crearSesion` y `emitirTokenMedios`; `Consumo` con topes y alertas | Tope global de gasto: backend (cifra de Rober) |
| R57 | 429 `simultaneas_agotadas`; reserva en `emitirTokenMedios`; `Retry-After` | Atomicidad (20 pedidos → 5): pruebas |
| R58 | 429 `limite_de_tasa` en `crearSesion` | Ejes IP/clave/enlace: backend |
| R59 | `Consumo.alerta` (`p50`, `p80`, `p100`) | Notificación: backend |
| R60 | `MotivoCierre` (S1), `LimitesSesion.sin_voz_s` y `duracion_maxima_s`, `sesion.aviso`, `sesion.cerrada` | Corte real con reloj falso: backend |
| R61 | Orden documentado en `estado-de-congelamiento.md`; vectores `costo_cero` | Contadores de falsos en 0: pruebas |
| R62 | `IdPublicoEnlace` 128 bits; `rotarEnlace` con reautenticación; vector "enlace revocado" → 404 | — |
| R63 | `EnlacePublico.profesional` mínimo (negativo con teléfono) | — |
| R64 | 404 único por ruta (validado en `ejecutar.mjs`); vectores inexistente/revocado/otro tenant con `grupo_identico` | Tiempo de respuesta similar: pruebas |
| R65 | `ReglaFotograma` (JPEG, ≤1024 px, ≤128 KiB, ≥3000 ms, tope por sesión; negativos); `camara.fotograma` y encabezado binario (NO CONGELADO) | Bytes mágicos y decodificación: backend |
| R66 | `LimitesSesion.caracteres_max_por_turno`/`turnos_llm_max`; `texto.enviar` ≤500 (negativo) | Tokens y audio: backend |
| R67 | Vectores categoría `abuso` (59) como semilla de la suite | Suite contra servidor en CI: qa/ops |
| R68 | `ContactoSolicitud` (aviso, `acepta_ser_contactado` const, finalidad const; negativos publicidad/false); `contacto_disponible` solo en el listado; `leerContactoCliente` | Casilla no premarcada: fe; texto: legal |
| R69 | `RegistroLectura`/`listarRegistros`; `ContactoCliente.lectura` con lecturas restantes; 429 `limite_lecturas_contacto` | Solo-anexar: backend |
| R70 | `RegistroLectura` solo ids | Plan de incidentes: seg/ops |
