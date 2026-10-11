package gemini

import (
	"encoding/json"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
)

const rutaContrato = "../../../../conductas/esquema-salida-llm.schema.json"

func conjunto(v any) []string {
	var out []string
	switch x := v.(type) {
	case []any:
		for _, e := range x {
			out = append(out, jsonStr(e))
		}
	case []string:
		out = append(out, x...)
	}
	sort.Strings(out)
	return out
}

func jsonStr(v any) string { b, _ := json.Marshal(v); return string(b) }

// compara el esquema adaptado contra el contrato: mismas propiedades, required,
// enums y tipos. Lo que el adaptador simplifica (const → enum de un valor, y
// las palabras clave que Gemini no soporta) queda fuera de la comparación.
func comparar(t *testing.T, ruta string, c, a map[string]any) {
	t.Helper()
	if v, ok := c["const"]; ok {
		if !reflect.DeepEqual(conjunto(a["enum"]), conjunto([]any{v})) {
			t.Errorf("%s: const %v no coincide con enum %v", ruta, v, a["enum"])
		}
		return
	}
	if e, ok := c["enum"]; ok && !reflect.DeepEqual(conjunto(e), conjunto(a["enum"])) {
		t.Errorf("%s: enum distinto\n contrato: %v\n adaptado: %v", ruta, e, a["enum"])
	}
	if ty, ok := c["type"]; ok && jsonStr(ty) != jsonStr(a["type"]) {
		t.Errorf("%s: type contrato=%v adaptado=%v", ruta, ty, a["type"])
	}
	if !reflect.DeepEqual(conjunto(c["required"]), conjunto(a["required"])) {
		t.Errorf("%s: required distinto: %v vs %v", ruta, c["required"], a["required"])
	}
	for _, k := range []string{"minimum", "maximum", "minItems", "maxItems"} {
		if cv, ok := c[k]; ok && jsonStr(cv) != jsonStr(a[k]) {
			t.Errorf("%s: %s contrato=%v adaptado=%v", ruta, k, cv, a[k])
		}
	}
	cp, _ := c["properties"].(map[string]any)
	ap, _ := a["properties"].(map[string]any)
	if len(cp) != len(ap) {
		t.Errorf("%s: propiedades distintas: contrato=%d adaptado=%d", ruta, len(cp), len(ap))
	}
	for k, v := range cp {
		av, ok := ap[k].(map[string]any)
		if !ok {
			t.Errorf("%s.%s: falta en el esquema adaptado", ruta, k)
			continue
		}
		comparar(t, ruta+"."+k, v.(map[string]any), av)
	}
	if ci, ok := c["items"].(map[string]any); ok {
		ai, _ := a["items"].(map[string]any)
		comparar(t, ruta+"[]", ci, ai)
	}
}

func TestEsquemaAdaptadoCoincideConElContrato(t *testing.T) {
	crudo, err := os.ReadFile(rutaContrato)
	if err != nil {
		t.Fatal(err)
	}
	var c map[string]any
	if err := json.Unmarshal(crudo, &c); err != nil {
		t.Fatal(err)
	}
	a := esquemaGemini()
	b, _ := json.Marshal(a) // también debe ser serializable
	_ = json.Unmarshal(b, &a)
	comparar(t, "$", c, a)
}

// Solo palabras clave del subconjunto documentado por Gemini.
func TestEsquemaUsaSoloPalabrasSoportadas(t *testing.T) {
	permitidas := map[string]bool{"type": true, "title": true, "description": true, "properties": true, "required": true,
		"additionalProperties": true, "enum": true, "items": true, "minItems": true, "maxItems": true, "minimum": true, "maximum": true}
	var recorrer func(ruta string, v any)
	recorrer = func(ruta string, v any) {
		m, ok := v.(map[string]any)
		if !ok {
			return
		}
		for k, x := range m {
			if k == "properties" { // nombres de campos, no palabras clave
				for pk, pv := range x.(map[string]any) {
					recorrer(ruta+"."+pk, pv)
				}
				continue
			}
			if !permitidas[k] {
				t.Errorf("%s: palabra clave no soportada %q", ruta, k)
			}
			recorrer(ruta+"."+k, x)
		}
	}
	b, _ := json.Marshal(esquemaGemini())
	var a map[string]any
	_ = json.Unmarshal(b, &a)
	recorrer("$", a)
	if s := string(b); strings.Contains(s, "precio") && !strings.Contains(s, "Nunca incluyas montos ni precios") {
		t.Error("el esquema no debe tener campos de monto")
	}
	if _, ok := a["properties"].(map[string]any)["precio"]; ok {
		t.Error("campo precio en el esquema")
	}
}
