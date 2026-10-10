# Gates locales alineados con meta.verificacion_repo del tablero.
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

Write-Host "== backend: go test ./... =="
Push-Location backend
go test ./...
Pop-Location

Write-Host "== conductas: npm run verificar =="
Push-Location conductas
npm run verificar
Pop-Location

Write-Host "== contrato: validar + referencias-prompts + vectores =="
Push-Location contracts/verificacion
npm run validar
npm run referencias-prompts
npm run vectores
Pop-Location

if (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Host "== infra: docker compose config =="
  Push-Location infra
  $env:PG_SUPERUSER_PASSWORD = "verificar-repo"
  $env:VC_DUENO_PASSWORD = "verificar-repo"
  $env:VC_API_PASSWORD = "verificar-repo"
  $env:VC_CLAVE_HMAC = "01234567890123456789012345678901"
  $env:VC_CLAVE_DESAFIO = "01234567890123456789012345678901"
  $env:VC_CLAVE_CIFRADO_TOTP = "01234567890123456789012345678901"
  $env:DOMINIO = "videocotizacion.local"
  $env:ACME_EMAIL = "ops@videocotizacion.local"
  $env:ORIGEN_FRONT = "https://cotizar.videocotizacion.local"
  docker compose config --quiet
  Pop-Location
} else {
  Write-Host "== infra: docker compose config (omitido: sin cliente docker) =="
}

Write-Host "ok: verificar-repo"
