#!/bin/sh
# Crea infra/.env a partir de .env.example, reemplazando cada "CAMBIAR_GENERAR" por 256 bits aleatorios
# (hex: no necesita escape en URLs ni en el .env). No pisa un .env existente. Modo 0600.
# Lo que no se puede generar (claves de proveedores de IA) queda como CAMBIAR_PEGAR_... y se avisa.
set -eu
AQUI=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
ENTRADA="$AQUI/.env.example"
SALIDA="$AQUI/.env"

if [ -e "$SALIDA" ]; then
  echo "Ya existe $SALIDA; no se pisa." >&2
  exit 1
fi
umask 077
: > "$SALIDA"
while IFS= read -r linea || [ -n "$linea" ]; do
  case "$linea" in
    *=CAMBIAR_GENERAR)
      clave=${linea%%=*}
      valor=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
      printf '%s=%s\n' "$clave" "$valor" >> "$SALIDA"
      ;;
    *) printf '%s\n' "$linea" >> "$SALIDA" ;;
  esac
done < "$ENTRADA"
chmod 0600 "$SALIDA"
echo "Creado $SALIDA (modo 0600)."
pendientes=$(grep -c 'CAMBIAR_' "$SALIDA" || true)
if [ "$pendientes" -gt 0 ]; then
  echo "Faltan $pendientes valores por completar a mano (buscá CAMBIAR_ en $SALIDA):" >&2
  grep -n 'CAMBIAR_' "$SALIDA" | sed 's/=.*/=.../' >&2
fi
