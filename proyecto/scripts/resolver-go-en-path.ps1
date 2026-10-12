# Si go no está en PATH (común tras winget sin reiniciar sesión), usa la instalación estándar en Windows.
function Agregar-GoAlPathSiFalta {
    if (Get-Command go -ErrorAction SilentlyContinue) { return $true }
    $dirs = @(
        (Join-Path $env:ProgramFiles "Go\bin"),
        (Join-Path ${env:ProgramFiles(x86)} "Go\bin"),
        (Join-Path $env:LocalAppData "Programs\Go\bin")
    )
    foreach ($dir in $dirs) {
        $exe = Join-Path $dir "go.exe"
        if (Test-Path -LiteralPath $exe) {
            $env:Path = "$dir;$env:Path"
            return $true
        }
    }
    return $false
}
