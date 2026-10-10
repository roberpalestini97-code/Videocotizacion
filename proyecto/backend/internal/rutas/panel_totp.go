package rutas

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	inactividadPanel = 30 * time.Minute
	absolutoPanel    = 12 * time.Hour
)

var (
	reValorCookie  = regexp.MustCompile(`^[A-Za-z0-9_-]{22,}$`)
	reCodigoTOTP   = regexp.MustCompile(`^[0-9]{6}$`)
	reRecuperacion = regexp.MustCompile(`^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`)
)

// secretoTOTPFijo se verifica cuando el asesor no tiene secreto, para no
// acortar ese camino frente a un código malo. No es un secreto de nadie.
var secretoTOTPFijo = bytes.Repeat([]byte{0x5a}, 20)

type totpSolicitud struct {
	Codigo       *string `json:"codigo"`
	Recuperacion *string `json:"codigo_recuperacion"`
}

func (h *enlace) ahoraDePanel() time.Time {
	if h.ahoraPanel != nil {
		return h.ahoraPanel().UTC()
	}
	return time.Now().UTC()
}

// verificarTotp es POST /v1/panel/sesion/totp. Exige la cookie preliminar y
// X-CSRF-Token. La cookie nueva es la sesión del panel; la vieja queda inválida.
func (h *enlace) verificarTotp(w http.ResponseWriter, r *http.Request) {
	valor, ok := cookiePanel(r)
	if !ok {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.SesionVencida))
		return
	}
	hashCookie := claves.HMAC(h.clave.Revelar(), valor)
	if len(hashCookie) != 32 {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.SesionVencida))
		return
	}
	hall, err := h.almacen.BuscarIngresoPorHash(r.Context(), hashCookie)
	if errores.Es(err, errores.NoEncontrado) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.SesionVencida))
		return
	}
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	ahora := h.ahoraDePanel()
	if !hall.Preliminar || hall.RevocadaEn != nil || !ahora.Before(hall.VenceEn) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.SesionVencida))
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
	codigo, recuperacion, esRec, err := decodificarTotp(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	ap := dominio.AperturaPanel{HashPrevio: hashCookie, Ahora: ahora}
	if esRec {
		presentado := claves.HMAC(h.clave.Revelar(), recuperacion)
		recuperacion = ""
		lista, err := h.almacen.ListarCodigosRecuperacion(r.Context(), hall.TenantID, hall.AsesorID)
		if err != nil {
			servidor.EscribirError(w, r, h.log, err)
			return
		}
		if !recuperacionCoincide(lista, presentado) {
			servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.TotpInvalido))
			return
		}
		ap.HashRecuperacion = presentado
	} else {
		paso, coincide, err := h.pasoTOTP(r, hall, codigo, ahora)
		codigo = ""
		if err != nil {
			servidor.EscribirError(w, r, h.log, err)
			return
		}
		if !coincide {
			servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.TotpInvalido))
			return
		}
		ap.Paso = &paso
	}
	as, err := h.almacen.LeerAsesor(r.Context(), hall.TenantID, hall.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if err := h.emitirSesionPanel(w, r, hall, as, ap, ahora); err != nil {
		servidor.EscribirError(w, r, h.log, err)
	}
}

func (h *enlace) pasoTOTP(r *http.Request, hall dominio.IngresoHallado, codigo string, ahora time.Time) (int64, bool, error) {
	sec, err := h.almacen.LeerSecretoTOTP(r.Context(), hall.TenantID, hall.AsesorID)
	if errores.Es(err, errores.NoEncontrado) {
		_, _ = dominio.PasoQueCoincide(secretoTOTPFijo, codigo, ahora)
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	claro, err := dominio.DescifrarSecretoTOTP(h.clave.Revelar(), sec.Cifrado)
	if err != nil {
		return 0, false, err
	}
	paso, ok := dominio.PasoQueCoincide(claro, codigo, ahora)
	for i := range claro {
		claro[i] = 0
	}
	return paso, ok, nil
}

func (h *enlace) emitirSesionPanel(w http.ResponseWriter, r *http.Request, hall dominio.IngresoHallado, as dominio.Asesor, ap dominio.AperturaPanel, ahora time.Time) error {
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
	cifrado, err := dominio.CifrarCSRFPanel(h.clave.Revelar(), csrf)
	if err != nil {
		return errores.Envolver(errores.ErrorInterno, fmt.Errorf("csrf"))
	}
	inact := dominio.Instante(ahora.Add(inactividadPanel))
	absoluto := dominio.Instante(ahora.Add(absolutoPanel))
	ap.Nueva = dominio.IngresoPanel{
		AsesorID: hall.AsesorID, HashCookie: hashCookie, HashCSRF: hashCSRF, CSRFCifrado: cifrado,
		EmitidaEn: dominio.Instante(ahora), VenceEn: absoluto, VenceInactividad: inact,
	}
	if err := h.almacen.AbrirSesionPanel(r.Context(), hall.TenantID, ap); err != nil {
		return err
	}
	w.Header().Set("Set-Cookie", fmt.Sprintf(
		"__Host-vc_panel=%s; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=%d",
		opaco, int(absolutoPanel/time.Second)))
	escribirJSON(w, http.StatusOK, map[string]any{
		"asesor": map[string]string{
			"asesor_id":      as.ID,
			"nombre_visible": as.NombreVisible,
			"rol":            string(as.Rol),
		},
		"csrf_token":           csrf,
		"vence_inactividad_en": inact.Format(time.RFC3339),
		"vence_absoluto_en":    absoluto.Format(time.RFC3339),
	})
	return nil
}

func (h *enlace) csrfCoincide(presentado string, guardado []byte) bool {
	material := presentado
	if material == "" {
		material = "csrf-ausente"
	}
	sum := claves.HMAC(h.clave.Revelar(), material)
	if len(sum) != 32 {
		sum = make([]byte, 32)
	}
	esperado := guardado
	if len(esperado) != 32 {
		esperado = make([]byte, 32)
	}
	return subtle.ConstantTimeCompare(sum, esperado) == 1
}

func cookiePanel(r *http.Request) (string, bool) {
	c, err := r.Cookie("__Host-vc_panel")
	if err != nil || !reValorCookie.MatchString(c.Value) {
		return "", false
	}
	return c.Value, true
}

func decodificarTotp(raw []byte) (codigo, recuperacion string, esRec bool, err error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s totpSolicitud
	if err := dec.Decode(&s); err != nil || dec.More() {
		return "", "", false, errores.Nuevo(errores.SolicitudInvalida)
	}
	if (s.Codigo == nil) == (s.Recuperacion == nil) {
		return "", "", false, errores.Nuevo(errores.SolicitudInvalida)
	}
	if s.Codigo != nil {
		codigo = *s.Codigo
		*s.Codigo = ""
		if !reCodigoTOTP.MatchString(codigo) {
			return "", "", false, errores.Nuevo(errores.SolicitudInvalida)
		}
		return codigo, "", false, nil
	}
	recuperacion = *s.Recuperacion
	*s.Recuperacion = ""
	if !reRecuperacion.MatchString(recuperacion) {
		return "", "", false, errores.Nuevo(errores.SolicitudInvalida)
	}
	return "", recuperacion, true, nil
}

func recuperacionCoincide(lista []dominio.CodigoRecuperacion, presentado []byte) bool {
	if len(presentado) != 32 {
		presentado = make([]byte, 32)
	}
	var ok int
	if len(lista) == 0 {
		subtle.ConstantTimeCompare(presentado, make([]byte, 32))
		return false
	}
	for _, c := range lista {
		hash := c.Hash
		if len(hash) != 32 {
			hash = make([]byte, 32)
		}
		coincide := subtle.ConstantTimeCompare(presentado, hash)
		if coincide == 1 && !c.Usado && c.Metodo == dominio.MetodoHMACRecuperacion {
			ok = 1
		}
	}
	return ok == 1
}
