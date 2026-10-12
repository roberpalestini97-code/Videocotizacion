package gemini

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// EsquemaDesdeJSONSchema deriva el responseJsonSchema de generateContent
// desde conductas/esquema-salida-llm.schema.json.
//
// Gemini 3 acepta JSON Schema en responseJsonSchema (tipos en minúscula) y
// rechaza el responseSchema OpenAPI con HTTP 400. Se conservan: type, enum
// (const se pasa a enum de un valor), description, properties, required,
// additionalProperties, items, minItems, maxItems, minimum, maximum y
// propertyOrdering (requeridos primero). Una unión ["x","null"] pasa a
// anyOf. Se DESCARTAN, porque este dialecto no los aplica: not/pattern,
// if/then, uniqueItems, exclusiveMinimum, minLength/maxLength, default,
// $schema, $id y title. Todo eso lo vuelve a exigir Go con
// cotizador.ValidarSalidaLLM.
func EsquemaDesdeJSONSchema(raw []byte) (map[string]any, error) {
	var nodo map[string]any
	if err := json.Unmarshal(raw, &nodo); err != nil {
		return nil, fmt.Errorf("gemini: esquema JSON inválido: %w", err)
	}
	out, err := convertir(nodo, "")
	if err != nil {
		return nil, err
	}
	if out["type"] != "object" {
		return nil, errors.New("gemini: la raíz del esquema tiene que ser un objeto")
	}
	// El esquema completo, con todos los enums, lo rechaza gemini-3.5-flash-lite
	// (HTTP 400). tipo_cliente no cambia el precio: el enum pasa a la
	// descripción y Go lo vuelve a exigir en ValidarSalidaLLM.
	if err := aliviarEnumTipoCliente(out); err != nil {
		return nil, err
	}
	return out, nil
}

func aliviarEnumTipoCliente(out map[string]any) error {
	props, _ := out["properties"].(map[string]any)
	tc, _ := props["tipo_cliente"].(map[string]any)
	vals, _ := tc["enum"].([]string)
	if len(vals) == 0 {
		return errors.New("gemini: tipo_cliente sin enum")
	}
	desc, _ := tc["description"].(string)
	if desc != "" && !strings.HasSuffix(desc, " ") {
		desc += " "
	}
	desc += "Uno de: " + strings.Join(vals, ", ") + "."
	props["tipo_cliente"] = map[string]any{"type": "string", "description": desc}
	return nil
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
	if ap, ok := n["additionalProperties"].(bool); ok {
		out["additionalProperties"] = ap
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
	out["type"] = tipo
	if nulo {
		desc, tiene := out["description"]
		delete(out, "description")
		env := map[string]any{"anyOf": []any{out, map[string]any{"type": "null"}}}
		if tiene {
			env["description"] = desc
		}
		return env, nil
	}
	return out, nil
}

func tipoDe(n map[string]any, ruta string) (string, bool, error) {
	switch t := n["type"].(type) {
	case string:
		return strings.ToLower(t), false, nil
	case []any:
		var tipo string
		nulo := false
		for _, v := range t {
			s, _ := v.(string)
			switch {
			case s == "null":
				nulo = true
			case tipo == "":
				tipo = strings.ToLower(s)
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
			return "string", false, nil
		}
		if _, ok := n["const"]; ok {
			return "string", false, nil
		}
		if _, ok := n["properties"]; ok {
			return "object", false, nil
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
