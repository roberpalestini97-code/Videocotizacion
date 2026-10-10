# VideoCotización — instrucciones para agentes (Cursor y Claude)

Este repositorio es un **monorepo**. La raíz es `Documents/videocotizacion/` (este directorio).

## Estructura

| Ruta | Contenido |
|------|-----------|
| `proyecto/` | Backend Go, conductas, contrato OpenAPI, infra Docker, **tablero** (`docs/tablero/`), scripts de verificación |
| `real-time-quote-bot/` | Front Lovable (videollamada / widget). Ver `real-time-quote-bot/AGENTS.md` (Lovable: no force-push a historial publicado) |
| `proyecto.code-workspace` | Workspace de VS Code/Cursor con ambas carpetas |

## Tablero de tareas

- **Fuente única:** `proyecto/docs/tablero/datos.js` (estado, notas, bitácora).
- **Vista:** abrir `proyecto/docs/tablero/index.html` en el navegador.
- Cursor y Claude deben **actualizar `datos.js`** cuando cambie el estado verificable de una tarea (tests corridos, lo no probado declarado en `nota`).

## Dos harness (Cursor + Claude)

Trabajamos en **dos entornos** sobre el **mismo repo**. Reglas comunes:

1. **Contrato primero** — cambios que cruzan módulos pasan por arquitecto (tablero).
2. **Hecho = verificado** — declarar en notas del tablero qué se probó y qué no.
3. **No commitear secretos** — `.env`, claves, `infra/secrets/`.

## Flujo Git (obligatorio)

Solo **Rober** mergea a `main`. Los agentes **no** hacen push directo a `main` ni force-push.

Por cada **tarea del tablero terminada**, **fix** o **feature**:

1. Partir de `main` actualizado: `git fetch origin && git checkout main && git pull origin main`
2. Crear rama: `git checkout -b T04-descripcion-corta` (usar id de tarea del tablero cuando aplique; si no hay id, `fix/` o `feat/` descriptivo).
3. Commits **atómicos**, mensaje en imperativo, en español o inglés consistente con el repo:
   - `T04: persistir respuestas_modelo en turno WS`
   - `fix(panel): corregir versiones.prompt con MaterialTurno`
4. Verificación local antes del push (mínimo en `proyecto/`):
   - `powershell -File proyecto/scripts/verificar-repo.ps1`
   - En cambios Lovable/contrato: `npm run contrato:verificar` dentro de `real-time-quote-bot/` si tocó OpenAPI.
5. Push: `git push -u origin HEAD`
6. Abrir **Pull Request hacia `main`**. Descripción: resumen, plan de prueba, enlace a tarea del tablero si existe.
7. Actualizar `proyecto/docs/tablero/datos.js` en la misma rama (bitácora + `nota`/`status`).

Rober revisa y mergea el PR.

## Lovable (`real-time-quote-bot/`)

- Evitar **force push**, **rebase/amend/squash** de commits ya publicados en la rama conectada a Lovable.
- Si Lovable sigue apuntando al repo antiguo `real-time-quote-bot`, coordinar con Rober la reconexión al monorepo o mantener sync manual hasta migrar el remoto en Lovable.

## Comandos útiles

```powershell
# Desde la raíz del repo (videocotizacion/)
powershell -File proyecto/scripts/verificar-repo.ps1
cd proyecto/backend; go test ./...
cd proyecto/conductas; npm run verificar
cd proyecto/contracts/verificacion; npm run validar
```
