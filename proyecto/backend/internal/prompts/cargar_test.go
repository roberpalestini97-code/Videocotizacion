package prompts

import (
	"strings"
	"testing"

	"videocotizacion/backend/internal/dominio"
)

func TestCuerpoPorOficioPintura(t *testing.T) {
	cuerpo, err := CuerpoPorOficio(dominio.OficioPintura)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cuerpo, "prompts.1") || !strings.Contains(cuerpo, "pintura") {
		t.Fatalf("contenido inesperado: %.80q…", cuerpo)
	}
}

func TestCuerpoPorOficioInvalido(t *testing.T) {
	if _, err := CuerpoPorOficio(dominio.Oficio("paisajismo")); err == nil {
		t.Fatal("esperaba error")
	}
}
