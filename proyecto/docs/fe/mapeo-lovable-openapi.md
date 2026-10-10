# Mapeo: front Lovable (`real-time-quote-bot`) vs contrato OpenAPI

Actualizado: 2026-10-09 (Cursor). Repo Lovable: `Documents/videocotizacion/real-time-quote-bot`. Contrato: `contracts/openapi.yaml` (0.1.4-borrador).

## Resumen

El front de Lovable **no consume hoy la API pública** del contrato. La videollamada usa un **server function propio** (`consultarAsesor`) con eventos y turnos **ad hoc**, sesión generada en el navegador (`vc-…`), y precios/texto saliendo del guion local, LLM directo (OpenAI) o un proxy opcional (`ASESOR_API_URL`). El backend Go implementa el flujo del contrato (enlace, consentimiento, token-medios, WebSocket, cotización en Go).

T09 pasa de bloqueada a **en revisión**: ya hay acceso al código; falta cliente tipado OpenAPI y adaptar `VideoCotizacion.tsx`.

## Flujo actual (Lovable)

| Paso | Implementación Lovable | Contrato OpenAPI |
|------|------------------------|------------------|
| Entrada | Página marketing + modal `VideoCotizacion` | `GET /v1/widget/enlaces/{id_publico}` + aviso + desafío |
| Sesión | `nuevaSesionId()` en cliente | `POST /v1/sesiones` → `sesion_id`, token `vc_ses_` |
| Consentimiento | UI “permisos” (cámara/mic); sin registro legal | `POST /v1/sesiones/{id}/consentimiento` |
| Medios / voz | Cámara local + TTS (`hablarTextoAsesor`); sin WS | `POST …/token-medios` + `GET …/medios` (WebSocket `vc-eventos.borrador.1`) |
| Diálogo | `dispararEventoAsesor` → `consultarAsesor` (TanStack Start) | Eventos `texto.enviar` / tramas binarias; LLM vía backend |
| Cotización | `presupuesto` en JSON del LLM/guion (strings) | `GET …/cotizacion` (centavos int64, calculado en Go) |
| Cierre | Fase UI `cierre` | `POST …/cierre` + opcional `GET …/derivacion` |
| Asesores | `src/data/asesores.ts` estático | Perfil del enlace + tenant; panel en `/v1/panel/*` |

## Eventos Lovable vs eventos de sesión

| Lovable (`AsesorEvento`) | Equivalente contrato / notas |
|----------------------------|------------------------------|
| `llamada.inicio` | Tras `sesion.lista` en WS; no existe evento homónimo |
| `turno.solicitar` | Sustituir por turnos vía `texto.enviar` + respuestas del orquestador (`T25`) |
| `observacion.dato` | Datos extraídos en salida LLM → persistencia sesión |
| `observacion.camara` | Tramas JPEG `0x10` + eventos fotograma |
| `llamada.cierre` | `POST …/cierre` motivo `cliente_cerro` |

## Supuestos explícitos (hoy)

1. **Un solo asesor demo** por lista local; el contrato usa **enlace opaco** por profesional.
2. **Precio en texto** en UI; el contrato exige **centavos en Go** y prohíbe montos en salida LLM.
3. **Sin multi-tenant ni credenciales** widget (`vc_pub_`, Origin, `X-Desafio`).
4. **Avatar**: clip de video preregrabado; contrato prevé visemas / modo 3D (`T07`, `T10`).
5. **Server function** centraliza LLM; en producción el LLM debe vivir en el backend (`T25`).

## Trabajo restante (T09 → T10)

1. En Lovable: `npm run contrato` → `src/lib/api-contrato/generado/openapi.d.ts` (lee `../proyecto/contracts/openapi.yaml`).
2. Mock: reutilizar patrón de `panel-asesor/src/mock/servidor.ts` para rutas widget/sesión.
3. Reemplazar `nuevaSesionId()` por cadena: enlace → desafío → crear sesión → consentimiento.
4. Sustituir `consultarAsesor` por WS de medios cuando `T25` exponga transcripción/respuesta (fase intermedia: HTTP solo lectura de cotización).
5. Documentar variables: `VITE_API_BASE`, clave pública widget, Origin de despliegue.

## Referencias en código

- Lovable: `src/components/VideoCotizacion.tsx`, `src/lib/asesor-api/*`
- Contrato: `contracts/openapi.yaml`, `contracts/eventos-sesion.md`
- Panel React (más alineado): `proyecto/panel-asesor/`

## Actualización T10 (2026-10-10)

El front ya consume el contrato: `src/lib/videocotizacion/` (cliente tipado, desafío, WebSocket con reconexión, muestreo de fotogramas, pizarrón, controlador y máquina de estados) reemplazó a `src/lib/asesor-api`. Variables `VITE_VC_*` en `real-time-quote-bot/.env.example`; servidor falso en `scripts/mock-servidor-vc.mjs` (`npm run mock:vc`); prueba E2E en `scripts/e2e-videocotizacion.mjs`. Lo que falta o es ambiguo del contrato: `huecos-T10.md`. Capturas: `capturas/`.
