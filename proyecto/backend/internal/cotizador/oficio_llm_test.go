package cotizador

import (
	"testing"

	"videocotizacion/backend/internal/dominio"
)

func TestOficioDesdeSalidaLLM(t *testing.T) {
	o, ok := OficioDesdeSalidaLLM("paisajismo")
	if !ok || o != dominio.OficioJardineria {
		t.Fatalf("paisajismo: %q %v", o, ok)
	}
	o, ok = OficioDesdeSalidaLLM("pintura")
	if !ok || o != dominio.OficioPintura {
		t.Fatalf("pintura: %q %v", o, ok)
	}
	if _, ok = OficioDesdeSalidaLLM("otro"); ok {
		t.Fatal("otro debe fallar")
	}
}
