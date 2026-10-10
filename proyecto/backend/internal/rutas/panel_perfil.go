package rutas

import (
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

var (
	reCursorPanel = regexp.MustCompile(`^[A-Za-z0-9_-]{16,200}$`)
	reFechaPanel  = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`)
)

var nombreZonaPanel = map[dominio.Zona]string{
	dominio.ZonaMarChiquita: "Mar Chiquita",
	dominio.ZonaCobo:        "Cobo",
	dominio.ZonaSantaClara:  "Santa Clara del Mar",
	dominio.ZonaParqueLago:  "Parque Lago",
	dominio.ZonaOtra:        "fuera de zona",
}

// leerPerfil es GET /v1/panel/perfil. Perfil mínimo del asesor de la cookie
// (R40): sin DNI ni domicilio. El consentimiento se incluye solo si hay una
// fila guardada; no se fabrica una aceptación.
func (h *enlace) leerPerfil(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	as, activo, cons, err := h.datosPerfil(r, hall)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirPerfil(w, as, activo, cons)
}

func (h *enlace) datosPerfil(r *http.Request, hall dominio.IngresoHallado) (dominio.Asesor, bool, *dominio.ConsentimientoAsesor, error) {
	as, err := h.almacen.LeerAsesor(r.Context(), hall.TenantID, hall.AsesorID)
	if err != nil {
		return dominio.Asesor{}, false, nil, err
	}
	_, err = h.almacen.LeerSecretoTOTP(r.Context(), hall.TenantID, hall.AsesorID)
	activo := err == nil
	if err != nil && !errores.Es(err, errores.NoEncontrado) {
		return dominio.Asesor{}, false, nil, err
	}
	cons, err := h.almacen.LeerConsentimientoAsesor(r.Context(), hall.TenantID, hall.AsesorID)
	if errores.Es(err, errores.NoEncontrado) {
		return as, activo, nil, nil
	}
	if err != nil {
		return dominio.Asesor{}, false, nil, err
	}
	return as, activo, &cons, nil
}

func escribirPerfil(w http.ResponseWriter, as dominio.Asesor, totpActivo bool, cons *dominio.ConsentimientoAsesor) {
	escribirJSON(w, http.StatusOK, mapaPerfil(as, totpActivo, cons))
}

func mapaPerfil(as dominio.Asesor, totpActivo bool, cons *dominio.ConsentimientoAsesor) map[string]any {
	oficios := make([]string, len(as.Oficios))
	for i, o := range as.Oficios {
		oficios[i] = string(o)
	}
	zonas := make([]string, len(as.Zonas))
	for i, z := range as.Zonas {
		zonas[i] = string(z)
	}
	cuerpo := map[string]any{
		"asesor_id":      as.ID,
		"rol":            string(as.Rol),
		"nombre_visible": as.NombreVisible,
		"email":          as.Email,
		"whatsapp":       as.WhatsApp,
		"oficios":        oficios,
		"zonas":          zonas,
		"totp_activo":    totpActivo,
		"creado_en":      as.CreadoEn.Format(time.RFC3339),
	}
	if cons != nil {
		cuerpo["consentimiento_asesor"] = map[string]any{
			"version":     cons.Version,
			"aceptado_en": cons.AceptadoEn.Format(time.RFC3339),
		}
	}
	return cuerpo
}

// listarMisCotizaciones es GET /v1/panel/cotizaciones. Solo las sesiones del
// asesor de la cookie (R41). El contacto no se copia: solo si existe.
func (h *enlace) listarMisCotizaciones(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	pagina, err := paginaPanel(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	sesiones, siguiente, err := h.almacen.ListarSesionesDeAsesor(r.Context(), hall.TenantID, hall.AsesorID, pagina)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	items := make([]map[string]any, 0, len(sesiones))
	for _, s := range sesiones {
		item, err := h.filaCotizacion(r, hall.TenantID, s)
		if err != nil {
			servidor.EscribirError(w, r, h.log, err)
			return
		}
		items = append(items, item)
	}
	cuerpo := map[string]any{"items": items}
	if siguiente != "" {
		cuerpo["siguiente_cursor"] = siguiente
	}
	escribirJSON(w, http.StatusOK, cuerpo)
}

func paginaPanel(r *http.Request) (almacen.Pagina, error) {
	var p almacen.Pagina
	q := r.URL.Query()
	if s := q.Get("limite"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 || n > 100 {
			return p, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("limite"))
		}
		p.Limite = n
	}
	if c := q.Get("cursor"); c != "" {
		if !reCursorPanel.MatchString(c) {
			return p, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("cursor"))
		}
		if _, _, err := almacen.DecodificarCursor(c); err != nil {
			return p, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("cursor"))
		}
		p.Despues = c
	}
	if o := q.Get("oficio"); o != "" {
		of := dominio.Oficio(o)
		if !of.Valido() {
			return p, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("oficio"))
		}
		p.Oficio = of
	}
	desde, err := fechaPanel(q.Get("desde"))
	if err != nil {
		return p, err
	}
	hasta, err := fechaPanel(q.Get("hasta"))
	if err != nil {
		return p, err
	}
	if !desde.IsZero() && !hasta.IsZero() && desde.After(hasta) {
		return p, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("desde"))
	}
	p.Desde, p.Hasta = desde, hasta
	return p, nil
}

func fechaPanel(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	if !reFechaPanel.MatchString(s) {
		return time.Time{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("fecha"))
	}
	t, err := time.ParseInLocation("2006-01-02", s, time.UTC)
	if err != nil {
		return time.Time{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("fecha"))
	}
	return t, nil
}

func (h *enlace) filaCotizacion(r *http.Request, tenant dominio.TenantID, s dominio.Sesion) (map[string]any, error) {
	codigo, err := codigoReferencia(s.ID)
	if err != nil {
		return nil, err
	}
	hay, err := h.hayContacto(r, tenant, s.ID)
	if err != nil {
		return nil, err
	}
	item := map[string]any{
		"sesion_id":           s.ID,
		"creada_en":           s.CreadaEn.Format(time.RFC3339),
		"estado":              string(s.Estado),
		"fuera_de_zona":       false,
		"contacto_disponible": hay,
		"resumen":             "consulta",
		"codigo_referencia":   codigo,
	}
	if s.MotivoCierre != "" {
		item["motivo_cierre"] = string(s.MotivoCierre)
	}
	cot, err := h.almacen.LeerCotizacionDeSesion(r.Context(), tenant, s.ID)
	if errores.Es(err, errores.NoEncontrado) {
		return item, nil
	}
	if err != nil {
		return nil, err
	}
	zona := nombreZonaPanel[cot.Zona]
	if zona == "" {
		zona = string(cot.Zona)
	}
	item["oficio"] = string(cot.Oficio)
	item["zona"] = string(cot.Zona)
	item["fuera_de_zona"] = cot.FueraDeZona
	item["resumen"] = string(cot.Oficio) + " en " + zona
	item["total"] = map[string]any{
		"cotizacion_id":  cot.ID,
		"total_centavos": int64(cot.TotalMinCentavos),
		"moneda":         string(cot.Moneda),
	}
	return item, nil
}

func (h *enlace) hayContacto(r *http.Request, tenant dominio.TenantID, sesionID string) (bool, error) {
	_, err := h.almacen.LeerContacto(r.Context(), tenant, sesionID)
	if errores.Es(err, errores.NoEncontrado) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
