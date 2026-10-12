# Panel del asesor contra el backend real (desarrollo local)

Hoy el tablero y `levantar-local.ps1` pueden levantar **videollamada + backend** con datos en memoria (`SEMILLA_LOCAL=1`). El panel seguía en **mock** (`npm run dev --mode mock`). Este documento define cómo pasar a **llamadas reales visibles en el panel**.

## Qué ya existe

| Pieza | Estado |
|-------|--------|
| Rutas `/v1/panel/*` en Go | Implementadas y testeadas (`internal/rutas/panel_*.go`) |
| Cliente tipado en el panel | `src/api/cliente.ts` |
| Proxy Vite → API | `npm run dev:api` (`vite.config.ts` proxy `/v1` → `8080`) |
| Semilla demo | Enlace `demoLocalVideocotiz001`, clave pública widget, asesor `Laura (demo)` |
| Sesiones de videollamada | Mismo tenant/asesor que el enlace demo |

## Fase 0 — Hecho en esta iteración

1. **Semilla local** crea credenciales de panel:
   - Email: `demo@videocotizacion.local`
   - Contraseña: `frase-larga-de-demo-0` (misma frase que el mock, solo dev)
   - Segundo paso: **código de recuperación** `DEMO-LOCA-2026` (en lugar de TOTP en app)
2. **`levantar-local.ps1`** arranca el panel con `npm run dev:api` (proxy, cookie `__Host-vc_panel` same-origin).
3. Flujo manual: backend + videollamada + panel → una llamada de prueba → **Mis cotizaciones** / detalle.

## Fase 1 — Verificación manual (checklist)

Automatizado en Go: `TestPanelSemillaLocal*` + `scripts/verificar-corte-local.ps1`. Lo de abajo confirma el flujo con navegador y Gemini.

1. `powershell -File proyecto/scripts/levantar-local.ps1` (con `GEMINI_API_KEY` en `backend/.env`).
2. Panel http://127.0.0.1:5174 → ingresar con credenciales de arriba → paso TOTP → pegar `DEMO-LOCA-2026`.
3. Videollamada http://127.0.0.1:5173/c/demoLocalVideocotiz001 → completar consentimiento y al menos un turno (ideal: emitir cotización).
4. Panel → **Mis cotizaciones**: debe aparecer la sesión del mismo asesor (`ase_000…01`).
5. Abrir detalle: `SesionDetalle`, pizarrón, cotización si se emitió, `respuestas_modelo` si hubo turnos LLM.

**No probado hasta correr la checklist:** CORS loopback, cookies Secure en 127.0.0.1, listado vacío si el asesor del enlace no coincide.

## Fase 2 — Producto (tablero T44)

| Id | Entregable |
|----|------------|
| T44a | Documentar checklist en `ENTORNO.md` y mensaje al final de `levantar-local.ps1` |
| T44b | Test Go semilla + login + listado vacío — **hecho** (`TestPanelSemillaLocalLoginListaVacia`) |
| T44b2 | Test Go sesión demo → listado + detalle panel — **hecho** (`TestPanelSemillaLocalListaSesionTrasCrear`) |
| T44c | (Opcional) Playwright panel contra backend levantado en CI |
| T44d | TOTP real opcional en semilla (secreto fijo dev) para no depender de recuperación |

## Fase 3 — Más allá de la demo local

- **PostgreSQL + T04a:** mismo flujo con RLS y asesores reales (sin contraseña en semilla).
- **Multi-tenant / API vendible (0005):** panel por tenant, claves widget distintas.
- **T42:** panel al contrato 0.1.3 si diverge del cliente generado.
- **Producción:** TLS, dominio, cookie `Secure`, sin códigos de recuperación predecibles.

## Modo mock (sigue disponible)

```powershell
cd proyecto/panel-asesor
npm run dev
```

Usa `admin@asesores.local` / `frase-larga-de-demo-0` / TOTP `123456` — **no** ve el backend.

## Arquitectura (same-origin)

```text
Navegador 127.0.0.1:5174
    │ fetch /v1/panel/...
    ▼
Vite proxy (dev:api)
    ▼
Backend 127.0.0.1:8080
```

No hace falta `VITE_API_BASE` en local si se usa el proxy; la cookie del panel viaja al mismo origen que la SPA.
