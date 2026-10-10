package rutas

import (
	"fmt"
	"net/http"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

const cookiePanelBorrada = "__Host-vc_panel=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0"

// leerSesionPanel es GET /v1/panel/sesion. La cookie preliminar no alcanza.
// Devuelve el mismo CSRF que emitió el TOTP y no mueve los vencimientos.
func (h *enlace) leerSesionPanel(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	as, err := h.almacen.LeerAsesor(r.Context(), hall.TenantID, hall.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	fila, err := h.almacen.LeerIngresoPanel(r.Context(), hall.TenantID, hall.HashCookie)
	if errores.Es(err, errores.NoEncontrado) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.SesionVencida))
		return
	}
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	csrf, err := dominio.DescifrarCSRFPanel(h.clave.Revelar(), fila.CSRFCifrado)
	if err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ErrorInterno, fmt.Errorf("csrf")))
		return
	}
	cuerpo := map[string]any{
		"asesor": map[string]string{
			"asesor_id":      as.ID,
			"nombre_visible": as.NombreVisible,
			"rol":            string(as.Rol),
		},
		"csrf_token":           csrf,
		"vence_inactividad_en": hall.VenceInactividad.Format(time.RFC3339),
		"vence_absoluto_en":    hall.VenceEn.Format(time.RFC3339),
	}
	if fila.ReautenticadoHasta != nil && h.ahoraDePanel().Before(*fila.ReautenticadoHasta) {
		cuerpo["reautenticado_hasta"] = fila.ReautenticadoHasta.Format(time.RFC3339)
	}
	escribirJSON(w, http.StatusOK, cuerpo)
}

// cerrarSesionPanel es DELETE /v1/panel/sesion. Un CSRF distinto no invalida
// la sesión. El éxito borra la cookie y deja el id revocado en el servidor.
func (h *enlace) cerrarSesionPanel(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if !h.csrfCoincide(r.Header.Get("X-CSRF-Token"), hall.HashCSRF) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.CsrfInvalido))
		return
	}
	if err := h.almacen.CerrarSesionPanel(r.Context(), hall.TenantID, hall.HashCookie, h.ahoraDePanel()); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	w.Header().Set("Set-Cookie", cookiePanelBorrada)
	w.WriteHeader(http.StatusNoContent)
}

// sesionDeCookie exige la cookie de la sesión ya verificada con TOTP.
// Sin cookie es credencial_ausente. Preliminar, ajena, revocada o vencida
// es sesion_vencida. No alarga ningún vencimiento.
func (h *enlace) sesionDeCookie(r *http.Request) (dominio.IngresoHallado, error) {
	valor, ok := cookiePanel(r)
	if !ok {
		return dominio.IngresoHallado{}, errores.Nuevo(errores.CredencialAusente)
	}
	hash := claves.HMAC(h.clave.Revelar(), valor)
	if len(hash) != 32 {
		return dominio.IngresoHallado{}, errores.Nuevo(errores.SesionVencida)
	}
	hall, err := h.almacen.BuscarIngresoPorHash(r.Context(), hash)
	if errores.Es(err, errores.NoEncontrado) {
		return dominio.IngresoHallado{}, errores.Nuevo(errores.SesionVencida)
	}
	if err != nil {
		return dominio.IngresoHallado{}, err
	}
	if !hall.SesionVigente(h.ahoraDePanel()) {
		return dominio.IngresoHallado{}, errores.Nuevo(errores.SesionVencida)
	}
	return hall, nil
}
