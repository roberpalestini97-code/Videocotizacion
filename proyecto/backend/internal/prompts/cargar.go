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
	for _, raiz := range raicesConductas {
		p := filepath.Join(raiz, "prompts", nombre)
		b, err := os.ReadFile(p)
		if err == nil {
			return string(b), nil
		}
	}
	return "", fmt.Errorf("prompts: no encontré %s en conductas/prompts", nombre)
}

// EsquemaSalidaJSON lee conductas/esquema-salida-llm.schema.json (versión
// EsquemaSalidaLLM) desde las mismas rutas que los prompts. El adaptador del
// LLM deriva de acá su esquema de salida estructurada.
func EsquemaSalidaJSON() ([]byte, error) {
	for _, raiz := range raicesConductas {
		b, err := os.ReadFile(filepath.Join(raiz, "esquema-salida-llm.schema.json"))
		if err == nil {
			return b, nil
		}
	}
	return nil, fmt.Errorf("prompts: no encontré conductas/esquema-salida-llm.schema.json")
}

// raicesConductas son las rutas relativas donde se busca conductas/ (cwd del
// binario, Docker o pruebas de paquetes a distinta profundidad).
var raicesConductas = []string{"conductas", "../conductas", "../../conductas", "../../../conductas", "../../../../conductas"}
