package cotizador

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// Los enums que valida Go tienen que ser exactamente los del esquema 1.0 que
// recibe Gemini (responseJsonSchema): si el esquema suma un valor y Go no, el
// modelo lo usa y el turno termina en salida_invalida (hallado con T17).
func TestEnumsIgualesAlEsquema(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "esquema-salida-llm.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	var esq map[string]any
	if err := json.Unmarshal(raw, &esq); err != nil {
		t.Fatal(err)
	}
	casos := map[string]map[string]bool{
		"oficio":                  enumOficio,
		"trabajo/tipo":            enumTrabajo,
		"trabajo/complejidad":     enumComplej,
		"medidas/items/origen":    enumOrigen,
		"medidas/items/unidad":    unidadesLLM,
		"altura/requiere_andamio": enumAndamio,
		"altura/medio":            enumMedio,
		"estado_superficie":       enumEstado,
		"zona/localidad":          enumLocalidad,
		"urgencia/nivel":          enumUrgencia,
		"tipo_cliente":            enumCliente,
		"plazo/tipo":              enumPlazo,
		"faltantes/items":         enumFaltante,
		"siguiente_paso/accion":   enumAccion,
	}
	for ruta, enGo := range casos {
		nodo := any(esq)
		for _, p := range strings.Split(ruta, "/") {
			m, _ := nodo.(map[string]any)
			if props, ok := m["properties"].(map[string]any); ok && props[p] != nil {
				nodo = props[p]
			} else {
				nodo = m[p]
			}
		}
		m, _ := nodo.(map[string]any)
		lista, _ := m["enum"].([]any)
		if len(lista) == 0 {
			t.Errorf("%s: el esquema no tiene enum", ruta)
			continue
		}
		var esquema, golang []string
		for _, v := range lista {
			esquema = append(esquema, v.(string))
		}
		for v := range enGo {
			golang = append(golang, v)
		}
		slices.Sort(esquema)
		slices.Sort(golang)
		if !slices.Equal(esquema, golang) {
			t.Errorf("%s: esquema %v, Go %v", ruta, esquema, golang)
		}
	}
}
