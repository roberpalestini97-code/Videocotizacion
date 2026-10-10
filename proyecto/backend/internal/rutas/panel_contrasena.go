package rutas

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

type cambioContrasenaSolicitud struct {
	Nueva *string `json:"contrasena_nueva"`
}

// cambiarContrasena es POST /v1/panel/contrasena. Exige la ventana de
// reautenticación. Reemplaza el hash, revoca las demás cookies del asesor
// y consume la ventana. Esta cookie sigue válida.
func (h *enlace) cambiarContrasena(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if !h.csrfCoincide(r.Header.Get("X-CSRF-Token"), hall.HashCSRF) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CsrfInvalido))
		return
	}
	ahora := h.ahoraDePanel()
	if err := h.exigirReautenticacion(r, hall, ahora); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if !cuerpoJSON(r) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.TipoDeContenidoNoSoportado))
		return
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			servidor.EscribirError(w, r, h.log, err)
			return
		}
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.SolicitudInvalida))
		return
	}
	clara, err := decodificarCambio(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	defer func() { clara = "" }()
	guardada, err := h.almacen.LeerContrasena(r.Context(), hall.TenantID, hall.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	nueva, err := dominio.NuevaContrasena(hall.AsesorID, guardada.Email, clara)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	nueva.CreadaEn = dominio.Instante(ahora)
	if err := h.almacen.CambiarContrasena(r.Context(), hall.TenantID, hall.HashCookie, nueva, ahora); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *enlace) exigirReautenticacion(r *http.Request, hall dominio.IngresoHallado, ahora time.Time) error {
	fila, err := h.almacen.LeerIngresoPanel(r.Context(), hall.TenantID, hall.HashCookie)
	if errores.Es(err, errores.NoEncontrado) {
		return errores.Nuevo(errores.SesionVencida)
	}
	if err != nil {
		return err
	}
	if fila.ReautenticadoHasta == nil || !ahora.Before(*fila.ReautenticadoHasta) {
		return errores.Nuevo(errores.ReautenticacionRequerida)
	}
	return nil
}

func decodificarCambio(raw []byte) (string, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s cambioContrasenaSolicitud
	if err := dec.Decode(&s); err != nil || dec.More() {
		// El error de encoding/json puede citar el cuerpo: no se envuelve.
		return "", errores.Nuevo(errores.SolicitudInvalida)
	}
	if s.Nueva == nil {
		return "", errores.Envolver(errores.ValidacionFallida, fmt.Errorf("contrasena_nueva"))
	}
	return *s.Nueva, nil
}
