<#
Prueba de humo REAL de Gemini: UNA llamada con una transcripción ficticia.
Uso (PowerShell):  $env:GEMINI_API_KEY = "tu_clave"; powershell -File proyecto/scripts/probar-gemini.ps1
Opcional: $env:GEMINI_MODELO. No imprime la clave; viaja en el encabezado x-goog-api-key, nunca en la URL.

ATENCIÓN: con una clave del nivel gratuito, Google puede usar lo que se envía para
mejorar sus productos y personas revisoras pueden leerlo. Usá SOLO datos ficticios
(este script ya lo hace). Ver ADR 0003, sección "Adaptador Gemini (T13a)".
#>
$ErrorActionPreference = 'Stop'
if (-not $env:GEMINI_API_KEY) {
  Write-Error 'Falta GEMINI_API_KEY (creala en Google AI Studio y definila en esta terminal).'
  exit 2
}
$modelo = if ($env:GEMINI_MODELO) { $env:GEMINI_MODELO } else { 'gemini-3.5-flash-lite' }
$base = if ($env:GEMINI_URL_BASE) { $env:GEMINI_URL_BASE } else { 'https://generativelanguage.googleapis.com/v1beta' }
$esquema = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'gemini-esquema-humo.json')   # texto crudo: no se reserializa
$sistema = 'Sos un asistente que extrae datos de pedidos de presupuesto de pintura y jardinería en Mar Chiquita, Cobo, Santa Clara y Parque Lago. Respondé solo con JSON según el esquema. No menciones ni inventes precios ni montos. La respuesta_hablada es en español rioplatense, cálida y breve.'
$turno = "Transcripción del turno del cliente:`nHola, quiero pintar el frente de mi casa en Cobo, serían unos 40 metros cuadrados, tiene humedad y la pared está descascarada. Lo necesito para fin de mes."
$sistemaJson = ConvertTo-Json -InputObject $sistema
$turnoJson = ConvertTo-Json -InputObject $turno
$cuerpo = '{"systemInstruction":{"parts":[{"text":' + $sistemaJson + '}]},"contents":[{"role":"user","parts":[{"text":' + $turnoJson + '}]}],' +
  '"generationConfig":{"responseMimeType":"application/json","responseJsonSchema":' + $esquema + ',"temperature":0.2,"maxOutputTokens":4096}}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($cuerpo)
Write-Host "Llamando a $modelo (una sola vez, datos ficticios)..."
try {
  $resp = Invoke-RestMethod -Method Post -Uri "$base/models/${modelo}:generateContent" `
    -Headers @{ 'x-goog-api-key' = $env:GEMINI_API_KEY } -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 60
} catch {
  $estado = $_.Exception.Response.StatusCode.value__
  Write-Host "HTTP $estado (el cuerpo del error no se muestra completo para no volcar datos)"
  exit 1
}
$texto = $resp.candidates[0].content.parts | Where-Object { -not $_.thought } | ForEach-Object { $_.text }
Write-Host 'HTTP 200. JSON devuelto por el modelo:'
try { ($texto -join '') | ConvertFrom-Json | ConvertTo-Json -Depth 20 } catch { Write-Host ($texto -join '') }
Write-Host ("Tokens: " + ($resp.usageMetadata | ConvertTo-Json -Compress))
