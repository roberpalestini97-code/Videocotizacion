#!/bin/sh
# Genera una CA privada y el certificado de servidor de PostgreSQL para el TLS entre la API y la base
# (R27 de seguridad: TLS 1.2+ también hacia la base). Solo para la red interna del compose.
#
# Uso:   sh scripts/generar-certs-postgres.sh [directorio-salida]      (por defecto infra/secrets/pg)
# Salida (nada de esto se versiona; infra/.gitignore ya excluye secrets/):
#   server.crt  server.key  -> se montan en el contenedor "db"
#   ca.crt                  -> se monta en "api" y "migrar" (sslmode=verify-full, host "db")
#   ../pg-ca-privada/ca.key -> la clave de la CA queda FUERA de los montajes; guardala aparte
# La clave del servidor debe ser del usuario postgres del contenedor con modo 0600: PG_UID/PG_GID
# (por defecto 70, el de la imagen alpine; en imágenes Debian es 999). Si no sos root, se avisa.
# Vencimiento: el certificado de servidor dura 825 días. Hay que volver a correr este script y
# reiniciar "db" antes de esa fecha (anotar en el calendario; pendiente de T29: rotación automática).
set -eu

SALIDA="${1:-$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)/secrets/pg}"
PG_UID="${PG_UID:-70}"
PG_GID="${PG_GID:-70}"
DIAS_CA=3650
DIAS_SERVIDOR=825
PRIVADA="$SALIDA/../pg-ca-privada"

if [ -e "$SALIDA/server.key" ]; then
  echo "Ya existe $SALIDA/server.key; no se pisa. Borralo a mano si querés regenerar." >&2
  exit 1
fi
umask 077
mkdir -p "$SALIDA" "$PRIVADA"

openssl ecparam -name prime256v1 -genkey -noout -out "$PRIVADA/ca.key"
openssl req -x509 -new -key "$PRIVADA/ca.key" -sha256 -days "$DIAS_CA" \
  -subj "/O=VideoCotizacion/CN=VideoCotizacion PostgreSQL CA" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -out "$SALIDA/ca.crt"

openssl ecparam -name prime256v1 -genkey -noout -out "$SALIDA/server.key"
openssl req -new -key "$SALIDA/server.key" -subj "/O=VideoCotizacion/CN=db" -out "$SALIDA/server.csr"
EXT=$(mktemp)
trap 'rm -f "$EXT" "$SALIDA/server.csr"' EXIT
cat > "$EXT" <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=DNS:db,DNS:localhost
EXT
openssl x509 -req -in "$SALIDA/server.csr" -CA "$SALIDA/ca.crt" -CAkey "$PRIVADA/ca.key" -CAcreateserial \
  -CAserial "$PRIVADA/ca.srl" -days "$DIAS_SERVIDOR" -sha256 -extfile "$EXT" -out "$SALIDA/server.crt"

chmod 0644 "$SALIDA/ca.crt" "$SALIDA/server.crt"
chmod 0600 "$SALIDA/server.key" "$PRIVADA/ca.key"
if [ "$(id -u)" -eq 0 ]; then
  chown "$PG_UID:$PG_GID" "$SALIDA/server.key"
else
  echo "AVISO: sin root no se puede hacer chown de server.key a $PG_UID:$PG_GID; PostgreSQL se negará a usarla." >&2
  echo "       Corré: sudo chown $PG_UID:$PG_GID $SALIDA/server.key" >&2
fi
openssl verify -CAfile "$SALIDA/ca.crt" "$SALIDA/server.crt"
echo "Listo. Vence el servidor: $(openssl x509 -in "$SALIDA/server.crt" -noout -enddate)"
