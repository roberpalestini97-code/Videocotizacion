package prompts

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"videocotizacion/backend/internal/dominio"
)

// CuerpoPorOficio lee conductas/prompts/{oficio}.md desde rutas habituales
// (repo local o cwd del binario), igual que el tarifario en arranque.
func CuerpoPorOficio(o dominio.Oficio) (string, error) {
	if !o.Valido() {
		return "", fmt.Errorf("prompts: oficio inválido %q", o)
	}
	return cuerpoMarkdown(string(o))
}

func cuerpoMarkdown(slug string) (string, error) {
	nombre := slug + ".md"
	for _, raiz := range []string{"conductas", "../conductas", "../../conductas", "../../../conductas"} {
		p := filepath.Join(raiz, "prompts", nombre)
		b, err := os.ReadFile(p)
		if err == nil {
			// Fin de línea normalizado a LF: el LLM recibe el mismo texto en
			// Windows (checkout CRLF) y en Linux.
			return strings.ReplaceAll(string(b), "\r\n", "\n"), nil
		}
	}
	return "", fmt.Errorf("prompts: no encontré %s en conductas/prompts", nombre)
}
