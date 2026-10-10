package rutas

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/servidor"
)

// leerMiCotizacion es GET /v1/panel/cotizaciones/{sesion_id}. SesionDetalle
// sin código de referencia ni derivación (T39). Anexa lectura ver_detalle (R69).
func (h *enlace) leerMiCotizacion(w http.ResponseWriter, r *http.Request) {
	hall, err := h.sesionDeCookie(r)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	sesionID := r.PathValue("sesion_id")
	s, err := h.almacen.LeerSesion(r.Context(), hall.TenantID, sesionID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if s.AsesorID != hall.AsesorID {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.NoEncontrado))
		return
	}
	as, err := h.almacen.LeerAsesor(r.Context(), hall.TenantID, hall.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	ahora := dominio.Instante(h.ahoraDePanel())
	regID, err := dominio.NuevoIDRegistro()
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if err := h.almacen.AnexarLectura(r.Context(), hall.TenantID, dominio.Lectura{
		ID: regID, OcurridoEn: ahora, AsesorID: hall.AsesorID,
		Accion: dominio.AccionVerDetalle, RecursoID: sesionID,
	}); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	cot, err := h.almacen.LeerCotizacionDeSesion(r.Context(), hall.TenantID, sesionID)
	if err != nil && !errores.Es(err, errores.NoEncontrado) {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	var cotPtr *dominio.Cotizacion
	if err == nil {
		cotPtr = &cot
	}
	oficio := prompts.OficioDelTurno(s.AvatarID, as.Oficios)
	resps, err := h.almacen.ListarRespuestasModeloDeSesion(r.Context(), hall.TenantID, sesionID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	cuerpo, err := mapaSesionDetalle(s, oficio, cotPtr, resps)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusOK, cuerpo)
}

func mapaSesionDetalle(s dominio.Sesion, oficio dominio.Oficio, cot *dominio.Cotizacion, resps []dominio.RespuestaModelo) (map[string]any, error) {
	if !oficio.Valido() {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("oficio del turno"))
	}
	var ultimaSalida []byte
	if len(resps) > 0 {
		ultimaSalida = resps[len(resps)-1].SalidaJSON
	}
	_, refPrompt, err := prompts.MaterialTurno(oficio, ultimaSalida)
	if err != nil {
		return nil, err
	}
	tarifas := "2026.1"
	resumen := "Consulta"
	if cot != nil {
		tarifas = cot.Tarifas.Version
		resumen = resumenCotizacionPanel(cot)
	} else if oficio.Valido() {
		resumen = fmt.Sprintf("Consulta de %s.", oficio)
	}
	out := map[string]any{
		"sesion_id":    s.ID,
		"estado":       string(s.Estado),
		"modo_avatar":  string(s.ModoAvatar),
		"creada_en":    s.CreadaEn.Format(time.RFC3339),
		"duracion_s":   s.DuracionS,
		"resumen":      resumen,
		"versiones": map[string]any{
			"tarifas":         tarifas,
			"prompt":          refPrompt,
			"esquema_salida":  prompts.EsquemaReferenciaPanel,
		},
	}
	if s.ConsentidaEn != nil {
		out["consentida_en"] = s.ConsentidaEn.Format(time.RFC3339)
	}
	if s.CerradaEn != nil {
		out["cerrada_en"] = s.CerradaEn.Format(time.RFC3339)
	}
	if s.MotivoCierre != "" {
		out["motivo_cierre"] = string(s.MotivoCierre)
	}
	if extra := datosExtraidosParaDetalle(resps, cot); extra != nil {
		out["datos_extraidos"] = extra
	}
	if cot != nil {
		out["cotizacion"] = mapaCotizacionContrato(*cot)
	}
	if len(resps) > 0 {
		mapped, err := mapasRespuestasModelo(resps)
		if err != nil {
			return nil, err
		}
		out["respuestas_modelo"] = mapped
	}
	return out, nil
}

func mapasRespuestasModelo(list []dominio.RespuestaModelo) ([]map[string]any, error) {
	out := make([]map[string]any, 0, len(list))
	for _, r := range list {
		var salida any
		if err := json.Unmarshal(r.SalidaJSON, &salida); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"turno":         r.Turno,
			"registrada_en": r.RegistradaEn.UTC().Format(time.RFC3339),
			"salida":        salida,
		})
	}
	return out, nil
}

func resumenCotizacionPanel(cot *dominio.Cotizacion) string {
	zona := nombreZonaPanel[cot.Zona]
	if zona == "" {
		zona = string(cot.Zona)
	}
	sufijo := ""
	if cot.FueraDeZona {
		sufijo = " (fuera de zona, se emitió igual)"
	}
	return fmt.Sprintf("Consulta de %s en %s%s.", cot.Oficio, zona, sufijo)
}

func datosExtraidosParaDetalle(resps []dominio.RespuestaModelo, cot *dominio.Cotizacion) map[string]any {
	if len(resps) > 0 {
		last := resps[len(resps)-1]
		if s, err := cotizador.DecodificarSalidaLLM(last.SalidaJSON); err == nil {
			if m, err := cotizador.MapaDatosExtraidos(s); err == nil {
				return m
			}
		}
	}
	if cot != nil {
		return mapaDatosExtraidosDesdeCotizacion(*cot)
	}
	return nil
}

func mapaDatosExtraidosDesdeCotizacion(cot dominio.Cotizacion) map[string]any {
	d := map[string]any{
		"oficio":                  string(cot.Oficio),
		"zona":                    string(cot.Zona),
		"fuera_de_zona":           cot.FueraDeZona,
		"faltantes":               []any{},
		"corregido_por_cliente":   false,
	}
	if len(cot.Items) > 0 {
		d["tarea"] = cot.Items[0].CodigoTarea
		switch cot.Items[0].Unidad {
		case dominio.UnidadM2:
			d["superficie_centesimas_m2"] = cot.Items[0].CantidadCentesimas
		case dominio.UnidadGlobal, dominio.UnidadVisita, dominio.UnidadHora:
			if cot.Items[0].CantidadCentesimas >= 100 {
				d["cantidad_unidades"] = cot.Items[0].CantidadCentesimas / 100
			}
		}
	}
	return d
}
