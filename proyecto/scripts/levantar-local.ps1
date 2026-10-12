# Levanta el entorno local de desarrollo (no es un build de producción).
# Abre tres ventanas de PowerShell: backend, videollamada y panel.
# El backend lee proyecto/backend/.env (plantilla: backend/.env.example). El front lee real-time-quote-bot/.env.local.
# El panel arranca en modo simulado (npm run dev): no comparte datos con el backend.
#
# Uso, desde cualquier carpeta:
#   powershell -File proyecto/scripts/levantar-local.ps1

$ErrorActionPreference = "Stop"
$proyecto = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $proyecto
$backend = Join-Path $proyecto "backend"
$front = Join-Path $repo "real-time-quote-bot"
$panel = Join-Path $proyecto "panel-asesor"
. (Join-Path $PSScriptRoot "resolver-go-en-path.ps1")

function Leer-EnvSinValores([string]$ruta) {
    $claves = @{}
    if (-not (Test-Path -LiteralPath $ruta)) { return $claves }
    foreach ($linea in Get-Content -LiteralPath $ruta) {
        $t = $linea.Trim()
        if ($t -eq "" -or $t.StartsWith("#")) { continue }
        $i = $t.IndexOf("=")
        if ($i -lt 1) { continue }
        $k = $t.Substring(0, $i).Trim()
        $v = $t.Substring($i + 1).Trim()
        if ($k -ne "") { $claves[$k] = ($v -ne "") }
    }
    return $claves
}

function Exigir([hashtable]$claves, [string]$archivo, [string[]]$nombres) {
    $faltan = @()
    foreach ($n in $nombres) {
        if (-not $claves.ContainsKey($n) -or -not $claves[$n]) { $faltan += $n }
    }
    if ($faltan.Count -gt 0) {
        throw "Faltan en ${archivo}: $($faltan -join ', '). No se imprime ningún valor."
    }
}

$envBack = Leer-EnvSinValores (Join-Path $backend ".env")
Exigir $envBack "backend/.env" @(
    "ENTORNO", "ALMACEN", "DIRECCION", "CLAVE_HMAC",
    "PROVEEDOR_STT", "PROVEEDOR_LLM", "PROVEEDOR_TTS", "PROVEEDOR_WHATSAPP",
    "SEMILLA_LOCAL"
)
if ($envBack.ContainsKey("PROVEEDOR_LLM")) {
    $lineaLlm = (Get-Content -LiteralPath (Join-Path $backend ".env") | Where-Object { $_.Trim().StartsWith("PROVEEDOR_LLM=") } | Select-Object -First 1)
    if ($lineaLlm -match "=gemini\s*$") {
        Exigir $envBack "backend/.env" @("GEMINI_API_KEY")
    }
}
$envFront = Leer-EnvSinValores (Join-Path $front ".env.local")
Exigir $envFront "real-time-quote-bot/.env.local" @(
    "VITE_VC_API_BASE", "VITE_VC_CLAVE_PUBLICA", "VITE_VC_ENLACE_DEMO"
)

foreach ($par in @(
        @{ Ruta = $backend; Que = "Go (backend)" },
        @{ Ruta = (Join-Path $front "node_modules"); Que = "node_modules del front (npm ci en real-time-quote-bot)" },
        @{ Ruta = (Join-Path $panel "node_modules"); Que = "node_modules del panel (npm ci en proyecto/panel-asesor)" }
    )) {
    if (-not (Test-Path -LiteralPath $par.Ruta)) { throw "Falta $($par.Que)." }
}
if (-not (Agregar-GoAlPathSiFalta)) {
    throw "No está go en el PATH ni en Program Files\Go\bin. Instalá Go (winget install GoLang.Go) y reiniciá la terminal."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "No está npm en el PATH." }

function Cerrar-SiEsDeEsteRepo([int]$puerto) {
    $lineas = netstat -ano | Select-String -Pattern ":$puerto\s+.*LISTENING"
    $vistos = @{}
    foreach ($l in $lineas) {
        $partes = ($l.Line -split "\s+") | Where-Object { $_ -ne "" }
        $proc = [int]$partes[-1]
        if ($vistos.ContainsKey($proc)) { continue }
        $vistos[$proc] = $true
        if ($proc -le 0) { continue }
        $info = Get-CimInstance Win32_Process -Filter "ProcessId=$proc" -ErrorAction SilentlyContinue
        $cmd = [string]$info.CommandLine
        $exe = [string]$info.ExecutablePath
        if ($cmd -match "cursor" -or $exe -match "cursor") { continue }
        $esDev = $cmd -match "videocotizacion|vite|mock-servidor-vc|go-build" -or $exe -match "node.exe|go.exe"
        if ($esDev) {
            Write-Host "Cierro el proceso $proc que escuchaba en $puerto"
            & taskkill /PID $proc /T /F | Out-Null
        }
    }
}

foreach ($p in 8080, 5173, 5174, 5175, 8787) { Cerrar-SiEsDeEsteRepo $p }

$ventana = Join-Path $PSScriptRoot "dev-ventana.ps1"
function Abrir-Ventana([string]$rol) {
    Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", $ventana, "-Rol", $rol
    ) | Out-Null
}

Abrir-Ventana "backend"
Abrir-Ventana "front"
Abrir-Ventana "panel"

Write-Host ""
Write-Host "Se abrieron tres ventanas. La primera vez Go compila y tarda un poco; no es un build de producción." -ForegroundColor Green
Write-Host "Backend     http://127.0.0.1:8080/salud     (lee backend/.env, LOG_NIVEL=debug)"
Write-Host "Videollamada http://127.0.0.1:5173/c/demoLocalVideocotiz001"
Write-Host "Panel       http://127.0.0.1:5174          (API real vía proxy; misma semilla que la videollamada)"
Write-Host ""
Write-Host "Panel (semilla local): demo@videocotizacion.local"
Write-Host "  contraseña frase-larga-de-demo-0"
Write-Host "  segundo paso: codigo de recuperacion DEMO-LOCA-2026"
Write-Host "Tras una llamada en /c/demoLocalVideocotiz001, Mis cotizaciones debe listar la sesion."
Write-Host "Mock aislado: cd proyecto/panel-asesor && npm run dev  (docs/fe/panel-backend-local.md)"
