package rutas

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/desafio"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

const (
	// topeIntentosPanel y ventanaIntentosPanel son provisorios: el contrato
	// no fija el número. Cinco fallos de la misma cuenta o de la misma IP
	// bloquean quince minutos. Un acierto no levanta un bloqueo ya activo.
	topeIntentosPanel    = 5
	ventanaIntentosPanel = 15 * time.Minute
	vigenciaPasoPanel    = 5 * time.Minute
)

var reCSRF = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

type loginSolicitud struct {
	Email      string `json:"email"`
	Contrasena string `json:"contrasena"`
}

type intentoPanel struct {
	fallos int
	hasta  time.Time
}

// iniciarSesionPanel es POST /v1/panel/sesion. security: []: no pide clave de
// API. La cookie es preliminar y no autoriza el resto del panel: falta el TOTP.
func (h *enlace) iniciarSesionPanel(w http.ResponseWriter, r *http.Request) {
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
	sol, err := decodificarLogin(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	email, errEmail := dominio.EmailDeLogin(sol.Email)
	clara := sol.Contrasena
	sol.Contrasena = ""
	if errEmail != nil || len(clara) < 12 || len(clara) > 256 {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.SolicitudInvalida))
		return
	}
	ahora := h.ahoraDePanel()
	ip := ipDelPedido(r)
	if h.bloqueadoPanel(email, ip, ahora) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.IntentosExcedidos))
		return
	}
	hallada, err := h.almacen.BuscarContrasenaPorEmail(r.Context(), email)
	if err != nil && !errores.Es(err, errores.NoEncontrado) {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	falta := errores.Es(err, errores.NoEncontrado)
	guardada := hallada.ContrasenaAsesor
	if falta {
		guardada = dominio.ContrasenaFicticia()
	}
	if falta || !guardada.Coincide(clara) {
		clara = ""
		h.anotarFalloPanel(email, ip, ahora)
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CredencialesIncorrectas))
		return
	}
	clara = ""
	if err := h.emitirPasoPanel(w, r, hallada, ahora); err != nil {
		servidor.EscribirError(w, r, h.log, err)
	}
}

func (h *enlace) emitirPasoPanel(w http.ResponseWriter, r *http.Request, hallada dominio.ContrasenaHallada, ahora time.Time) error {
	opaco, err := desafio.NuevoOpaco("")
	if err != nil {
		return errores.Envolver(errores.ErrorInterno, fmt.Errorf("cookie"))
	}
	csrf, err := desafio.NuevoOpaco("")
	if err != nil {
		return errores.Envolver(errores.ErrorInterno, fmt.Errorf("csrf"))
	}
	if !reCSRF.MatchString(csrf) || !reCSRF.MatchString(opaco) {
		return errores.Envolver(errores.ErrorInterno, fmt.Errorf("opaco"))
	}
	hashCookie := claves.HMAC(h.clave.Revelar(), opaco)
	hashCSRF := claves.HMAC(h.clave.Revelar(), csrf)
	if len(hashCookie) != 32 || len(hashCSRF) != 32 {
		return errores.Envolver(errores.ErrorInterno, fmt.Errorf("hmac"))
	}
	vence := dominio.Instante(ahora.Add(vigenciaPasoPanel))
	if err := h.almacen.GuardarIngresoPanel(r.Context(), hallada.TenantID, dominio.IngresoPanel{
		AsesorID: hallada.AsesorID, HashCookie: hashCookie, HashCSRF: hashCSRF,
		EmitidaEn: dominio.Instante(ahora), VenceEn: vence, Preliminar: true,
	}); err != nil {
		return err
	}
	w.Header().Set("Set-Cookie", fmt.Sprintf(
		"__Host-vc_panel=%s; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=%d",
		opaco, int(vigenciaPasoPanel/time.Second)))
	escribirJSON(w, http.StatusOK, map[string]any{
		"paso":       "totp",
		"csrf_token": csrf,
		"vence_en":   vence.Format(time.RFC3339),
	})
	return nil
}

func decodificarLogin(raw []byte) (loginSolicitud, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s loginSolicitud
	if err := dec.Decode(&s); err != nil || dec.More() {
		// El error de encoding/json puede citar el cuerpo: no se envuelve.
		return loginSolicitud{}, errores.Nuevo(errores.SolicitudInvalida)
	}
	return s, nil
}

func ipDelPedido(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || host == "" {
		if r.RemoteAddr == "" {
			return "desconocida"
		}
		return r.RemoteAddr
	}
	return host
}

func (h *enlace) bloqueadoPanel(email, ip string, ahora time.Time) bool {
	h.intentosMu.Lock()
	defer h.intentosMu.Unlock()
	return h.intentoActivo("cuenta:"+email, ahora) || h.intentoActivo("ip:"+ip, ahora)
}

func (h *enlace) intentoActivo(clave string, ahora time.Time) bool {
	v, ok := h.intentos[clave]
	if !ok || v.hasta.IsZero() {
		return false
	}
	if !ahora.Before(v.hasta) {
		delete(h.intentos, clave)
		return false
	}
	return true
}

func (h *enlace) anotarFalloPanel(email, ip string, ahora time.Time) {
	h.intentosMu.Lock()
	defer h.intentosMu.Unlock()
	h.sumarFallo("cuenta:"+email, ahora)
	h.sumarFallo("ip:"+ip, ahora)
}

func (h *enlace) sumarFallo(clave string, ahora time.Time) {
	v := h.intentos[clave]
	if !v.hasta.IsZero() && !ahora.Before(v.hasta) {
		v = intentoPanel{}
	}
	v.fallos++
	if v.fallos >= topeIntentosPanel {
		v.hasta = ahora.Add(ventanaIntentosPanel)
	}
	h.intentos[clave] = v
}
