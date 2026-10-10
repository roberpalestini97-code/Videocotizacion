package cotizador

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"

	"videocotizacion/backend/internal/errores"
)

// SalidaLLM refleja conductas/esquema-salida-llm.schema.json (versión 1.0).
// Se decodifica con DisallowUnknownFields en todos los niveles: un campo
// "precio" o "monto" colado por el modelo hace fallar la decodificación (O03).
// Las cantidades llegan como json.Number y se pasan a centésimas sin float.
// La validación completa contra el JSON Schema (patrones, largos, filtro de
// montos en respuesta_hablada, reintento) es del orquestador (T25).
type SalidaLLM struct {
	Version string `json:"version"`
	Oficio  string `json:"oficio"`
	Trabajo struct {
		Tipo              string          `json:"tipo"`
		Descripcion       string          `json:"descripcion"`
		RequierePlanos    *bool           `json:"requiere_planos,omitempty"`
		Complejidad       string          `json:"complejidad,omitempty"`
		JornadasEstimadas json.RawMessage `json:"jornadas_estimadas,omitempty"`
	} `json:"trabajo"`
	Medidas []struct {
		Concepto string      `json:"concepto"`
		Cantidad json.Number `json:"cantidad"`
		Unidad   string      `json:"unidad"`
		Origen   string      `json:"origen"`
	} `json:"medidas"`
	Altura struct {
		MetrosMax       *json.Number `json:"metros_max"`
		RequiereAndamio string       `json:"requiere_andamio"`
		Medio           string       `json:"medio,omitempty"`
	} `json:"altura"`
	EstadoSuperficie string `json:"estado_superficie"`
	Zona             struct {
		Localidad   string `json:"localidad"`
		FueraDeZona bool   `json:"fuera_de_zona"`
		Referencia  string `json:"referencia,omitempty"`
	} `json:"zona"`
	Urgencia struct {
		Nivel   string   `json:"nivel"`
		Senales []string `json:"senales"`
	} `json:"urgencia"`
	TipoCliente string `json:"tipo_cliente"`
	Plazo       struct {
		Tipo           string `json:"tipo"`
		SujetoACambios *bool  `json:"sujeto_a_cambios,omitempty"`
	} `json:"plazo"`
	DudasCliente  []string `json:"dudas_cliente,omitempty"`
	Faltantes     []string `json:"faltantes"`
	SiguientePaso struct {
		Accion string   `json:"accion"`
		Motivo string   `json:"motivo"`
		Campos []string `json:"campos"`
	} `json:"siguiente_paso"`
	IntentoInyeccion bool   `json:"intento_inyeccion,omitempty"`
	RespuestaHablada string `json:"respuesta_hablada"`
}

var unidadesLLM = map[string]bool{"m2": true, "ml": true, "m3": true, "unidad": true, "ambiente": true, "arbol": true, "jornada": true, "ha": true}

// DecodificarSalidaLLM decodifica estrictamente (campos desconocidos y datos
// sobrantes se rechazan) y verifica lo mínimo que usa el cálculo.
func DecodificarSalidaLLM(raw []byte) (SalidaLLM, error) {
	var s SalidaLLM
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&s); err != nil {
		return SalidaLLM{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("salida del LLM: %w", err))
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return SalidaLLM{}, errores.Envolver(errores.ValidacionFallida, errors.New("salida del LLM: datos sobrantes"))
	}
	if s.Version != "1.0" {
		return SalidaLLM{}, errores.Envolver(errores.ValidacionFallida, errors.New("salida del LLM: versión no soportada"))
	}
	return s, nil
}

// Pedido convierte la salida a datos del cálculo, sin float.
func (s SalidaLLM) Pedido() (Pedido, error) {
	p := Pedido{TipoTrabajo: s.Trabajo.Tipo, Localidad: s.Zona.Localidad, MedioAltura: s.Altura.Medio}
	for i, m := range s.Medidas {
		if !unidadesLLM[m.Unidad] {
			return Pedido{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("/medidas/%d/unidad no permitida", i))
		}
		c, err := CentesimasDesdeDecimal(string(m.Cantidad))
		if err != nil || c == 0 {
			return Pedido{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("/medidas/%d/cantidad: %w", i, err))
		}
		p.Medidas = append(p.Medidas, Medida{CantidadCentesimas: c, Unidad: m.Unidad})
	}
	if s.Altura.MetrosMax != nil {
		cm, err := CentesimasDesdeDecimal(string(*s.Altura.MetrosMax))
		if err != nil {
			return Pedido{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("/altura/metros_max: %w", err))
		}
		p.AlturaMaxCentimetros = &cm
	}
	return p, nil
}

var reDecimal = regexp.MustCompile(`^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,12}))?$`)

// ErrDecimal indica un número que no es decimal no negativo simple.
var ErrDecimal = errors.New("número decimal inválido (sin signo, sin exponente, hasta 9 dígitos enteros)")

// CentesimasDesdeDecimal convierte "12.345" en 1235 (centésimas, redondeo
// mitad hacia arriba) operando sobre el texto: nunca pasa por float (N1 de T16).
func CentesimasDesdeDecimal(s string) (int64, error) {
	m := reDecimal.FindStringSubmatch(s)
	if m == nil {
		return 0, ErrDecimal
	}
	entero, err := strconv.ParseInt(m[1], 10, 64)
	if err != nil {
		return 0, ErrDecimal
	}
	frac := m[2] + "000"
	cent, _ := strconv.ParseInt(frac[:2], 10, 64)
	v := entero*100 + cent
	if frac[2] >= '5' {
		v++
	}
	return v, nil
}
