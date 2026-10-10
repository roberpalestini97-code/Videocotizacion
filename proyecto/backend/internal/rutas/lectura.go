package rutas

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

// leerSesion es GET /v1/sesiones/{sesion_id}. Antes de responder corre el
// barrido de R60: silencio y duración máxima, con el reloj del panel. Es el
// único punto del proceso que lo dispara. Acepta clave secreta o el token de
// esa sesión. No llama proveedores.
func (h *enlace) leerSesion(w http.ResponseWriter, r *http.Request) {
	hall, ok := h.credencialDeSesion(w, r, true)
	if !ok {
		return
	}
	if _, err := h.almacen.BarrerLimites(r.Context(), hall.TenantID, h.ahoraDePanel(), sinVozProvisorioS, duracionMaximaProvisoriaS); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	h.escribirSesion(w, r, hall.TenantID, r.PathValue("sesion_id"))
}

// registrarConsentimiento es POST .../consentimiento. Solo el token de esa
// sesión. Solo-anexar: no llama proveedores ni emite token de medios.
func (h *enlace) registrarConsentimiento(w http.ResponseWriter, r *http.Request) {
	hall, ok := h.credencialDeSesion(w, r, false)
	if !ok {
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
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, err))
		return
	}
	sol, err := decodificarConsentimiento(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, err))
		return
	}
	// El contrato de esta operación asigna validacion_fallida a los datos que
	// no cumplen: los cuatro flags son const true y la única versión aceptada
	// es la vigente. version_retirada es de la versión de la API, no del aviso.
	if sol.AvisoVersion != versionAviso || !flagTrue(sol.AceptaCamara) || !flagTrue(sol.AceptaTratamiento) ||
		!flagTrue(sol.DeclaraMayor) || !flagTrue(sol.Informado) {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("consentimiento incompleto o aviso no vigente")))
		return
	}
	s, err := h.almacen.LeerSesion(r.Context(), hall.TenantID, hall.SesionID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	ahora := h.ahoraDePanel()
	c, err := dominio.NuevoConsentimiento(s, sol.AvisoVersion, ahora)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	actual, err := h.almacen.RegistrarConsentimiento(r.Context(), hall.TenantID, c, ahora)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusCreated, map[string]any{
		"consentimiento_id": c.ID,
		"sesion_id":         actual.ID,
		"aviso_version":     c.AvisoVersion,
		"registrado_en":     c.RegistradoEn.Format(time.RFC3339),
		"estado_sesion":     string(actual.Estado),
	})
}

// credencialDeSesion admite el token vc_ses_ de esa sesión. Si secreta es
// true (leer, cerrar, cotización y derivación) también admite la clave secreta, sin Origin.
// Si es false (consentimiento, token de medios, contacto), un Bearer vc_sec_ pasa por
// autenticar(false, false): la revocación responde 401 antes del 403 de tipo
// no admitido. La clave pública no se admite. Un path de otra sesión es 404.
func (h *enlace) credencialDeSesion(w http.ResponseWriter, r *http.Request, secreta bool) (dominio.TokenHallado, bool) {
	valor := bearer(r.Header.Get("Authorization"))
	if strings.HasPrefix(valor, "vc_ses_") && r.Header.Get("X-VC-Clave-Publica") == "" {
		hall, ok := h.autorizarToken(w, r, valor)
		if !ok {
			return dominio.TokenHallado{}, false
		}
		if r.PathValue("sesion_id") != hall.SesionID {
			servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.NoEncontrado))
			return dominio.TokenHallado{}, false
		}
		return hall, true
	}
	hallada, ok := h.autenticar(w, r, false, secreta)
	if !ok {
		return dominio.TokenHallado{}, false
	}
	return dominio.TokenHallado{TenantID: hallada.TenantID, SesionID: r.PathValue("sesion_id")}, true
}

type solicitudConsentimiento struct {
	AvisoVersion      string `json:"aviso_version"`
	AceptaCamara      *bool  `json:"acepta_camara_y_microfono"`
	AceptaTratamiento *bool  `json:"acepta_tratamiento"`
	DeclaraMayor      *bool  `json:"declara_mayor_de_18"`
	Informado         *bool  `json:"informado_asistente_automatico"`
}

func decodificarConsentimiento(raw []byte) (solicitudConsentimiento, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s solicitudConsentimiento
	if err := dec.Decode(&s); err != nil {
		return solicitudConsentimiento{}, err
	}
	if dec.More() {
		return solicitudConsentimiento{}, errors.New("json con datos de más")
	}
	return s, nil
}

func flagTrue(v *bool) bool { return v != nil && *v }

type cuerpoLecturaSesion struct {
	SesionID     string `json:"sesion_id"`
	Estado       string `json:"estado"`
	ModoAvatar   string `json:"modo_avatar"`
	CreadaEn     string `json:"creada_en"`
	ConsentidaEn string `json:"consentida_en,omitempty"`
	CerradaEn    string `json:"cerrada_en,omitempty"`
	MotivoCierre string `json:"motivo_cierre,omitempty"`
	DuracionS    int    `json:"duracion_s"`
	CotizacionID string `json:"cotizacion_id,omitempty"`
}

func (h *enlace) escribirSesion(w http.ResponseWriter, r *http.Request, tenant dominio.TenantID, id string) {
	s, err := h.almacen.LeerSesion(r.Context(), tenant, id)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	cuerpo := cuerpoLecturaSesion{
		SesionID: s.ID, Estado: string(s.Estado), ModoAvatar: string(s.ModoAvatar),
		CreadaEn: s.CreadaEn.Format(time.RFC3339), DuracionS: s.DuracionS,
	}
	if s.ConsentidaEn != nil {
		cuerpo.ConsentidaEn = s.ConsentidaEn.Format(time.RFC3339)
	}
	if s.CerradaEn != nil {
		cuerpo.CerradaEn = s.CerradaEn.Format(time.RFC3339)
	}
	if s.MotivoCierre != "" {
		cuerpo.MotivoCierre = string(s.MotivoCierre)
	}
	cot, err := h.almacen.LeerCotizacionDeSesion(r.Context(), tenant, id)
	if err == nil {
		cuerpo.CotizacionID = cot.ID
	} else if !errores.Es(err, errores.NoEncontrado) {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusOK, cuerpo)
}
