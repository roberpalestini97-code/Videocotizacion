// Package evaluacion es el arnés de conductas contra el LLM real (T17): lee
// los casos fijos y la rúbrica versionada de conductas/evaluacion/ y puntúa
// cada salida validada del modelo campo por campo. No llama a la red: la
// corrida contra Gemini está en cmd/evaluar-conductas y no va en CI (gasta
// cupo del nivel gratuito).
package evaluacion

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
)

// VersionRubrica es la versión de rubrica.json y de los casos que este código
// sabe puntuar. Cambiar un campo o su regla sube la versión.
const VersionRubrica = "rubrica.1"

// Campos puntuados, en el orden del reporte. rubrica.json tiene que describir
// exactamente estos.
var Campos = []string{"oficio", "trabajo", "zona", "fuera_de_zona", "faltantes", "accion", "cotizacion", "intento_inyeccion"}

// Rubrica es conductas/evaluacion/rubrica.json.
type Rubrica struct {
	Version string            `json:"version"`
	Umbral  float64           `json:"umbral"`
	Campos  map[string]string `json:"campos"`
}

// Esperado son las reglas de un turno. Un campo vacío no se puntúa. Las listas
// de valores son alternativas aceptadas (una de ellas).
type Esperado struct {
	Oficio           []string `json:"oficio,omitempty"`
	Trabajo          []string `json:"trabajo,omitempty"`
	Zona             []string `json:"zona,omitempty"`
	FueraDeZona      *bool    `json:"fuera_de_zona,omitempty"`
	FaltantesIncluye []string `json:"faltantes_incluye,omitempty"`
	FaltantesExcluye []string `json:"faltantes_excluye,omitempty"`
	Accion           []string `json:"accion,omitempty"`
	Cotizacion       *bool    `json:"cotizacion,omitempty"`
	IntentoInyeccion *bool    `json:"intento_inyeccion,omitempty"`
}

// Turno es un mensaje ficticio del cliente y, opcionalmente, lo esperado.
type Turno struct {
	Cliente  string    `json:"cliente"`
	Esperado *Esperado `json:"esperado,omitempty"`
}

// Caso es un archivo de conductas/evaluacion/casos/.
type Caso struct {
	Rubrica      string  `json:"rubrica"`
	ID           string  `json:"id"`
	Descripcion  string  `json:"descripcion"`
	Origen       string  `json:"origen,omitempty"`
	OficioSesion string  `json:"oficio_sesion"`
	Turnos       []Turno `json:"turnos"`
}

// Observado es lo que dejó un turno real: la salida validada (si hubo) y si Go
// emitió la cotización.
type Observado struct {
	Valida           bool
	Oficio           string
	Trabajo          string
	Zona             string
	FueraDeZona      bool
	Faltantes        []string
	Accion           string
	Cotizacion       bool
	IntentoInyeccion bool
}

// Chequeo es el resultado de un campo en un turno.
type Chequeo struct {
	Campo    string
	OK       bool
	Esperado string
	Obtenido string
}

// CargarRubrica lee y valida rubrica.json.
func CargarRubrica(ruta string) (Rubrica, error) {
	var r Rubrica
	if err := leerEstricto(ruta, &r); err != nil {
		return r, err
	}
	if r.Version != VersionRubrica {
		return r, fmt.Errorf("rúbrica %q: este arnés puntúa %q", r.Version, VersionRubrica)
	}
	if r.Umbral <= 0 || r.Umbral > 1 {
		return r, fmt.Errorf("rúbrica: umbral %v fuera de (0, 1]", r.Umbral)
	}
	var claves []string
	for k := range r.Campos {
		claves = append(claves, k)
	}
	sort.Strings(claves)
	esperadas := slices.Clone(Campos)
	sort.Strings(esperadas)
	if !slices.Equal(claves, esperadas) {
		return r, fmt.Errorf("rúbrica: campos %v, el arnés puntúa %v", claves, esperadas)
	}
	return r, nil
}

// CargarCasos lee todos los .json de dir, ordenados por nombre.
func CargarCasos(dir string) ([]Caso, error) {
	nombres, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	sort.Strings(nombres)
	if len(nombres) == 0 {
		return nil, fmt.Errorf("sin casos en %s", dir)
	}
	vistos := map[string]bool{}
	casos := make([]Caso, 0, len(nombres))
	for _, n := range nombres {
		var c Caso
		if err := leerEstricto(n, &c); err != nil {
			return nil, err
		}
		if err := c.validar(); err != nil {
			return nil, fmt.Errorf("%s: %w", filepath.Base(n), err)
		}
		if vistos[c.ID] {
			return nil, fmt.Errorf("%s: id repetido %q", filepath.Base(n), c.ID)
		}
		vistos[c.ID] = true
		casos = append(casos, c)
	}
	return casos, nil
}

func (c Caso) validar() error {
	switch {
	case c.Rubrica != VersionRubrica:
		return fmt.Errorf("rubrica %q, se espera %q", c.Rubrica, VersionRubrica)
	case strings.TrimSpace(c.ID) == "":
		return errors.New("falta id")
	case strings.TrimSpace(c.OficioSesion) == "":
		return errors.New("falta oficio_sesion")
	case len(c.Turnos) == 0:
		return errors.New("sin turnos")
	}
	con := 0
	for i, t := range c.Turnos {
		if strings.TrimSpace(t.Cliente) == "" {
			return fmt.Errorf("turno %d sin texto del cliente", i+1)
		}
		if t.Esperado != nil {
			if len(Evaluar(*t.Esperado, Observado{})) == 0 {
				return fmt.Errorf("turno %d: esperado sin reglas", i+1)
			}
			con++
		}
	}
	if con == 0 {
		return errors.New("ningún turno tiene esperado")
	}
	return nil
}

func leerEstricto(ruta string, v any) error {
	b, err := os.ReadFile(ruta)
	if err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("%s: %w", filepath.Base(ruta), err)
	}
	return nil
}

// Evaluar puntúa un turno. Sin salida válida, todo campo con regla falla
// (salvo cotizacion, que la decide Go y se mira igual).
func Evaluar(e Esperado, o Observado) []Chequeo {
	var out []Chequeo
	uno := func(campo string, acept []string, obt string) {
		if len(acept) == 0 {
			return
		}
		if !o.Valida {
			obt = "salida_invalida"
		}
		out = append(out, Chequeo{campo, o.Valida && slices.Contains(acept, obt), strings.Join(acept, "|"), obt})
	}
	bin := func(campo string, esp *bool, obt bool, sinSalida bool) {
		if esp == nil {
			return
		}
		s := fmt.Sprint(obt)
		ok := obt == *esp
		if !o.Valida && !sinSalida {
			s, ok = "salida_invalida", false
		}
		out = append(out, Chequeo{campo, ok, fmt.Sprint(*esp), s})
	}
	uno("oficio", e.Oficio, o.Oficio)
	uno("trabajo", e.Trabajo, o.Trabajo)
	uno("zona", e.Zona, o.Zona)
	bin("fuera_de_zona", e.FueraDeZona, o.FueraDeZona, false)
	if len(e.FaltantesIncluye)+len(e.FaltantesExcluye) > 0 {
		ok := o.Valida
		for _, f := range e.FaltantesIncluye {
			ok = ok && slices.Contains(o.Faltantes, f)
		}
		for _, f := range e.FaltantesExcluye {
			ok = ok && !slices.Contains(o.Faltantes, f)
		}
		var esp []string
		for _, f := range e.FaltantesIncluye {
			esp = append(esp, "+"+f)
		}
		for _, f := range e.FaltantesExcluye {
			esp = append(esp, "-"+f)
		}
		obt := "[" + strings.Join(o.Faltantes, " ") + "]"
		if !o.Valida {
			obt = "salida_invalida"
		}
		out = append(out, Chequeo{"faltantes", ok, strings.Join(esp, " "), obt})
	}
	uno("accion", e.Accion, o.Accion)
	bin("cotizacion", e.Cotizacion, o.Cotizacion, true)
	bin("intento_inyeccion", e.IntentoInyeccion, o.IntentoInyeccion, false)
	return out
}

// Tasa acumula aciertos de un campo.
type Tasa struct{ OK, Total int }

// Valor es OK/Total (0 si no hubo chequeos).
func (t Tasa) Valor() float64 {
	if t.Total == 0 {
		return 0
	}
	return float64(t.OK) / float64(t.Total)
}

// Acumulado junta los chequeos de un caso en todas sus repeticiones.
type Acumulado map[string]*Tasa

// Sumar agrega los chequeos de un turno.
func (a Acumulado) Sumar(ch []Chequeo) {
	for _, c := range ch {
		t := a[c.Campo]
		if t == nil {
			t = &Tasa{}
			a[c.Campo] = t
		}
		t.Total++
		if c.OK {
			t.OK++
		}
	}
}

// Pasa informa si todos los campos puntuados llegan al umbral.
func (a Acumulado) Pasa(umbral float64) bool {
	for _, t := range a {
		if t.Total > 0 && t.Valor() < umbral {
			return false
		}
	}
	return len(a) > 0
}
