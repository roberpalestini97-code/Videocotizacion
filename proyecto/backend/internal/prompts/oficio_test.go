package prompts

import (
	"testing"

	"videocotizacion/backend/internal/dominio"
)

func TestOficioDelTurnoAvatarPintora(t *testing.T) {
	of := OficioDelTurno("av_pintora", []dominio.Oficio{dominio.OficioJardineria, dominio.OficioPintura})
	if of != dominio.OficioPintura {
		t.Fatalf("got %q", of)
	}
}

func TestOficioDelTurnoSinAvatarUnicoOficio(t *testing.T) {
	of := OficioDelTurno("", []dominio.Oficio{dominio.OficioReparaciones})
	if of != dominio.OficioReparaciones {
		t.Fatalf("got %q", of)
	}
}

func TestOficioDelTurnoAvatarGenericoPrimerOficio(t *testing.T) {
	of := OficioDelTurno("av_obrero_casco", []dominio.Oficio{dominio.OficioLimpieza, dominio.OficioMantenimiento})
	if of != dominio.OficioLimpieza {
		t.Fatalf("got %q", of)
	}
}
