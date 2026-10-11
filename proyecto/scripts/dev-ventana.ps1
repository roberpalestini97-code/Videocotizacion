# Una ventana del entorno local. Lo abre levantar-local.ps1.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("backend", "front", "panel")]
    [string]$Rol
)

$ErrorActionPreference = "Stop"
$proyecto = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $proyecto

switch ($Rol) {
    "backend" {
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
        $Host.UI.RawUI.WindowTitle = "VC panel (simulado)"
        Set-Location -LiteralPath (Join-Path $proyecto "panel-asesor")
        Write-Host "== VC panel simulado (vite --mode mock) ==" -ForegroundColor Cyan
        & node ".\node_modules\vite\bin\vite.js" --mode mock --host 127.0.0.1 --port 5174 --strictPort
    }
}
