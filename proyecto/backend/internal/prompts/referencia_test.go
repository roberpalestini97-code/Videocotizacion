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
		{dominio.OficioPintura, "conducta_pintura@5f2e70a1bb1a"},
		{dominio.OficioJardineria, "conducta_jardineria@3f9fbb3beea7"},
		{dominio.OficioLimpieza, "conducta_limpieza@36694d88643d"},
		{dominio.OficioMantenimiento, "conducta_mantenimiento@79b1b1006e65"},
		{dominio.OficioReparaciones, "conducta_reparaciones@741ac13899b3"},
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
	const want = "conducta_paisajismo@0e78ce0e816c"
	ref, err := referenciaPorSlug("paisajismo")
	if err != nil {
		t.Fatal(err)
	}
	if ref != want {
		t.Fatalf("paisajismo hash cambió: got %q want %q", ref, want)
	}
}


// TestReferenciaNoDependeDelFinDeLinea: un checkout de Windows (CRLF) daba
// otros hashes que Linux (LF). La referencia debe ser la misma.
func TestReferenciaNoDependeDelFinDeLinea(t *testing.T) {
	for _, slug := range []string{"pintura", "jardineria", "limpieza", "mantenimiento", "reparaciones", "paisajismo"} {
		cuerpo, err := cuerpoMarkdown(slug)
		if err != nil {
			t.Fatal(err)
		}
		lf := strings.ReplaceAll(cuerpo, "\r\n", "\n")
		crlf := strings.ReplaceAll(lf, "\n", "\r\n")
		if lf == crlf {
			t.Fatalf("%s: el markdown no tiene saltos de línea; la prueba no prueba nada", slug)
		}
		refLF, refCRLF := referenciaDeCuerpo(slug, lf), referenciaDeCuerpo(slug, crlf)
		if refLF != refCRLF {
			t.Fatalf("%s: el hash depende del fin de línea: LF %q, CRLF %q", slug, refLF, refCRLF)
		}
	}
}
