package rutas

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/desafio"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

type claveWidgetSolicitud struct {
	Nombre  *string   `json:"nombre"`
	Origins *[]string `json:"origins"`
}

// listarClavesWidget es GET /v1/panel/claves-widget. Solo el administrador.
// No exige CSRF ni reautenticación, y nunca devuelve el valor.
func (h *enlace) listarClavesWidget(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if err := h.exigirAdmin(r, hall); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	lista, err := h.almacen.ListarClavesWidget(r.Context(), hall.TenantID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	items := make([]any, 0, len(lista))
	for _, c := range lista {
		items = append(items, vistaClaveWidget(c))
	}
	escribirJSON(w, http.StatusOK, map[string]any{"items": items})
}

// crearClaveWidget es POST /v1/panel/claves-widget. El valor se muestra una
// sola vez. No consume la ventana de reautenticación.
func (h *enlace) crearClaveWidget(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if err := h.exigirAdmin(r, hall); err != nil {
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
	nombre, origins, err := decodificarClaveWidget(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	id, err := dominio.NuevoIDClavePublica()
	if err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ErrorInterno, fmt.Errorf("clave")))
		return
	}
	valor, prefijo, err := nuevoValorClavePublica()
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	defer func() { valor = "" }()
	sum := claves.HMAC(h.clave.Revelar(), valor)
	if len(sum) != 32 {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ErrorInterno, fmt.Errorf("hmac")))
		return
	}
	clave := dominio.ClaveAPI{
		ID: id, Tipo: dominio.ClavePublica, Hash: sum, Prefijo: prefijo, Nombre: nombre,
		Origenes: origins, CreadaEn: ahora,
	}
	if err := clave.Validar(); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if err := h.almacen.GuardarClave(r.Context(), hall.TenantID, clave); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusCreated, map[string]any{
		"clave":                   vistaClaveWidget(clave),
		"valor":                   valor,
		"se_muestra_una_sola_vez": true,
	})
}

// revocarClaveWidget es DELETE /v1/panel/claves-widget/{clave_id}.
// No consume la ventana. Una clave ajena es el mismo 404 que una inexistente.
func (h *enlace) revocarClaveWidget(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if err := h.exigirAdmin(r, hall); err != nil {
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
	if err := h.almacen.RevocarClaveWidget(r.Context(), hall.TenantID, r.PathValue("clave_id"), ahora); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *enlace) exigirAdmin(r *http.Request, hall dominio.IngresoHallado) error {
	as, err := h.almacen.LeerAsesor(r.Context(), hall.TenantID, hall.AsesorID)
	if err != nil {
		return err
	}
	if as.Rol != dominio.RolAdministrar {
		return errores.Nuevo(errores.AlcanceInsuficiente)
	}
	return nil
}

func vistaClaveWidget(c dominio.ClaveAPI) map[string]any {
	origins := c.Origenes
	if origins == nil {
		origins = []string{}
	}
	item := map[string]any{
		"clave_id":  c.ID,
		"nombre":    c.Nombre,
		"prefijo":   c.Prefijo,
		"origins":   origins,
		"estado":    "activa",
		"creada_en": c.CreadaEn.Format(time.RFC3339),
	}
	if c.RevocadaEn != nil {
		item["estado"] = "revocada"
		item["revocada_en"] = c.RevocadaEn.Format(time.RFC3339)
	}
	return item
}

func nuevoValorClavePublica() (valor, prefijo string, err error) {
	opaco, err := desafio.NuevoOpaco("")
	if err != nil || len(opaco) < 40 {
		return "", "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("clave"))
	}
	valor = "vc_pub_" + opaco[:40]
	prefijo = valor[:len("vc_pub_")+4]
	return valor, prefijo, nil
}

func decodificarClaveWidget(raw []byte) (string, []string, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s claveWidgetSolicitud
	if err := dec.Decode(&s); err != nil || dec.More() {
		// El error de encoding/json puede citar el cuerpo: no se envuelve.
		return "", nil, errores.Nuevo(errores.SolicitudInvalida)
	}
	if s.Nombre == nil || *s.Nombre == "" || s.Origins == nil {
		return "", nil, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("clave widget"))
	}
	vistos := map[string]bool{}
	for _, o := range *s.Origins {
		if vistos[o] {
			return "", nil, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("origins"))
		}
		vistos[o] = true
	}
	return *s.Nombre, append([]string(nil), (*s.Origins)...), nil
}
