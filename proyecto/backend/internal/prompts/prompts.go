// Package prompts fija las versiones de prompts y esquema que el orquestador
// (T25) pasa al extractor LLM, alineadas con conductas/prompts (T06).
package prompts

import "videocotizacion/backend/internal/dominio"

const (
	// VersionActual es la versión declarada en conductas/prompts/*.md (prompts.1).
	VersionActual = "prompts.1"
	// EsquemaSalidaLLM coincide con conductas/esquema-salida-llm.schema.json.
	EsquemaSalidaLLM = "1.0"
)

// VersionPrompt devuelve la etiqueta de versión del prompt para el oficio del asesor.
func VersionPrompt(o dominio.Oficio) string {
	if o.Valido() {
		return VersionActual
	}
	return VersionActual
}
