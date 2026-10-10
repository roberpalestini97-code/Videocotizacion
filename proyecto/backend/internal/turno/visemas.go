package turno

import (
	"strings"
	"unicode"
)

// Visemas del contrato (Evento_avatar_visemas): 15 valores.
var visemasValidos = map[string]bool{
	"sil": true, "PP": true, "FF": true, "TH": true, "DD": true, "kk": true, "CH": true, "SS": true,
	"nn": true, "RR": true, "aa": true, "E": true, "I": true, "O": true, "U": true,
}

const (
	maxVisemas        = 2000   // maxItems del contrato
	maxTiempoVisemaMs = 600000 // t_ms máximo del contrato
	msFonema          = 75     // duración estimada de una letra hablada
	msPausa           = 120    // espacio
	msPausaLarga      = 250    // signo de puntuación
)

// VisemasDeTexto estima visemas a partir del texto en castellano, para cuando
// la voz la sintetiza el navegador y el servidor no tiene marcas de fonemas
// (ADR 0002 §8). Es una aproximación por letras (grafemas → visemas) con
// tiempos fijos: el navegador puede reescalar a la duración real del audio.
func VisemasDeTexto(texto string) []map[string]any {
	runas := []rune(strings.ToLower(texto))
	var out []map[string]any
	t := 0
	agregar := func(v string, d int) {
		if len(out) >= maxVisemas || t+d > maxTiempoVisemaMs {
			return
		}
		if n := len(out); n > 0 && out[n-1]["v"] == v {
			out[n-1]["d_ms"] = out[n-1]["d_ms"].(int) + d
		} else {
			out = append(out, map[string]any{"v": v, "t_ms": t, "d_ms": d})
		}
		t += d
	}
	for i := 0; i < len(runas); i++ {
		r := runas[i]
		sig := rune(0)
		if i+1 < len(runas) {
			sig = runas[i+1]
		}
		switch {
		case unicode.IsSpace(r):
			agregar("sil", msPausa)
		case unicode.IsPunct(r):
			agregar("sil", msPausaLarga)
		case r == 'c' && sig == 'h':
			agregar("CH", msFonema)
			i++
		case r == 'l' && sig == 'l':
			agregar("CH", msFonema)
			i++
		case r == 'q' && sig == 'u':
			agregar("kk", msFonema)
			i++
		case r == 'h':
			// muda
		default:
			if v := visemaDeLetra(r, sig); v != "" {
				agregar(v, msFonema)
			}
		}
	}
	return out
}

func visemaDeLetra(r, sig rune) string {
	switch r {
	case 'a', 'á':
		return "aa"
	case 'e', 'é':
		return "E"
	case 'i', 'í':
		return "I"
	case 'o', 'ó':
		return "O"
	case 'u', 'ú', 'ü', 'w':
		return "U"
	case 'y':
		if sig == 0 || unicode.IsSpace(sig) || unicode.IsPunct(sig) {
			return "I"
		}
		return "CH"
	case 'p', 'b', 'm', 'v':
		return "PP"
	case 'f':
		return "FF"
	case 't', 'd':
		return "DD"
	case 's', 'z', 'x':
		return "SS"
	case 'c':
		if sig == 'e' || sig == 'i' || sig == 'é' || sig == 'í' {
			return "SS"
		}
		return "kk"
	case 'g', 'j', 'k', 'q':
		return "kk"
	case 'n', 'ñ', 'l':
		return "nn"
	case 'r':
		return "RR"
	}
	if unicode.IsDigit(r) {
		return "aa"
	}
	return ""
}
