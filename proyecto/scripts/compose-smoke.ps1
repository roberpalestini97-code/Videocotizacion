# T11: validar compose cuando Docker está disponible (sin levantar servicios).
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "resolver-go-en-path.ps1")
Agregar-GoAlPathSiFalta | Out-Null

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "compose-smoke: omitido (sin cliente docker en PATH)"
    exit 0
}

$info = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "compose-smoke: docker instalado pero el daemon no responde (iniciá Docker Desktop y reintentá)."
    Write-Host $info
    exit 2
}

Push-Location (Join-Path $raiz "infra")
$env:PG_SUPERUSER_PASSWORD = "compose-smoke"
$env:VC_DUENO_PASSWORD = "compose-smoke"
$env:VC_API_PASSWORD = "compose-smoke"
$env:VC_CLAVE_HMAC = "01234567890123456789012345678901"
$env:VC_CLAVE_DESAFIO = "01234567890123456789012345678901"
$env:VC_CLAVE_CIFRADO_TOTP = "01234567890123456789012345678901"
$env:DOMINIO = "videocotizacion.local"
$env:ACME_EMAIL = "ops@videocotizacion.local"
$env:ORIGEN_FRONT = "https://cotizar.videocotizacion.local"
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location
Write-Host "ok: compose-smoke (docker compose config)"
