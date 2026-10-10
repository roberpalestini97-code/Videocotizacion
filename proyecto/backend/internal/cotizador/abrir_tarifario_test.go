package cotizador

import (
	"io"
	"log/slog"
	"testing"
)

func TestAbrirDesdeRutasHabitualesEncuentraTarifario(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	if c := AbrirDesdeRutasHabituales(log); c == nil {
		t.Fatal("esperaba tarifario (go test en internal/cotizador o cwd repo)")
	}
}
