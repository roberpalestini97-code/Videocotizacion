package errores

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestCodigosIgualAlCatalogo(t *testing.T) {
	enGo := Todos()
	enJSON := CodigosCatalogo()
	if fmt.Sprint(enGo) != fmt.Sprint(enJSON) {
		t.Fatalf("códigos en Go y en el catálogo difieren:\nGo:   %v\nJSON: %v", enGo, enJSON)
	}
	if len(enGo) != 30 {
		t.Fatalf("se esperaban 30 códigos en el catálogo 0.1.4, hay %d", len(enGo))
	}
}

// La copia embebida debe ser idéntica a la del contrato (fuente de verdad).
func TestCopiaIgualAlContrato(t *testing.T) {
	ruta := filepath.Join("..", "..", "..", "contracts", "catalogo-errores.json")
	contrato, err := os.ReadFile(ruta)
	if err != nil {
		t.Fatalf("no se pudo leer el catálogo del contrato (%s): %v", ruta, err)
	}
	if !bytes.Equal(contrato, catalogoJSON) {
		t.Fatalf("internal/errores/catalogo-errores.json difiere de contracts/catalogo-errores.json: copiarlo de nuevo")
	}
}

func TestProblemaNoFiltraCausa(t *testing.T) {
	causa := errors.New("pq: duplicate key value violates unique constraint \"x\" Key (email)=(juan@x.com)")
	err := fmt.Errorf("guardando: %w", Envolver(ValidacionFallida, causa))
	p := ProblemaDe(err, NuevoIDTraza())
	b, _ := json.Marshal(p)
	s := string(b)
	if strings.Contains(s, "juan@x.com") || strings.Contains(s, "duplicate") {
		t.Fatalf("el problema filtra la causa interna: %s", s)
	}
	if p.Status != 422 || p.Codigo != ValidacionFallida || p.Type != BaseTipo+"validacion_fallida" {
		t.Fatalf("problema inesperado: %+v", p)
	}
	if !regexp.MustCompile(`^tr_[0-9a-f]{16}$`).MatchString(p.IDTraza) {
		t.Fatalf("id_traza con formato inválido: %q", p.IDTraza)
	}
	if !errors.Is(err, causa) {
		t.Fatal("la causa debe seguir disponible con errors.Is para los logs")
	}
	if err.Error() != "guardando: validacion_fallida" {
		t.Fatalf("Error() no debe incluir la causa: %q", err.Error())
	}
}

func TestErrorSinCodigoEsInterno(t *testing.T) {
	p := ProblemaDe(errors.New("algo raro con datos sensibles"), "tr_0123456789abcdef")
	if p.Codigo != ErrorInterno || p.Status != 500 {
		t.Fatalf("un error sin código debe ser error_interno/500: %+v", p)
	}
	if Buscar("no_existe").HTTP != 500 {
		t.Fatal("un código desconocido debe mapear a 500")
	}
}

func TestEstadosHTTPDelCatalogo(t *testing.T) {
	casos := map[Codigo]int{NoEncontrado: 404, CuotaAgotada: 429, EstadoInvalido: 409, ServicioNoDisponible: 503, CredencialAusente: 401}
	for c, http := range casos {
		if got := Buscar(c).HTTP; got != http {
			t.Errorf("%s: http %d, se esperaba %d", c, got, http)
		}
	}
}

func TestIsYEs(t *testing.T) {
	err := fmt.Errorf("capa: %w", Envolver(NoEncontrado, errors.New("x")))
	if !errors.Is(err, Nuevo(NoEncontrado)) || errors.Is(err, Nuevo(EstadoInvalido)) {
		t.Fatal("errors.Is por código no funciona")
	}
	if !Es(err, NoEncontrado) || Es(nil, NoEncontrado) {
		t.Fatal("Es no funciona")
	}
}
