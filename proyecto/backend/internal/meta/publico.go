// Package meta sirve las lecturas públicas del contrato que no tocan la base
// ni credenciales: versión, catálogo de textos y tabla de retención (T04b,
// parte 1). Los plazos y los textos legales siguen a validar con abogado.
package meta

import "net/http"

// VersionContrato es la versión del OpenAPI que implementa este binario.
const VersionContrato = "0.1.4-borrador"

// VersionEventos queda en borrador: el contrato no la congela.
const VersionEventos = "vc-eventos.borrador.1"

// Registrar agrega GET /v1/version, /v1/textos y /v1/politicas/retencion.
func Registrar(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/version", escribir(version()))
	mux.HandleFunc("GET /v1/textos", escribir(catalogoTextos()))
	mux.HandleFunc("GET /v1/politicas/retencion", escribir(tablaRetencion()))
}

func escribir(v any) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = jsonNuevo(w, v)
	}
}
