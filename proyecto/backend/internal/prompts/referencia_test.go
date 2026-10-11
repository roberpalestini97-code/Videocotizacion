package prompts

import (
	"strings"
	"testing"

	"videocotizacion/backend/internal/dominio"
)

func TestReferenciaContratoAnclas(t *testing.T) {
	// Misma regla que contracts/fuente/prompts.mjs (sha256 del markdown, 12 hex).
	casos := []struct {
		oficio dominio.Oficio
		want   string
	}{
		{dominio.OficioPintura, "conducta_pintura@fdee14cbdaf7"},
		{dominio.OficioJardineria, "conducta_jardineria@de1c6081d09a"},
		{dominio.OficioLimpieza, "conducta_limpieza@9d7e87923bd4"},
		{dominio.OficioMantenimiento, "conducta_mantenimiento@cb79d8745105"},
		{dominio.OficioReparaciones, "conducta_reparaciones@cdb349e3a2e9"},
	}
	for _, c := range casos {
		ref, err := ReferenciaContrato(c.oficio)
		if err != nil {
			t.Fatal(err)
		}
		prefix := "conducta_" + string(c.oficio) + "@"
		if !strings.HasPrefix(ref, prefix) || len(ref) != len(prefix)+12 {
			t.Fatalf("%s formato: %q", c.oficio, ref)
		}
		if ref != c.want {
			t.Fatalf("%s hash cambió (¿editaste el prompt o desincronizaste T41?): got %q want %q", c.oficio, ref, c.want)
		}
	}
}

func TestReferenciaAnclaPaisajismoT06(t *testing.T) {
	// Misma regla que contracts/verificacion/referencias-prompts.mjs (6.º slug).
	const want = "conducta_paisajismo@5cc33b65b089"
	ref, err := referenciaPorSlug("paisajismo")
	if err != nil {
		t.Fatal(err)
	}
	if ref != want {
		t.Fatalf("paisajismo hash cambió: got %q want %q", ref, want)
	}
}

func TestHashCanonicoIndependienteDelFinDeLinea(t *testing.T) {
	lf := "versión: prompts.1\nlinea dos\n"
	crlf := "versión: prompts.1\r\nlinea dos\r\n"
	if hashCanonico(lf) != hashCanonico(crlf) {
		t.Fatalf("LF %s != CRLF %s", hashCanonico(lf), hashCanonico(crlf))
	}
	if hashCanonico(lf) == hashCanonico("versión: prompts.1\nlinea 2\n") {
		t.Fatal("contenido distinto debe dar hash distinto")
	}
}
