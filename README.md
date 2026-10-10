# VideoCotización

Presupuestos reales en vivo — monorepo del producto **VideoCotización**: API vendible con cotización en videollamada, avatar y panel.

Origen del tablero y del backend en Claude; continuación del desarrollo en **Cursor y Claude** sobre esta misma copia local (`Documents/videocotizacion`).

## Contenido

- **`proyecto/`** — Backend Go, JSON Schema de conductas, contrato OpenAPI, Docker Compose, tarifas, documentación y **tablero de tareas** (`docs/tablero/`).
- **`real-time-quote-bot/`** — Frontend (Lovable) alineado al contrato.
- **`AGENTS.md`** — Reglas para agentes: tablero, verificación y flujo de ramas + PR (solo Rober mergea a `main`).

## Tablero

Abrir en el navegador:

`proyecto/docs/tablero/index.html`

Estado editable en `proyecto/docs/tablero/datos.js`.

## Verificación rápida

```powershell
powershell -File proyecto/scripts/verificar-repo.ps1
```

## Repositorio

GitHub: [roberpalestini97-code/Videocotizacion](https://github.com/roberpalestini97-code/Videocotizacion)

Flujo de trabajo: rama por tarea → commit → PR a `main` → merge por Rober. Detalle en [AGENTS.md](./AGENTS.md).
