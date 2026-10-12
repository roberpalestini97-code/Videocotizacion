// Package cotizador calcula el presupuesto orientativo EN GO, en centavos
// int64, desde el tarifario (tarifas/tarifas-2026.json). El LLM nunca pone
// montos: solo aporta tarea, cantidades y condiciones (ADR 0002, BRIEF).
package cotizador

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"unicode/utf8"

	"videocotizacion/backend/internal/dominio"
)

// Tarifario es la tabla de precios cargada y validada.
type Tarifario struct {
	Version         string
	Estado          dominio.EstadoTarifas
	Moneda          dominio.Moneda
	UsoEnProduccion bool
	tareas          map[string]Tarea
	factores        []Factor
	reglasTrabajo   map[string]reglaMotor
	localidadesLLM  map[string]dominio.Zona
}

// Tarea es un precio por unidad como rango. Precio nil = sin fuente (no se
// cotiza: se deriva al profesional).
type Tarea struct {
	ID          string
	Oficio      string
	Descripcion string
	Unidad      string
	Precio      *Rango
	MotivoNull  string
}

// Rango de precio unitario en centavos.
type Rango struct{ Min, Max dominio.Centavos }

// Factor es un recargo en puntos básicos (2000 = +20 %). MinBps/MaxBps nil =
// sin fuente: no se aplica.
type Factor struct {
	ID      string
	AplicaA []string
	MinBps  *int64
	MaxBps  *int64
}

// Tarea devuelve la tarea por id.
func (t *Tarifario) Tarea(id string) (Tarea, bool) {
	ta, ok := t.tareas[id]
	return ta, ok
}

// CantidadTareas informa cuántas tareas tiene el tarifario.
func (t *Tarifario) CantidadTareas() int { return len(t.tareas) }

// Formato del archivo (solo los campos que usa el cálculo). encoding/json
// decodifica los montos directamente a int64: un monto con decimales falla.
type archivoTarifas struct {
	Version         string `json:"version"`
	Estado          string `json:"estado"`
	Moneda          string `json:"moneda"`
	UnidadMonto     string `json:"unidad_monto"`
	UnidadRecargo   string `json:"unidad_recargo"`
	UsoEnProduccion *bool  `json:"uso_en_produccion"`
	Oficios         []struct {
		ID     string `json:"id"`
		Tareas []struct {
			ID          string `json:"id"`
			Descripcion string `json:"descripcion"`
			Unidad      string `json:"unidad"`
			Precio      *struct {
				Min *int64 `json:"min_centavos"`
				Max *int64 `json:"max_centavos"`
			} `json:"precio"`
			MotivoNull *string `json:"motivo_null"`
		} `json:"tareas"`
	} `json:"oficios"`
	Factores []struct {
		ID      string   `json:"id"`
		AplicaA []string `json:"aplica_a"`
		Tipo    string   `json:"tipo"`
		MinBps  *int64   `json:"min_bps"`
		MaxBps  *int64   `json:"max_bps"`
	} `json:"factores_ajuste"`
	Motor *motorCotizacionArchivo `json:"motor_cotizacion"`
}

var (
	reIDTarea  = regexp.MustCompile(`^[a-z0-9_]{3,60}$`)
	reSeguro   = regexp.MustCompile(`^[^<>\x00-\x08\x0B\x0C\x0E-\x1F]*$`)
	reVersion  = regexp.MustCompile(`^[0-9A-Za-z.\-]{1,20}$`)
	unidadesOK = map[string]bool{"m2": true, "ml": true, "unidad": true, "visita": true, "trabajo": true, "mes": true, "jornal": true, "hora": true, "m2_mes": true}
)

// ErrTarifarioInvalido indica un archivo de tarifas inconsistente.
var ErrTarifarioInvalido = errors.New("tarifario inválido")

// CargarTarifario lee y valida el JSON de tarifas.
func CargarTarifario(r io.Reader) (*Tarifario, error) {
	var a archivoTarifas
	dec := json.NewDecoder(io.LimitReader(r, 4<<20))
	if err := dec.Decode(&a); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrTarifarioInvalido, err)
	}
	var errs []error
	mal := func(format string, args ...any) {
		errs = append(errs, fmt.Errorf(format, args...))
	}
	if !reVersion.MatchString(a.Version) {
		mal("version %q inválida", a.Version)
	}
	estado := dominio.EstadoTarifas(a.Estado)
	if !estado.Valido() {
		mal("estado %q no permitido", a.Estado)
	}
	moneda := dominio.Moneda(a.Moneda)
	if !moneda.Valida() {
		mal("moneda %q no permitida", a.Moneda)
	}
	if a.UnidadMonto != "centavos_int64" || a.UnidadRecargo != "bps_int" {
		mal("unidades de monto/recargo inesperadas: %q/%q", a.UnidadMonto, a.UnidadRecargo)
	}
	if a.UsoEnProduccion == nil {
		mal("falta uso_en_produccion")
	}
	t := &Tarifario{Version: a.Version, Estado: estado, Moneda: moneda, tareas: map[string]Tarea{}}
	if a.UsoEnProduccion != nil {
		t.UsoEnProduccion = *a.UsoEnProduccion
	}
	if t.UsoEnProduccion && estado != dominio.TarifasValidadas {
		mal("uso_en_produccion=true exige estado validada")
	}
	for _, o := range a.Oficios {
		for _, ta := range o.Tareas {
			tarea, err := validarTarea(o.ID, ta.ID, ta.Descripcion, ta.Unidad, ta.Precio, ta.MotivoNull)
			if err != nil {
				errs = append(errs, err)
				continue
			}
			if _, dup := t.tareas[tarea.ID]; dup {
				mal("tarea %s repetida", tarea.ID)
			}
			t.tareas[tarea.ID] = tarea
		}
	}
	for _, f := range a.Factores {
		if !reIDTarea.MatchString(f.ID) || f.Tipo != "recargo_bps" {
			mal("factor %q inválido", f.ID)
			continue
		}
		if (f.MinBps == nil) != (f.MaxBps == nil) || (f.MinBps != nil && (*f.MinBps < 0 || *f.MaxBps < *f.MinBps || *f.MaxBps > 100000)) {
			mal("factor %s: rango de bps inválido", f.ID)
			continue
		}
		t.factores = append(t.factores, Factor{ID: f.ID, AplicaA: f.AplicaA, MinBps: f.MinBps, MaxBps: f.MaxBps})
	}
	if len(t.tareas) == 0 {
		mal("sin tareas")
	}
	reglas, loc, errMotor := construirReglasMotor(a.Motor)
	if errMotor != nil {
		mal("%v", errMotor)
	}
	if len(errs) > 0 {
		return nil, fmt.Errorf("%w: %w", ErrTarifarioInvalido, errors.Join(errs...))
	}
	t.reglasTrabajo = reglas
	t.localidadesLLM = loc
	return t, nil
}

func validarTarea(oficio, id, desc, unidad string, precio *struct {
	Min *int64 `json:"min_centavos"`
	Max *int64 `json:"max_centavos"`
}, motivoNull *string) (Tarea, error) {
	if !reIDTarea.MatchString(id) {
		return Tarea{}, fmt.Errorf("tarea %q: id inválido", id)
	}
	n := utf8.RuneCountInString(desc)
	if n < 1 || n > 200 || !reSeguro.MatchString(desc) {
		return Tarea{}, fmt.Errorf("tarea %s: descripción inválida", id)
	}
	if !unidadesOK[unidad] {
		return Tarea{}, fmt.Errorf("tarea %s: unidad %q desconocida", id, unidad)
	}
	ta := Tarea{ID: id, Oficio: oficio, Descripcion: desc, Unidad: unidad}
	switch {
	case precio == nil:
		if motivoNull == nil || strings.TrimSpace(*motivoNull) == "" {
			return Tarea{}, fmt.Errorf("tarea %s: precio null sin motivo_null", id)
		}
		ta.MotivoNull = *motivoNull
	case precio.Min == nil || precio.Max == nil:
		return Tarea{}, fmt.Errorf("tarea %s: precio incompleto", id)
	default:
		lo, hi := dominio.Centavos(*precio.Min), dominio.Centavos(*precio.Max)
		if lo < 0 || hi < lo || hi > dominio.MaxCentavos {
			return Tarea{}, fmt.Errorf("tarea %s: rango de precio inválido", id)
		}
		ta.Precio = &Rango{Min: lo, Max: hi}
	}
	return ta, nil
}

// aplica informa si el factor corresponde a la tarea ("pintura_*" = prefijo).
func (f Factor) aplica(tarea string) bool {
	for _, patron := range f.AplicaA {
		if patron == tarea || patron == "*" || (strings.HasSuffix(patron, "*") && strings.HasPrefix(tarea, strings.TrimSuffix(patron, "*"))) {
			return true
		}
	}
	return false
}
