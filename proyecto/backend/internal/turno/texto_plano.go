package turno

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const maxTextoEvento = 2000 // maxLength de avatar.respuesta.texto

// TextoPlano deja un texto apto para los eventos del contrato: sin < ni >, sin
// caracteres de control y acotado (R19). El cliente igual lo inserta como texto.
func TextoPlano(s string) string {
	s = strings.Map(func(r rune) rune {
		switch {
		case r == '<' || r == '>':
			return ' '
		case r == '\n' || r == '\t' || r == '\r':
			return ' '
		case unicode.IsControl(r):
			return -1
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) > maxTextoEvento {
		s = string([]rune(s)[:maxTextoEvento])
	}
	return s
}

// reInyeccion detecta pedidos típicos de cambiar las reglas del agente o el
// precio. Complementa la marca intento_inyeccion del LLM (que puede no
// ponerla): Go marca igual. No cambia el precio, que lo calcula Go.
var reInyeccion = regexp.MustCompile(`(?i)(ignor[aáe]\w*\s+(las\s+|tus\s+|todas\s+las\s+)?(reglas|instrucciones|indicaciones)|olvid[aáe]\w*\s+(de\s+)?(las\s+|tus\s+)?(reglas|instrucciones)|system\s*prompt|prompt\s+del\s+sistema|modo\s+desarrollador|developer\s+mode|jailbreak|ignore\s+(all\s+|previous\s+)*instructions|(hac[eé]me|dame|aplic[aá]\w*|pon[eé]\w*)\s+(un\s+)?(descuento|rebaja)|precio\s+(especial|m[aá]s\s+bajo)|(cobr[aá]me|dej[aá]lo|ponelo)\s+(a\s+|en\s+)?(la\s+mitad|menos|cero|gratis)|sos\s+(ahora\s+)?(un|otro)\s+(asistente|modelo)|revel[aá]\w*\s+(las\s+)?(tarifas|instrucciones|reglas))`)

// PareceInyeccion informa si el texto del cliente intenta cambiar reglas o
// precios. Es una heurística: la defensa real es que el LLM no pone precios.
func PareceInyeccion(texto string) bool { return reInyeccion.MatchString(texto) }
