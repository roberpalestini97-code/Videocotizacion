package evaluacion

import (
	"encoding/json"
	"path/filepath"
	"slices"
	"testing"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/prompts"
)

var dirEval = filepath.Join("..", "..", "..", "conductas", "evaluacion")

func si(b bool) *bool { return &b }

func TestRubricaYCasosDelRepo(t *testing.T) {
	if _, err := CargarRubrica(filepath.Join(dirEval, "rubrica.json")); err != nil {
		t.Fatal(err)
	}
	casos, err := CargarCasos(filepath.Join(dirEval, "casos"))
	if err != nil {
		t.Fatal(err)
	}
	enums := enumsDelEsquema(t)
	zona := false
	for _, c := range casos {
		if !dominio.Oficio(c.OficioSesion).Valido() {
			t.Errorf("%s: oficio_sesion %q", c.ID, c.OficioSesion)
		}
		for i, tu := range c.Turnos {
			e := tu.Esperado
			if e == nil {
				continue
			}
			revisar := func(campo string, vals []string) {
				for _, v := range vals {
					if !slices.Contains(enums[campo], v) {
						t.Errorf("%s turno %d: %s=%q no está en el esquema", c.ID, i+1, campo, v)
					}
				}
			}
			revisar("oficio", e.Oficio)
			revisar("trabajo", e.Trabajo)
			revisar("zona", e.Zona)
			revisar("faltantes", e.FaltantesIncluye)
			revisar("faltantes", e.FaltantesExcluye)
			revisar("accion", e.Accion)
			if slices.Contains(e.FaltantesExcluye, "zona") && len(e.Zona) > 0 {
				zona = true
			}
		}
	}
	if !zona {
		t.Error("falta un caso que exija extraer la zona (demo local 2026-10-20)")
	}
}

func enumsDelEsquema(t *testing.T) map[string][]string {
	t.Helper()
	raw, err := prompts.EsquemaSalidaJSON()
	if err != nil {
		t.Fatal(err)
	}
	type enum struct {
		Enum []string `json:"enum"`
	}
	var e struct {
		Properties struct {
			Oficio  enum `json:"oficio"`
			Trabajo struct {
				Properties struct{ Tipo enum } `json:"properties"`
			} `json:"trabajo"`
			Zona struct {
				Properties struct{ Localidad enum } `json:"properties"`
			} `json:"zona"`
			Faltantes struct{ Items enum } `json:"faltantes"`
			Siguiente struct {
				Properties struct{ Accion enum } `json:"properties"`
			} `json:"siguiente_paso"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(raw, &e); err != nil {
		t.Fatal(err)
	}
	p := e.Properties
	out := map[string][]string{
		"oficio": p.Oficio.Enum, "trabajo": p.Trabajo.Properties.Tipo.Enum, "zona": p.Zona.Properties.Localidad.Enum,
		"faltantes": p.Faltantes.Items.Enum, "accion": p.Siguiente.Properties.Accion.Enum,
	}
	for k, v := range out {
		if len(v) == 0 {
			t.Fatalf("esquema: enum de %s vacío", k)
		}
	}
	return out
}

func TestEvaluar(t *testing.T) {
	e := Esperado{
		Zona: []string{"cobo"}, FueraDeZona: si(false), FaltantesIncluye: []string{"medidas"},
		FaltantesExcluye: []string{"zona"}, Accion: []string{"preguntar", "pedir_ver"}, Cotizacion: si(false),
	}
	bien := Observado{Valida: true, Zona: "cobo", Faltantes: []string{"medidas"}, Accion: "pedir_ver"}
	for _, c := range Evaluar(e, bien) {
		if !c.OK {
			t.Errorf("%s debería pasar: %+v", c.Campo, c)
		}
	}
	mal := Observado{Valida: true, Zona: "sin_definir", Faltantes: []string{"zona"}, Accion: "preguntar"}
	falla := map[string]bool{}
	for _, c := range Evaluar(e, mal) {
		falla[c.Campo] = !c.OK
	}
	if !falla["zona"] || !falla["faltantes"] || falla["accion"] || falla["fuera_de_zona"] {
		t.Errorf("chequeos inesperados: %v", falla)
	}
	// Sin salida válida falla todo salvo cotizacion, que la decide Go.
	for _, c := range Evaluar(e, Observado{}) {
		if c.OK != (c.Campo == "cotizacion") {
			t.Errorf("sin salida: %+v", c)
		}
	}
}

func TestAcumulado(t *testing.T) {
	a := Acumulado{}
	a.Sumar([]Chequeo{{Campo: "zona", OK: true}, {Campo: "accion", OK: true}})
	a.Sumar([]Chequeo{{Campo: "zona", OK: false}, {Campo: "accion", OK: true}})
	if a["zona"].Valor() != 0.5 || a.Pasa(0.8) || !a.Pasa(0.5) {
		t.Fatalf("zona=%v", a["zona"])
	}
	if (Acumulado{}).Pasa(0.5) {
		t.Fatal("sin chequeos no pasa")
	}
}
