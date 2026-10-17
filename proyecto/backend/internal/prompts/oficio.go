package prompts

import "videocotizacion/backend/internal/dominio"

// OficioDelTurno elige el oficio cuyo prompt cargar: prioriza el avatar
// elegido al crear la sesión (catálogo provisorio en rutas.avataresDe).
func OficioDelTurno(avatarID string, oficios []dominio.Oficio) dominio.Oficio {
	if o, ok := oficioDeAvatar(avatarID); ok && contieneOficio(oficios, o) {
		return o
	}
	if len(oficios) == 1 {
		return oficios[0]
	}
	for _, o := range oficios {
		if o.Valido() {
			return o
		}
	}
	return ""
}

func oficioDeAvatar(avatarID string) (dominio.Oficio, bool) {
	switch avatarID {
	case "av_pintora", "av_valid_laura":
		return dominio.OficioPintura, true
	case "av_jardinero", "av_valid_tito":
		return dominio.OficioJardineria, true
	case "av_valid_juan":
		return dominio.OficioMantenimiento, true
	default:
		return "", false
	}
}

func contieneOficio(oficios []dominio.Oficio, buscado dominio.Oficio) bool {
	for _, o := range oficios {
		if o == buscado {
			return true
		}
	}
	return false
}
