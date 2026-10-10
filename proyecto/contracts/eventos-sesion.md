# Eventos de sesión por WebSocket — NO CONGELADO (borrador `vc-eventos.borrador.1`)

> **NO CONGELADO.** Todo este documento, los esquemas de `schemas/eventos/` y el encabezado binario son
> borrador. Pueden cambiar sin cambio de versión del OpenAPI. No se congelan hasta medir el avatar en
> navegadores y equipos reales (T08) y probar el token de medios en navegadores reales (ADR 0002).
> Contrato HTTP relacionado: `openapi.yaml` 0.1.4-borrador.

## 1. Conexión

1. El cliente obtiene `token_sesion` con `crearSesion`, registra el consentimiento
   (`registrarConsentimiento`) y pide `emitirTokenMedios` → `TokenMedios { token, ws_url, vence_en_s ≤ 60 }`.
   Sin consentimiento no hay token (R10, O1); emitirlo reserva el cupo de simultáneas (R57, R61).
2. Abre `ws_url` (`wss://…/v1/sesiones/{sesion_id}/medios`). El servidor verifica `Origin` contra la lista
   de la clave pública en el handshake (R55). **El token no va en la URL.**
3. Primer mensaje (texto): `sesion.autenticar` con `token_medios`. Token vencido, reusado o de otra sesión →
   el servidor cierra con código WebSocket `4401` (R32). Si no llega en 5 s → cierre `4408`.
4. El servidor responde `sesion.lista` con los `limites` vigentes. Recién ahí se llama a STT/LLM/TTS.
5. Reconexión: nuevo `emitirTokenMedios` (el token es de un uso); el servidor reenvía el último
   `pizarron.actualizado`.

## 2. Mensajes de texto (JSON)

Sobre común (todos los eventos): `{ "v": 1, "tipo": "<tipo>", "seq": <uint32>, "ts": "<RFC 3339 UTC>", "datos": {…} }`.
`seq` es por dirección y creciente. Todo texto que llega a pantalla es **texto plano**, sin `<` ni `>`
(R19); el cliente igual lo inserta como texto, nunca como HTML. Esquemas: `schemas/eventos/Evento_*.schema.json`,
uniones `EventoCliente` y `EventoServidor`.

### Cliente → servidor
| tipo | datos | notas |
|---|---|---|
| `sesion.autenticar` | `token_medios` | primer mensaje obligatorio |
| `texto.enviar` | `texto` (≤ 500) | alternativa a la voz; tope por turno (R66) |
| `pizarron.corregir` | `version_base`, `clave`, `valor` (≤ 200) | el cliente corrige lo anotado (R48) |
| `sesion.cerrar` | `motivo: "cliente_cerro"` | corte del cliente |

### Servidor → cliente
| tipo | datos | notas |
|---|---|---|
| `sesion.lista` | `sesion_id`, `limites` | token aceptado |
| `transcripcion.parcial` / `transcripcion.final` | `turno`, `texto` | solo los finales disparan un turno del LLM |
| `avatar.respuesta` | `turno`, `texto`, `clip_id?` | `clip_id` en modo clips; sin montos (ADR 0002 §4) |
| `avatar.visemas` | `turno`, `items[{v, t_ms, d_ms}]` | 15 visemas: `sil PP FF TH DD kk CH SS nn RR aa E I O U` |
| `pizarron.actualizado` | `version`, `campos[{clave, etiqueta, valor, estado}]` | **nunca** contiene montos; `estado`: anotado, corregido_por_cliente, faltante |
| `camara.fotograma` | `seq_fotograma`, `resultado`, `motivo?` | acuse; descartado por frecuencia, tamaño, dimensiones, formato o tope (R65) |
| `sesion.aviso` | `aviso`, `segundos_restantes` | `sin_voz_proximo`, `duracion_proxima`, `cuota_proxima` (R60, ADR 0005) |
| `cotizacion.emitida` | `cotizacion` (= `Cotizacion`), `derivacion` (= `DerivacionWhatsApp`) | **solo al final**; fuera de zona se emite marcado |
| `sesion.cerrada` | `motivo_cierre`, `duracion_s` | luego el servidor cierra el socket con `1000` |
| `error` | `codigo` (catálogo), `mensaje` | errores recuperables |

`motivo_cierre` usa el enum `MotivoCierre` del OpenAPI: `completada`, `cliente_cerro`, `sin_voz`,
`sin_camara`, `sin_consentimiento`, `duracion_maxima`, `cuota_agotada`, `desafio_invalido`,
`error_proveedor`, `error_interno`. `sin_voz` se dispara tras `limites.sin_voz_s` segundos sin voz
detectada (valor provisorio, P8), con `sesion.aviso` previo.

## 3. Tramas binarias y encabezado (20 bytes, big-endian)

| offset | tamaño | campo | valores |
|---|---|---|---|
| 0 | 2 | `magia` | ASCII `VC` (0x56 0x43) |
| 2 | 1 | `version` | `1` |
| 3 | 1 | `tipo` | `0x01` audio_pcm16_16k (subida) · `0x02` audio_opus (subida) · `0x10` fotograma_jpeg (subida) · `0x20` audio_respuesta_opus (bajada) |
| 4 | 1 | `flags` | bit 0 = fin de turno de voz; resto en 0 |
| 5 | 3 | reservado | `0` |
| 8 | 4 | `seq` | uint32 por tipo de trama |
| 12 | 4 | `ts_ms` | uint32, ms desde `sesion.lista` |
| 16 | 4 | `longitud` | uint32, bytes de carga útil (≤ 131072) |

Forma decodificada: `schemas/eventos/EncabezadoBinario.schema.json`.

Reglas de fotogramas (BRIEF 3, R43, R65): JPEG real (bytes mágicos `FF D8 FF`), lado ≤ 1024 px,
≤ 128 KiB, uno cada ≥ 3 s, tope por sesión (`limites.fotograma.max_por_sesion`). Lo que no cumple se
descarta **sin llamar al modelo de visión** y se informa con `camara.fotograma`. Los fotogramas y el
audio se procesan solo en memoria: **nunca** se guardan en base, disco, logs ni colas.

## 4. Límites del socket (R9, R66)
Mensaje de texto ≤ 16 KiB; trama binaria ≤ 20 B + 128 KiB; mensajes por segundo acotados; excedente →
cierre `1009` (demasiado grande) o `4429` (ritmo). Topes de caracteres por turno, turnos LLM y segundos de
audio en `LimitesSesion`.

## 5. Códigos de cierre propios
`4401` token inválido/vencido/reusado · `4403` Origin no permitido · `4408` sin autenticar a tiempo ·
`4409` sesión ya cerrada · `4429` ritmo excedido · `1000` cierre normal tras `sesion.cerrada`.

## 6. Pendiente para congelar
- **Backend T04 (2026-10-10):** con proveedores falsos, el WS acumula tramas `0x01`/`0x02` hasta
  `flags` fin de turno (tope 128 KiB por turno) y dispara STT→turno LLM; Opus real queda en T13.
- P1 resuelta por BRIEF (navegador + clips), pero falta medir fps/sincronía real (T08).
- Probar `sesion.autenticar` (token en el primer mensaje) en Chrome/Safari/Firefox reales.
- Confirmar con av el set de 15 visemas y con fe la reconexión.
- Que cot confirme que `avatar.respuesta.clip_id` alcanza para elegir clip por `siguiente_paso.accion`.
