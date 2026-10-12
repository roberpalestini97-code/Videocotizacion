# Gates del corte gratis local (motor T26/T44, semilla panel, tarifas). Complementa verificar-repo.ps1.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot "resolver-go-en-path.ps1")
if (-not (Agregar-GoAlPathSiFalta)) { throw "Go no encontrado en PATH." }

Write-Host "== tarifas: verificar.mjs =="
Push-Location (Join-Path $repo "proyecto\tarifas")
node verificar.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location

Write-Host "== backend: cotizador + semillalocal + T44 panel =="
Push-Location (Join-Path $repo "proyecto\backend")
go test ./internal/cotizador/... ./internal/semillalocal/... ./internal/rutas/ -run "TestPanelSemilla|TestSembrar" -count=1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location

Write-Host "ok: verificar-corte-local"
