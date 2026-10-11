#!/usr/bin/env sh
# Prueba de humo REAL de Gemini: UNA llamada con una transcripción ficticia.
# Uso:  GEMINI_API_KEY=tu_clave ./probar-gemini.sh      (opcional: GEMINI_MODELO=...)
# Requiere solo curl. No imprime la clave. La clave viaja en el encabezado
# x-goog-api-key, nunca en la URL.
#
# ATENCIÓN: con una clave del nivel gratuito, Google puede usar lo que se envía
# para mejorar sus productos y personas revisoras pueden leerlo. Usá SOLO datos
# ficticios (este script ya lo hace). Ver ADR 0003, sección "Adaptador Gemini (T13a)".
set -eu
if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "Falta GEMINI_API_KEY (creala en Google AI Studio y exportala en esta terminal)." >&2
  exit 2
fi
modelo="${GEMINI_MODELO:-gemini-3.5-flash-lite}"
base="${GEMINI_URL_BASE:-https://generativelanguage.googleapis.com/v1beta}"
aqui=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
esquema=$(cat "$aqui/gemini-esquema-humo.json")
cuerpo=$(mktemp); trap 'rm -f "$cuerpo"' EXIT
cat > "$cuerpo" <<JSON
{
  "systemInstruction": {"parts": [{"text": "Sos un asistente que extrae datos de pedidos de presupuesto de pintura y jardinería en Mar Chiquita, Cobo, Santa Clara y Parque Lago. Respondé solo con JSON según el esquema. No menciones ni inventes precios ni montos. La respuesta_hablada es en español rioplatense, cálida y breve."}]},
  "contents": [{"role": "user", "parts": [{"text": "Transcripción del turno del cliente:\nHola, quiero pintar el frente de mi casa en Cobo, serían unos 40 metros cuadrados, tiene humedad y la pared está descascarada. Lo necesito para fin de mes."}]}],
  "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": $esquema, "temperature": 0.2, "maxOutputTokens": 4096}
}
JSON
echo "Llamando a $modelo (una sola vez, datos ficticios)..." >&2
salida=$(mktemp); trap 'rm -f "$cuerpo" "$salida"' EXIT
estado=$(printf 'header = "x-goog-api-key: %s"\n' "$GEMINI_API_KEY" | curl -sS -K - -m 60 -o "$salida" -w '%{http_code}' \
  -H 'Content-Type: application/json' -X POST --data-binary "@$cuerpo" "$base/models/$modelo:generateContent")
echo "HTTP $estado" >&2
if command -v python3 >/dev/null 2>&1; then
  python3 -m json.tool < "$salida" || cat "$salida"
elif command -v jq >/dev/null 2>&1; then
  jq . < "$salida" || cat "$salida"
else
  cat "$salida"
fi
[ "$estado" = "200" ]
