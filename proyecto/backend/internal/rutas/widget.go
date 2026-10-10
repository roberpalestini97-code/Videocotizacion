package rutas

import (
	"encoding/json"
	"net/http"
	"time"

	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

func (h *enlace) aviso(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.autenticar(w, r, true, true); !ok {
		return
	}
	escribirJSON(w, http.StatusOK, avisoVigente())
}

func (h *enlace) emitirDesafio(w http.ResponseWriter, r *http.Request) {
	hallada, ok := h.autenticar(w, r, true, false)
	if !ok {
		return
	}
	ahora := time.Now().UTC()
	em, err := h.libro.Emitir(hallada.ID, r.Header.Get("Origin"), ahora)
	if err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ErrorInterno, err))
		return
	}
	escribirJSON(w, http.StatusCreated, map[string]any{
		"desafio":         em.Desafio,
		"mecanismo":       "prueba_de_trabajo_sha256",
		"dificultad_bits": em.Dificultad,
		"vence_en":        em.Vence.Format(time.RFC3339),
		"vence_en_s":      int(em.Vence.Sub(ahora).Seconds()),
		"provisorio":      true,
	})
}

func avisoVigente() map[string]any {
	return map[string]any{
		"version":               versionAviso,
		"vigente_desde":         "2026-10-08",
		"url":                   urlAviso,
		"resumen":               "Usamos tu imagen y tu voz solo durante la llamada para cotizar el trabajo; no guardamos fotogramas ni audio.",
		"incisos":               []string{"finalidad", "destinatarios", "responsable", "obligatoriedad", "consecuencias", "derechos_arco", "transferencia_internacional", "autoridad_de_control"},
		"a_validar_con_abogado": true,
	}
}

func escribirJSON(w http.ResponseWriter, estado int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(estado)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}
