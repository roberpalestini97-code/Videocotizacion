package prompts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"videocotizacion/backend/internal/dominio"
)

func TestMaterialTurnoPaisajismoTrasSalidaLLM(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "05-paisajismo-tecnico-planos-largo-plazo.json"))
	if err != nil {
		t.Fatal(err)
	}
	cuerpo, ref, err := MaterialTurno(dominio.OficioJardineria, raw)
	if err != nil {
		t.Fatal(err)
	}
	if ref != "conducta_paisajismo@5cc33b65b089" {
		t.Fatalf("ref: %q", ref)
	}
	if cuerpo == "" || !strings.Contains(cuerpo, "paisajismo") || !strings.Contains(cuerpo, "prompts.1") {
		t.Fatalf("cuerpo inesperado: %.80q…", cuerpo)
	}
}

func TestMaterialTurnoJardineriaSinUltimaSalida(t *testing.T) {
	cuerpo, ref, err := MaterialTurno(dominio.OficioJardineria, nil)
	if err != nil {
		t.Fatal(err)
	}
	if ref != "conducta_jardineria@de1c6081d09a" || cuerpo == "" {
		t.Fatalf("ref=%q cuerpo vacío=%v", ref, cuerpo == "")
	}
}
