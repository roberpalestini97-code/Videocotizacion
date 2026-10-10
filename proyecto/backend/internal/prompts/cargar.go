package prompts

import (
	"fmt"
	"os"
	"path/filepath"

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
			return string(b), nil
		}
	}
	return "", fmt.Errorf("prompts: no encontré %s en conductas/prompts", nombre)
}
