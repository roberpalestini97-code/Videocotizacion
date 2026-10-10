package prompts

import (
	"encoding/json"
	"fmt"

	"videocotizacion/backend/internal/dominio"
)

// slugsPrompt son markdown en conductas/prompts/ que no son dominio.Oficio
// pero sí oficio en esquema-salida-llm (T06).
var slugsPrompt = map[string]bool{
	"paisajismo": true,
}

// MaterialTurno elige cuerpo y referencia de prompt: prioriza el oficio de la
// última salida LLM cuando tiene prompt propio (p. ej. paisajismo); si no, el
// oficio de sesión del contrato.
func MaterialTurno(oficioSesion dominio.Oficio, ultimaSalidaLLM []byte) (cuerpo, ref string, err error) {
	slug := string(oficioSesion)
	if len(ultimaSalidaLLM) > 0 {
		var peek struct {
			Oficio string `json:"oficio"`
		}
		if json.Unmarshal(ultimaSalidaLLM, &peek) == nil && slugsPrompt[peek.Oficio] {
			slug = peek.Oficio
		}
	}
	if slugsPrompt[slug] {
		cuerpo, err = cuerpoMarkdown(slug)
		if err != nil {
			return "", "", err
		}
		ref, err = referenciaPorSlug(slug)
		return cuerpo, ref, err
	}
	if !oficioSesion.Valido() {
		return "", "", nil
	}
	cuerpo, err = CuerpoPorOficio(oficioSesion)
	if err != nil {
		return "", "", err
	}
	ref, err = ReferenciaContrato(oficioSesion)
	return cuerpo, ref, err
}

func referenciaPorSlug(slug string) (string, error) {
	if !slugsPrompt[slug] {
		return "", fmt.Errorf("prompts: slug desconocido %q", slug)
	}
	cuerpo, err := cuerpoMarkdown(slug)
	if err != nil {
		return "", err
	}
	return referenciaDeCuerpo(slug, cuerpo), nil
}
