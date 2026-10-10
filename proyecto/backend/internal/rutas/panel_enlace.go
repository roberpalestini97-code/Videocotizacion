package rutas

import (
	"net/http"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

const urlEnlaceBase = "https://cotizar.videocotizacion.local/c/"

// rotarEnlace es POST /v1/panel/enlace/rotacion. Revoca el id público vigente
// y publica otro. No consume la ventana de reautenticación.
func (h *enlace) rotarEnlace(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if !h.csrfCoincide(r.Header.Get("X-CSRF-Token"), hall.HashCSRF) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CsrfInvalido))
		return
	}
	ahora := dominio.Instante(h.ahoraDePanel())
	if err := h.exigirReautenticacion(r, hall, ahora); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	id, err := dominio.NuevoIDPublico()
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	guardado, err := h.almacen.RotarEnlace(r.Context(), hall.TenantID, hall.AsesorID, dominio.Enlace{
		IDPublico: id, AsesorID: hall.AsesorID, CreadoEn: ahora,
	})
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	url := urlEnlaceBase + guardado.IDPublico
	escribirJSON(w, http.StatusOK, map[string]any{
		"id_publico":      guardado.IDPublico,
		"url":             url,
		"texto_compartir": "Pedí tu presupuesto por videollamada: " + url,
		"rotado_en":       guardado.CreadoEn.Format(time.RFC3339),
	})
}
