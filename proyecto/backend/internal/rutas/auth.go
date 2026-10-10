package rutas

import (
	"net/http"
	"strings"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

// autenticar aplica el tramo de credencial de la tabla de decisión: ausente,
// revocada, tipo no admitido, clave secreta con Origin y Origin de la pública.
// Si escribe el error, el bool es false.
func (h *enlace) autenticar(w http.ResponseWriter, r *http.Request, publica, secreta bool) (dominio.ClaveHallada, bool) {
	if h.clave.Vacio() {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.ServicioNoDisponible))
		return dominio.ClaveHallada{}, false
	}
	pub := r.Header.Get("X-VC-Clave-Publica")
	bearer := bearer(r.Header.Get("Authorization"))
	switch {
	case pub != "" && bearer != "":
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.AlcanceInsuficiente))
		return dominio.ClaveHallada{}, false
	case pub == "" && bearer == "":
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CredencialAusente))
		return dominio.ClaveHallada{}, false
	}
	presentada := pub
	if bearer != "" {
		presentada = bearer
	}
	hallada, err := h.almacen.BuscarClavePorHash(r.Context(), claves.HMAC(h.clave.Revelar(), presentada))
	if errores.Es(err, errores.NoEncontrado) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CredencialAusente))
		return dominio.ClaveHallada{}, false
	}
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return dominio.ClaveHallada{}, false
	}
	if hallada.Revocada {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CredencialInvalida))
		return dominio.ClaveHallada{}, false
	}
	admitida := (hallada.Tipo == dominio.ClavePublica && publica) || (hallada.Tipo == dominio.ClaveSecreta && secreta)
	if !admitida {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.AlcanceInsuficiente))
		return dominio.ClaveHallada{}, false
	}
	origin := r.Header.Get("Origin")
	if hallada.Tipo == dominio.ClaveSecreta {
		if origin != "" {
			servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.ClaveSecretaDesdeNavegador))
			return dominio.ClaveHallada{}, false
		}
		return hallada, true
	}
	if origin == "" || !contiene(hallada.Origenes, origin) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.OrigenNoPermitido))
		return dominio.ClaveHallada{}, false
	}
	return hallada, true
}

// autorizarToken resuelve un Bearer vc_ses_. No hay Bearer → credencial_ausente.
// Hash desconocido, vencido o revocado → credencial_invalida. El HMAC es el
// mismo que al guardar el token; el valor en claro no se busca en el almacén.
func (h *enlace) autorizarToken(w http.ResponseWriter, r *http.Request, valor string) (dominio.TokenHallado, bool) {
	if h.clave.Vacio() {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.ServicioNoDisponible))
		return dominio.TokenHallado{}, false
	}
	if valor == "" {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CredencialAusente))
		return dominio.TokenHallado{}, false
	}
	hall, err := h.almacen.BuscarTokenPorHash(r.Context(), claves.HMAC(h.clave.Revelar(), valor))
	if errores.Es(err, errores.NoEncontrado) || (err == nil && (hall.Revocado || !time.Now().Before(hall.VenceEn))) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CredencialInvalida))
		return dominio.TokenHallado{}, false
	}
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return dominio.TokenHallado{}, false
	}
	return hall, true
}

func bearer(h string) string {
	const p = "Bearer "
	if !strings.HasPrefix(h, p) {
		return ""
	}
	return strings.TrimSpace(h[len(p):])
}

func contiene(lista []string, v string) bool {
	for _, s := range lista {
		if s == v {
			return true
		}
	}
	return false
}
