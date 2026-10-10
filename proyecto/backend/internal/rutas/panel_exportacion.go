package rutas

import (
	"net/http"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

// exportarMiCuenta es POST /v1/panel/mi-cuenta/exportacion. Derecho de acceso
// del asesor (R49). La ventana de reautenticación no se consume. Sin una fila
// de consentimiento no se fabrica la aceptación y no se anexa la lectura.
func (h *enlace) exportarMiCuenta(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
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
	as, activo, cons, err := h.datosPerfil(r, hall)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if cons == nil {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.EstadoInvalido))
		return
	}
	id, err := dominio.NuevoIDRegistro()
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	fila := dominio.Lectura{
		ID: id, OcurridoEn: ahora, AsesorID: hall.AsesorID,
		Accion: dominio.AccionExportarMiCuenta, RecursoID: hall.AsesorID,
	}
	if err := h.almacen.AnexarLectura(r.Context(), hall.TenantID, fila); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	lista, err := h.almacen.ListarLecturasDelAsesor(r.Context(), hall.TenantID, hall.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	consumo, err := h.almacen.ConsumoDelAsesor(r.Context(), hall.TenantID, hall.AsesorID, ahora)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	items := make([]any, 0, len(lista))
	for _, l := range lista {
		items = append(items, vistaLectura(l))
	}
	if len(items) > 10000 {
		items = items[len(items)-10000:]
	}
	escribirJSON(w, http.StatusOK, map[string]any{
		"formato_version": "1",
		"generada_en":     ahora.Format(time.RFC3339),
		"perfil":          mapaPerfil(as, activo, cons),
		"lecturas":        items,
		"consumo": map[string]any{
			"ambito":               "asesor",
			"periodo":              ahora.UTC().Format("2006-01"),
			"segundos_usados":      consumo.SegundosUsados,
			"segundos_tope":        consumo.SegundosTope,
			"simultaneas_en_curso": consumo.SimultaneasEnCurso,
			"simultaneas_tope":     consumo.SimultaneasTope,
			"alerta":               "ninguna",
			"diario":               []any{},
			"actualizado_en":       ahora.Format(time.RFC3339),
		},
	})
}

func vistaLectura(l dominio.Lectura) map[string]any {
	item := map[string]any{
		"registro_id": l.ID,
		"ocurrido_en": l.OcurridoEn.Format(time.RFC3339),
		"asesor_id":   l.AsesorID,
		"accion":      string(l.Accion),
	}
	if l.RecursoID != "" {
		item["recurso_id"] = l.RecursoID
	}
	return item
}
