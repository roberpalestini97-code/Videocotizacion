package enlace_test

import (
	"context"
	"strings"
	"testing"

	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/enlace"
	"videocotizacion/backend/internal/proveedores/navegador"
)

func TestEnlaceWaMe(t *testing.T) {
	m := enlace.Mensajeria{}
	got, err := m.EnlaceDerivacion(context.Background(), "+5492235550101", "Hola, quiero seguir con mi videocotización VC-6X0B-5RD4NC")
	if err != nil {
		t.Fatal(err)
	}
	want := "https://wa.me/5492235550101?text=Hola%2C%20quiero%20seguir%20con%20mi%20videocotizaci%C3%B3n%20VC-6X0B-5RD4NC"
	if got != want {
		t.Fatalf("enlace:\n%s\n%s", got, want)
	}
	for _, tel := range []string{"", "5492235550101", "+54 9 223", "+12", "+54922355501019999"} {
		if _, err := m.EnlaceDerivacion(context.Background(), tel, "hola"); !errores.Es(err, errores.ValidacionFallida) {
			t.Errorf("tel %q: %v", tel, err)
		}
	}
	for _, txt := range []string{"", strings.Repeat("a", enlace.MaxTexto+1), "a<b", "a\nb"} {
		if _, err := m.EnlaceDerivacion(context.Background(), "+5492235550101", txt); !errores.Es(err, errores.ValidacionFallida) {
			t.Errorf("texto %q: %v", txt, err)
		}
	}
	if _, isFalso := any(m).(proveedores.Falso); isFalso {
		t.Fatal("enlace no es un falso")
	}
}

func TestNavegadorNoProcesaVoz(t *testing.T) {
	if _, err := (navegador.Transcriptor{}).Transcribir(context.Background(), proveedores.Audio{}); !errores.Es(err, errores.ProveedorNoDisponible) {
		t.Fatalf("stt: %v", err)
	}
	if _, err := (navegador.Sintetizador{}).Sintetizar(context.Background(), "hola"); !errores.Es(err, errores.ProveedorNoDisponible) {
		t.Fatalf("tts: %v", err)
	}
	var v proveedores.VozEnCliente = navegador.Sintetizador{}
	if !v.VozEnCliente() {
		t.Fatal("VozEnCliente")
	}
}
