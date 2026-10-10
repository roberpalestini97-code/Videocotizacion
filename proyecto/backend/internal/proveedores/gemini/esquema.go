package gemini

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// EsquemaDesdeJSONSchema deriva el responseSchema de generateContent (subconjunto
// OpenAPI 3.0 de Gemini) desde conductas/esquema-salida-llm.schema.json.
//
// Se conservan: type (en mayúsculas), nullable (desde ["x","null"]), enum
// (const se pasa a enum de un valor), description, properties, required,
// items, minItems, maxItems, minimum, maximum y propertyOrdering (requeridos
// primero, en el orden del esquema). Se DESCARTAN, porque el subconjunto de
// Gemini no los garantiza: additionalProperties, not/pattern, if/then,
// uniqueItems, exclusiveMinimum, minLength/maxLength, default, $schema, $id y
// title. Todo eso lo vuelve a exigir Go con cotizador.ValidarSalidaLLM.
func EsquemaDesdeJSONSchema(raw []byte) (map[string]any, error) {
	var nodo map[string]any
	if err := json.Unmarshal(raw, &nodo); err != nil {
		return nil, fmt.Errorf("gemini: esquema JSON inválido: %w", err)
	}
	out, err := convertir(nodo, "")
	if err != nil {
		return nil, err
	}
	if out["type"] != "OBJECT" {
		return nil, errors.New("gemini: la raíz del esquema tiene que ser un objeto")
	}
	return out, nil
}

func convertir(n map[string]any, ruta string) (map[string]any, error) {
	out := map[string]any{}
	if d, ok := n["description"].(string); ok && d != "" {
		out["description"] = d
	}
	tipo, nulo, err := tipoDe(n, ruta)
	if err != nil {
		return nil, err
	}
	out["type"] = tipo
	if nulo {
		out["nullable"] = true
	}
	if c, ok := n["const"]; ok {
		s, ok := c.(string)
		if !ok {
			return nil, fmt.Errorf("gemini: %s: const no textual", rutaO(ruta))
		}
		out["enum"] = []string{s}
	}
	if e, ok := n["enum"].([]any); ok {
		vals := make([]string, 0, len(e))
		for _, v := range e {
			s, ok := v.(string)
			if !ok {
				return nil, fmt.Errorf("gemini: %s: enum no textual", rutaO(ruta))
			}
			vals = append(vals, s)
		}
		out["enum"] = vals
	}
	for _, k := range []string{"minItems", "maxItems", "minimum", "maximum"} {
		if v, ok := n[k]; ok {
			out[k] = v
		}
	}
	if it, ok := n["items"].(map[string]any); ok {
		sub, err := convertir(it, ruta+"[]")
		if err != nil {
			return nil, err
		}
		out["items"] = sub
	}
	if props, ok := n["properties"].(map[string]any); ok {
		conv := make(map[string]any, len(props))
		for nombre, v := range props {
			m, ok := v.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("gemini: %s.%s no es un esquema", rutaO(ruta), nombre)
			}
			sub, err := convertir(m, ruta+"."+nombre)
			if err != nil {
				return nil, err
			}
			conv[nombre] = sub
		}
		out["properties"] = conv
		var req []string
		if r, ok := n["required"].([]any); ok {
			for _, v := range r {
				if s, ok := v.(string); ok {
					req = append(req, s)
				}
			}
		}
		if len(req) > 0 {
			out["required"] = req
		}
		out["propertyOrdering"] = ordenPropiedades(props, req)
	}
	return out, nil
}

func tipoDe(n map[string]any, ruta string) (string, bool, error) {
	switch t := n["type"].(type) {
	case string:
		return strings.ToUpper(t), false, nil
	case []any:
		var tipo string
		nulo := false
		for _, v := range t {
			s, _ := v.(string)
			switch {
			case s == "null":
				nulo = true
			case tipo == "":
				tipo = strings.ToUpper(s)
			default:
				return "", false, fmt.Errorf("gemini: %s: unión de tipos no soportada", rutaO(ruta))
			}
		}
		if tipo == "" {
			return "", false, fmt.Errorf("gemini: %s: tipo vacío", rutaO(ruta))
		}
		return tipo, nulo, nil
	case nil:
		// enum/const sin type: en este esquema siempre son textos.
		if _, ok := n["enum"]; ok {
			return "STRING", false, nil
		}
		if _, ok := n["const"]; ok {
			return "STRING", false, nil
		}
		if _, ok := n["properties"]; ok {
			return "OBJECT", false, nil
		}
	}
	return "", false, fmt.Errorf("gemini: %s: sin tipo", rutaO(ruta))
}

func ordenPropiedades(props map[string]any, req []string) []string {
	orden := append([]string(nil), req...)
	vistos := map[string]bool{}
	for _, r := range req {
		vistos[r] = true
	}
	var resto []string
	for k := range props {
		if !vistos[k] {
			resto = append(resto, k)
		}
	}
	sort.Strings(resto)
	return append(orden, resto...)
}

func rutaO(r string) string {
	if r == "" {
		return "raíz"
	}
	return r
}
