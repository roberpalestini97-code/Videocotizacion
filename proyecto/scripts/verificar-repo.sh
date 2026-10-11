#!/usr/bin/env sh
# Gates locales alineados con meta.verificacion_repo del tablero.
set -e
raiz=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$raiz"

echo "== backend: go test ./... =="
(cd backend && go test ./...) || exit $?

echo "== conductas: npm run verificar =="
(cd conductas && npm run verificar)

echo "== contrato: validar + referencias-prompts + vectores =="
(cd contracts/verificacion && npm run validar && npm run referencias-prompts && npm run vectores)

if command -v docker >/dev/null 2>&1; then
  echo "== infra: docker compose config =="
  (
    cd infra &&
    PG_SUPERUSER_PASSWORD=verificar-repo \
    VC_DUENO_PASSWORD=verificar-repo \
    VC_API_PASSWORD=verificar-repo \
    VC_CLAVE_HMAC=01234567890123456789012345678901 \
    VC_CLAVE_DESAFIO=01234567890123456789012345678901 \
    VC_CLAVE_CIFRADO_TOTP=01234567890123456789012345678901 \
    DOMINIO=videocotizacion.local \
    ACME_EMAIL=ops@videocotizacion.local \
    ORIGEN_FRONT=https://cotizar.videocotizacion.local \
    docker compose config --quiet
  )
else
  echo "== infra: docker compose config (omitido: sin cliente docker) =="
fi

echo "ok: verificar-repo"
