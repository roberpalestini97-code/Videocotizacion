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

const finalidadContacto = "que_el_profesional_te_contacte"

// registrarContacto es POST .../contacto. Solo el token vc_ses_ de esa sesión.
// El consentimiento no viene premarcado (R68). La respuesta no repite nombre,
// teléfono ni email, y el log tampoco: el texto legal sigue a validar con abogado.
func (h *enlace) registrarContacto(w http.ResponseWriter, r *http.Request) {
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
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("cuerpo ilegible")))
		return
	}
	sol, err := decodificarContacto(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("json de contacto")))
		return
	}
	if sol.Consentimiento.Acepta == nil || !*sol.Consentimiento.Acepta {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("acepta_ser_contactado")))
		return
	}
	if sol.Consentimiento.Aviso != versionAviso {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("aviso_version")))
		return
	}
	if sol.Consentimiento.Finalidad != finalidadContacto {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("finalidad")))
		return
	}
	if sol.Telefono == "" && sol.Email == "" {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("telefono o email")))
		return
	}
	s, err := h.almacen.LeerSesion(r.Context(), hall.TenantID, hall.SesionID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	tn, err := h.almacen.LeerTenant(r.Context(), hall.TenantID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	ahora := time.Now().UTC()
	c := dominio.Contacto{
		SesionID: s.ID, AsesorID: s.AsesorID, Nombre: sol.Nombre, Telefono: sol.Telefono,
		Email: sol.Email, Preferencia: sol.Preferencia, AvisoVersion: sol.Consentimiento.Aviso,
		RegistradoEn: ahora, BorrarDespuesDe: ahora.AddDate(0, 0, tn.RetencionDias),
	}
	if err := c.Validar(); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	guardado, err := h.almacen.RegistrarContacto(r.Context(), hall.TenantID, c, ahora)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusCreated, map[string]any{
		"sesion_id":      guardado.SesionID,
		"registrado_en":  guardado.RegistradoEn.Format(time.RFC3339),
		"aviso_version":  guardado.AvisoVersion,
		"retencion_dias": tn.RetencionDias,
	})
}

type solicitudContacto struct {
	Nombre         string `json:"nombre"`
	Telefono       string `json:"telefono"`
	Email          string `json:"email"`
	Preferencia    string `json:"preferencia"`
	Consentimiento struct {
		Aviso     string `json:"aviso_version"`
		Acepta    *bool  `json:"acepta_ser_contactado"`
		Finalidad string `json:"finalidad"`
	} `json:"consentimiento"`
}

func decodificarContacto(raw []byte) (solicitudContacto, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s solicitudContacto
	if err := dec.Decode(&s); err != nil {
		return solicitudContacto{}, err
	}
	if dec.More() {
		return solicitudContacto{}, errors.New("json con datos de más")
	}
	return s, nil
}
