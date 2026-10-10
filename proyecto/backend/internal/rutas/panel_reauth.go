package rutas

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

const reauthPanel = 5 * time.Minute

type reauthSolicitud struct {
	Contrasena *string `json:"contrasena"`
	Codigo     *string `json:"codigo_totp"`
}

// reautenticar es POST /v1/panel/reautenticacion. Contraseña y TOTP de un
// solo uso abren una ventana de cinco minutos. No rota la cookie ni alarga
// los vencimientos de la sesión.
func (h *enlace) reautenticar(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if !h.csrfCoincide(r.Header.Get("X-CSRF-Token"), hall.HashCSRF) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CsrfInvalido))
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
	clara, codigo, err := decodificarReauth(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	defer func() {
		clara = ""
		codigo = ""
	}()
	guardada, err := h.almacen.LeerContrasena(r.Context(), hall.TenantID, hall.AsesorID)
	falta := errores.Es(err, errores.NoEncontrado)
	if err != nil && !falta {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	email := guardada.Email
	if falta {
		guardada = dominio.ContrasenaFicticia()
	}
	if email == "" {
		email = hall.AsesorID
	}
	ahora := h.ahoraDePanel()
	ip := ipDelPedido(r)
	if h.bloqueadoPanel(email, ip, ahora) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.IntentosExcedidos))
		return
	}
	if falta || !guardada.Coincide(clara) {
		h.anotarFalloPanel(email, ip, ahora)
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CredencialesIncorrectas))
		return
	}
	paso, ok, err := h.pasoTOTP(r, hall, codigo, ahora)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if !ok {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.TotpInvalido))
		return
	}
	hasta := dominio.Instante(ahora.Add(reauthPanel))
	if err := h.almacen.OtorgarReautenticacion(r.Context(), hall.TenantID, hall.HashCookie, paso, hasta, ahora); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusOK, map[string]any{
		"valida_hasta": hasta.Format(time.RFC3339),
		"valida_s":     int(reauthPanel / time.Second),
	})
}

func decodificarReauth(raw []byte) (contrasena, codigo string, err error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s reauthSolicitud
	if err := dec.Decode(&s); err != nil || dec.More() {
		// El error de encoding/json puede citar el cuerpo: no se envuelve.
		return "", "", errores.Nuevo(errores.SolicitudInvalida)
	}
	if s.Contrasena == nil || s.Codigo == nil {
		return "", "", errores.Nuevo(errores.SolicitudInvalida)
	}
	if len(*s.Contrasena) < 12 || len(*s.Contrasena) > 256 || !reCodigoTOTP.MatchString(*s.Codigo) {
		return "", "", errores.Nuevo(errores.SolicitudInvalida)
	}
	return *s.Contrasena, *s.Codigo, nil
}
