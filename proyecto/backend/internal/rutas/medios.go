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

const protocoloEventos = "vc-eventos.borrador.1"

// emitirTokenMedios es POST .../token-medios. Solo el token vc_ses_ de esa
// sesión. El tope de gasto mensual de Rober sigue sin cifra: no se convierte
// duración en dinero y esta ruta no está abierta al público. No llama
// proveedores ni abre el WebSocket.
func (h *enlace) emitirTokenMedios(w http.ResponseWriter, r *http.Request) {
	hall, ok := h.credencialDeSesion(w, r, false)
	if !ok {
		return
	}
	valor, err := desafio.NuevoOpaco("vc_med_")
	if err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ErrorInterno, err))
		return
	}
	ahora := h.ahoraDePanel()
	s, err := h.almacen.ReservarTokenMedios(r.Context(), hall.TenantID, hall.SesionID, claves.HMAC(h.clave.Revelar(), valor), ahora)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	vence := dominio.Instante(ahora.Add(dominio.VigenciaTokenMedios))
	escribirJSON(w, http.StatusCreated, map[string]any{
		"token":             valor,
		"ws_url":            "wss://api.videocotizacion.local/v1/sesiones/" + s.ID + "/medios",
		"vence_en":          vence.Format(time.RFC3339),
		"vence_en_s":        int(dominio.VigenciaTokenMedios / time.Second),
		"un_solo_uso":       true,
		"protocolo_eventos": protocoloEventos,
	})
}

// cerrarSesion es POST .../cierre. Acepta el token de la sesión o la clave
// secreta sin Origin. El cliente solo puede pedir los motivos del esquema
// CierreSolicitud; un motivo de servidor es validacion_fallida. No llama
// proveedores ni arma la derivación de WhatsApp.
func (h *enlace) cerrarSesion(w http.ResponseWriter, r *http.Request) {
	hall, ok := h.credencialDeSesion(w, r, true)
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
	motivo, err := decodificarCierre(raw)
	if err != nil || !motivoDeCliente(motivo) {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("motivo de cierre no permitido al cliente")))
		return
	}
	actual, err := h.almacen.LeerSesion(r.Context(), hall.TenantID, hall.SesionID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	if actual.Estado != dominio.EstadoCerrada && !motivoCabeEnEstado(actual.Estado, motivo) {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.EstadoInvalido, fmt.Errorf("motivo %s en estado %s", motivo, actual.Estado)))
		return
	}
	cerrada, err := h.almacen.CerrarSesion(r.Context(), hall.TenantID, hall.SesionID, motivo, h.ahoraDePanel())
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	cuerpo := map[string]any{
		"sesion_id":     cerrada.ID,
		"estado":        string(cerrada.Estado),
		"motivo_cierre": string(cerrada.MotivoCierre),
		"cerrada_en":    cerrada.CerradaEn.Format(time.RFC3339),
		"duracion_s":    cerrada.DuracionS,
	}
	cot, err := h.almacen.LeerCotizacionDeSesion(r.Context(), hall.TenantID, hall.SesionID)
	if err == nil && cot.ID != "" {
		cuerpo["cotizacion_id"] = cot.ID
	} else if err != nil && !errores.Es(err, errores.NoEncontrado) {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	escribirJSON(w, http.StatusOK, cuerpo)
}

func motivoDeCliente(m dominio.MotivoCierre) bool {
	switch m {
	case dominio.MotivoClienteCerro, dominio.MotivoSinConsentimiento, dominio.MotivoSinCamara:
		return true
	default:
		return false
	}
}

func motivoCabeEnEstado(estado dominio.EstadoSesion, m dominio.MotivoCierre) bool {
	switch m {
	case dominio.MotivoClienteCerro:
		return estado == dominio.EstadoCreada || estado == dominio.EstadoConsentida || estado == dominio.EstadoEnCurso
	case dominio.MotivoSinConsentimiento, dominio.MotivoSinCamara:
		return estado == dominio.EstadoCreada
	default:
		return false
	}
}

func decodificarCierre(raw []byte) (dominio.MotivoCierre, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s struct {
		Motivo dominio.MotivoCierre `json:"motivo"`
	}
	if err := dec.Decode(&s); err != nil {
		return "", err
	}
	if dec.More() {
		return "", errors.New("json con datos de más")
	}
	return s.Motivo, nil
}
