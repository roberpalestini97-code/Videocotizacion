# syntax=docker/dockerfile:1.7
# Imagen de la API de VideoCotización (T11). El contexto de build es la raíz del repo (ver docker-compose.yml)
# y el filtro de archivos está en api.Dockerfile.dockerignore (deniega todo salvo backend/ y el healthcheck).
# NO PROBADO en CI local: incluye conductas/prompts (T06) y tarifas-2026.json para turno/cotizador en runtime.

ARG GO_VERSION=1.24.7
ARG ALPINE_VERSION=3.22

# ---- Etapa 1: compilar la API (binario estático, sin CGO) ----
FROM golang:${GO_VERSION}-alpine${ALPINE_VERSION} AS compilar
ENV CGO_ENABLED=0 \
    GOTOOLCHAIN=local \
    GOFLAGS="-trimpath -mod=readonly"
WORKDIR /src
COPY backend/go.mod backend/go.sum* ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY backend/ ./
# Paquete main de la API: supuesto ./cmd/api (el esqueleto de T03 se perdió; si cambia, usar --build-arg MAIN_PKG=...).
ARG MAIN_PKG=./cmd/api
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -o /out/api "${MAIN_PKG}"

# ---- Etapa 2: healthcheck propio (la imagen final no tiene shell, curl ni wget) ----
FROM golang:${GO_VERSION}-alpine${ALPINE_VERSION} AS salud
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOFLAGS="-trimpath -mod=readonly"
WORKDIR /src
COPY infra/docker/healthcheck/ ./
RUN go build -ldflags="-s -w" -o /out/healthcheck .

# ---- Etapa 3: imagen final mínima, sin shell, usuario no root ----
# distroless "static" trae certificados CA y tzdata (hacen falta para TLS hacia proveedores y hacia la base).
FROM gcr.io/distroless/static-debian12:nonroot
LABEL org.opencontainers.image.title="videocotizacion-api" \
      org.opencontainers.image.description="API de VideoCotización (Go)" \
      org.opencontainers.image.source="https://github.com/ (completar con el repo real)"
COPY --from=compilar --chmod=0555 /out/api /api
COPY --from=salud --chmod=0555 /out/healthcheck /healthcheck
COPY conductas/prompts /conductas/prompts
COPY tarifas/tarifas-2026.json /tarifas/tarifas-2026.json
WORKDIR /
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/api"]
CMD ["servir"]
