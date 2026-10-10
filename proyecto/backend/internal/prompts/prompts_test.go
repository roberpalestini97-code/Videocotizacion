package prompts

import (
	"testing"

	"videocotizacion/backend/internal/dominio"
)

func TestVersionPromptOficiosConductas(t *testing.T) {
	for _, o := range dominio.Oficios {
		if got := VersionPrompt(o); got != VersionActual {
			t.Fatalf("%s: esperaba %q, got %q", o, VersionActual, got)
		}
	}
}
