package rutas

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

type perfilJSON struct {
	Nombre    json.RawMessage `json:"nombre_visible"`
	WhatsApp  json.RawMessage `json:"whatsapp"`
	Oficios   json.RawMessage `json:"oficios"`
	Zonas     json.RawMessage `json:"zonas"`
	Email     json.RawMessage `json:"email"`
	Rol       json.RawMessage `json:"rol"`
	DNI       json.RawMessage `json:"dni"`
	Domicilio json.RawMessage `json:"domicilio"`
}

// actualizarPerfil es PATCH /v1/panel/perfil. Solo cambia los campos presentes.
// Email, rol, DNI y domicilio no se aceptan. No pide reautenticación.
func (h *enlace) actualizarPerfil(w http.ResponseWriter, r *http.Request) {
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
	cambio, err := decodificarPerfil(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	as, err := h.almacen.LeerAsesor(r.Context(), hall.TenantID, hall.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	nuevo, err := as.AplicarPerfil(cambio)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	guardado, err := h.almacen.ActualizarPerfil(r.Context(), hall.TenantID, nuevo)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	_, activo, cons, err := h.datosPerfil(r, hall)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirPerfil(w, guardado, activo, cons)
}

func decodificarPerfil(raw []byte) (dominio.CambioPerfil, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s perfilJSON
	if err := dec.Decode(&s); err != nil || dec.More() {
		return dominio.CambioPerfil{}, errores.Nuevo(errores.SolicitudInvalida)
	}
	if s.Email != nil || s.Rol != nil || s.DNI != nil || s.Domicilio != nil {
		return dominio.CambioPerfil{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("campo no modificable"))
	}
	var c dominio.CambioPerfil
	var err error
	if c.Nombre, err = textoPerfil(s.Nombre); err != nil {
		return dominio.CambioPerfil{}, err
	}
	if c.WhatsApp, err = textoPerfil(s.WhatsApp); err != nil {
		return dominio.CambioPerfil{}, err
	}
	oficios, err := listaPerfil(s.Oficios)
	if err != nil {
		return dominio.CambioPerfil{}, err
	}
	if oficios != nil {
		out := make([]dominio.Oficio, len(oficios))
		for i, v := range oficios {
			out[i] = dominio.Oficio(v)
		}
		c.Oficios = &out
	}
	zonas, err := listaPerfil(s.Zonas)
	if err != nil {
		return dominio.CambioPerfil{}, err
	}
	if zonas != nil {
		out := make([]dominio.Zona, len(zonas))
		for i, v := range zonas {
			out[i] = dominio.Zona(v)
		}
		c.Zonas = &out
	}
	return c, nil
}

func textoPerfil(raw json.RawMessage) (*string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if string(raw) == "null" {
		return nil, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("valor nulo"))
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, errores.Nuevo(errores.SolicitudInvalida)
	}
	return &s, nil
}

func listaPerfil(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if string(raw) == "null" {
		return nil, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("valor nulo"))
	}
	var l []string
	if err := json.Unmarshal(raw, &l); err != nil {
		return nil, errores.Nuevo(errores.SolicitudInvalida)
	}
	return l, nil
}
