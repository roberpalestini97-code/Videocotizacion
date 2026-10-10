package prompts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"videocotizacion/backend/internal/dominio"
)

// TestSlugsMarkdownT06 asegura que cada conductas/prompts/*.md es dominio.Oficio
// o slug extra cableado en slugsPrompt (paisajismo), alineado con referencias-prompts.mjs.
func TestSlugsMarkdownT06(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "conductas", "prompts")
	ents, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var slugs []string
	for _, e := range ents {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		slugs = append(slugs, strings.TrimSuffix(e.Name(), ".md"))
	}
	if len(slugs) != 6 {
		t.Fatalf("esperaba 6 markdown T06, hay %d: %v", len(slugs), slugs)
	}
	for _, slug := range slugs {
		if dominio.Oficio(slug).Valido() {
			continue
		}
		if !slugsPrompt[slug] {
			t.Fatalf("slug %q no es Oficio.schema ni está en slugsPrompt", slug)
		}
	}
	for slug := range slugsPrompt {
		found := false
		for _, s := range slugs {
			if s == slug {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("slugsPrompt[%q] no tiene markdown en conductas/prompts", slug)
		}
	}
}
