package dominio

import "testing"

func TestOriginLoopbackSoloFueraDeProduccion(t *testing.T) {
	if originValido("http://localhost:5173") || originValido("http://127.0.0.1:8080") {
		t.Fatal("el loopback no vale con el valor por defecto")
	}
	if !originValido("https://cotizar.videocotizacion.local") {
		t.Fatal("el https público debería seguir valiendo")
	}
	t.Cleanup(func() { permitirOriginLoopback = false })
	PermitirOriginLoopback(true)
	if !originValido("http://localhost:5173") || !originValido("http://127.0.0.1:5173") {
		t.Fatal("con el permiso, el loopback vale")
	}
	if originValido("http://evil.test:5173") || originValido("https://localhost") {
		t.Fatal("el permiso no abre otros Origin")
	}
}
