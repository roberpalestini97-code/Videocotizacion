package dominio

import (
	"encoding/json"
	"time"
)

// RespuestaModelo es la salida validada del LLM en un turno (R42).
type RespuestaModelo struct {
	SesionID     string
	Turno        int
	RegistradaEn time.Time
	SalidaJSON   []byte
}

// Validar comprueba ids, turno y JSON no vacío.
func (r RespuestaModelo) Validar() error {
	var errs []error
	if !IDValido(r.SesionID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato inválido"))
	}
	if r.Turno < 1 || r.Turno > 500 {
		errs = append(errs, invalido("/turno", "fuera de rango"))
	}
	if r.RegistradaEn.IsZero() {
		errs = append(errs, invalido("/registrada_en", "requerido"))
	}
	if len(r.SalidaJSON) == 0 || !json.Valid(r.SalidaJSON) {
		errs = append(errs, invalido("/salida", "json inválido"))
	}
	return unir(errs)
}
