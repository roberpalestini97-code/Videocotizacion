# Texto sugerido para el PR en GitHub

**Título:** `T04: dev local (semillalocal, dotenv, CORS) + gate verificar-repo con Lovable`

## Summary

- Extrae la semilla de demo a `internal/semillalocal` (cumple G05 / `TestDependenciasEntrePaquetes`).
- `SEMILLA_LOCAL=1`, `.env` vía `dotenv`, CORS loopback en dev, scripts `levantar-local.ps1` / `dev-ventana.ps1`.
- Plantilla `backend/.env.example` y ajustes en el cliente Lovable para API local.
- `verificar-repo` propaga exit code en PowerShell e incluye `npm run contrato:verificar` del monorepo.

## Test plan

- [ ] `powershell -File proyecto/scripts/verificar-repo.ps1` (autor: ok 2026-10-11)
- [ ] Copiar `.env.example` → `.env` y levantar con `levantar-local.ps1`
- [ ] `GET http://127.0.0.1:8080/salud` → 200
- [ ] Videollamada demo: `/c/demoLocalVideocotiz001` con clave pública de semilla

Ver detalle: `proyecto/docs/pruebas/plan-pr-T04-dev-local.md`

**Base:** `main` (incluye T07). **Rama:** `T04-dev-local-semillalocal`.
