package rutas

import (
	"fmt"
	"net/http"
	"strings"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

// leerCotizacion es GET .../cotizacion. Lee lo ya guardado: no recalcula
// precios ni inventa una cotización. El esquema del contrato tiene un entero
// por precio y el almacén un rango; no se promedia. Si los extremos coinciden,
// ese entero es el publicado. Si no, se publica el mínimo ya guardado: el
// máximo sigue en el almacén hasta que el contrato pueda llevar el rango.
func (h *enlace) leerCotizacion(w http.ResponseWriter, r *http.Request) {
	hall, ok := h.credencialDeSesion(w, r, true)
	if !ok {
		return
	}
	if _, err := h.almacen.LeerSesion(r.Context(), hall.TenantID, hall.SesionID); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	cot, err := h.almacen.LeerCotizacionDeSesion(r.Context(), hall.TenantID, hall.SesionID)
	if errores.Es(err, errores.NoEncontrado) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CotizacionNoEmitida))
		return
	}
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusOK, mapaCotizacionContrato(cot))
}

// leerDerivacion es GET .../derivacion. Arma el wa.me al profesional con un
// código opaco de la sesión. No envía mensajes ni abre una pasarela de pago.
func (h *enlace) leerDerivacion(w http.ResponseWriter, r *http.Request) {
	hall, ok := h.credencialDeSesion(w, r, true)
	if !ok {
		return
	}
	s, err := h.almacen.LeerSesion(r.Context(), hall.TenantID, hall.SesionID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if s.Estado != dominio.EstadoCerrada || s.CerradaEn == nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.EstadoInvalido, fmt.Errorf("derivación antes del cierre")))
		return
	}
	as, err := h.almacen.LeerAsesor(r.Context(), hall.TenantID, s.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	der, err := mapaDerivacionWhatsApp(s.ID, as.WhatsApp, *s.CerradaEn)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusOK, der)
}

// codigoReferencia deriva VC-xxxx-xxxxxx del id opaco de la sesión. No se
// guarda y no lleva nombre, teléfono ni dirección.
func codigoReferencia(sesionID string) (string, error) {
	cuerpo := strings.TrimPrefix(sesionID, "ses_")
	if len(cuerpo) != 26 || cuerpo == sesionID {
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("sesión sin id opaco"))
	}
	return "VC-" + cuerpo[:4] + "-" + cuerpo[4:10], nil
}
