# Una ventana del entorno local. Lo abre levantar-local.ps1.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("backend", "front", "panel")]
    [string]$Rol
)

$ErrorActionPreference = "Stop"
$proyecto = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $proyecto
. (Join-Path $PSScriptRoot "resolver-go-en-path.ps1")

switch ($Rol) {
    "backend" {
        if (-not (Agregar-GoAlPathSiFalta)) {
            throw "No está go en el PATH ni en Program Files\Go\bin. Instalá Go (winget install GoLang.Go) y reiniciá la terminal."
        }
        $Host.UI.RawUI.WindowTitle = "VC backend"
        Set-Location -LiteralPath (Join-Path $proyecto "backend")
        Write-Host "== VC backend (go run, LOG_NIVEL=debug, lee .env) ==" -ForegroundColor Cyan
        $env:LOG_NIVEL = "debug"
        go run ./cmd/api servir
    }
    "front" {
        $Host.UI.RawUI.WindowTitle = "VC videollamada"
        Set-Location -LiteralPath (Join-Path $repo "real-time-quote-bot")
        Write-Host "== VC videollamada (vite dev, lee .env.local) ==" -ForegroundColor Cyan
        # node directo: npm.ps1 en Windows se come los argumentos que van después de --.
        # Sin --debug: el modo debug de Vite se queda en la carga de la config y no abre el puerto.
        # El log normal igual muestra la URL, cada pedido y los errores.
        & node ".\node_modules\vite\bin\vite.js" dev --host 127.0.0.1 --port 5173 --strictPort
    }
    "panel" {
        $Host.UI.RawUI.WindowTitle = "VC panel (API real)"
        Set-Location -LiteralPath (Join-Path $proyecto "panel-asesor")
        $env:VC_API = "http://127.0.0.1:8080"
        Write-Host "== VC panel contra backend (vite dev:api, proxy /v1) ==" -ForegroundColor Cyan
        Write-Host "Login: demo@videocotizacion.local  recuperacion DEMO-LOCA-2026 (ver docs/fe/panel-backend-local.md)" -ForegroundColor DarkGray
        # node directo: npm.ps1 en Windows se come los argumentos que van después de --.
        & node ".\node_modules\vite\bin\vite.js" --mode development --host 127.0.0.1 --port 5174 --strictPort
    }
}
