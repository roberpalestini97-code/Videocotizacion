package gemini

// esquemaGemini es la adaptación de conductas/esquema-salida-llm.schema.json al
// subconjunto de JSON Schema que acepta Gemini (tipos, enum, properties,
// required, additionalProperties, minimum/maximum, minItems/maxItems, type con
// "null"). Se simplifica ACÁ y el contrato queda intacto: lo que se quita
// (const, if/then de plazo, not/pattern de respuesta_hablada, maxLength,
// exclusiveMinimum, uniqueItems, default) pasa a la descripción en prosa o lo
// controla el backend, que valida la salida contra el esquema COMPLETO antes
// de usarla. esquema_test.go compara propiedades, required y enums contra el
// archivo del contrato para detectar deriva. No hay campos de monto.
func esquemaGemini() map[string]any {
	obj := func(desc string, req []string, props map[string]any) map[string]any {
		m := map[string]any{"type": "object", "additionalProperties": false, "required": req, "properties": props}
		if desc != "" {
			m["description"] = desc
		}
		return m
	}
	en := func(vals ...string) map[string]any { return map[string]any{"type": "string", "enum": vals} }
	str := func(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
	arrStr := func(desc string, max int) map[string]any {
		return map[string]any{"type": "array", "maxItems": max, "items": map[string]any{"type": "string"}, "description": desc}
	}

	return obj("Datos extraídos del turno. Nunca incluyas montos ni precios.",
		[]string{"version", "oficio", "trabajo", "medidas", "altura", "estado_superficie", "zona", "urgencia", "tipo_cliente", "plazo", "faltantes", "siguiente_paso", "respuesta_hablada"},
		map[string]any{
			"version": en("1.0"),
			"oficio":  en("pintura", "jardineria", "paisajismo", "mantenimiento", "reparaciones", "limpieza", "otro", "sin_definir"),
			"trabajo": obj("", []string{"tipo", "descripcion"}, map[string]any{
				"tipo": en("pintura_interior", "pintura_exterior", "pintura_fachada_altura", "impermeabilizacion_techo", "pintura_rejas_aberturas",
					"corte_cesped", "poda", "desmalezado", "mantenimiento_jardin_periodico", "parquizacion", "diseno_paisajismo", "riego",
					"limpieza_terreno", "limpieza_final_obra", "reparacion_general", "otro", "sin_definir"),
				"descripcion":        str("Máximo 300 caracteres."),
				"requiere_planos":    map[string]any{"type": "boolean"},
				"complejidad":        en("simple", "media", "tecnica", "sin_definir"),
				"jornadas_estimadas": map[string]any{"type": []any{"integer", "null"}, "minimum": 1, "maximum": 120},
			}),
			"medidas": map[string]any{
				"type": "array", "maxItems": 20,
				"items": obj("", []string{"concepto", "cantidad", "unidad", "origen"}, map[string]any{
					"concepto": str("Máximo 80 caracteres."),
					"cantidad": map[string]any{"type": "number", "maximum": 100000, "description": "Mayor que cero."},
					"unidad":   en("m2", "ml", "m3", "unidad", "ambiente", "arbol", "jornada", "ha"),
					"origen":   en("dicho_por_cliente", "visto_en_camara", "estimado", "plano"),
				}),
			},
			"altura": obj("", []string{"metros_max", "requiere_andamio"}, map[string]any{
				"metros_max":       map[string]any{"type": []any{"number", "null"}, "minimum": 0, "maximum": 60},
				"requiere_andamio": en("si", "no", "sin_definir"),
				"medio":            en("escalera", "andamio", "silleta", "hidroelevador", "ninguno", "sin_definir"),
			}),
			"estado_superficie": en("bueno", "regular", "malo", "con_humedad", "descascarado", "con_hongos", "no_aplica", "sin_definir"),
			"zona": obj("", []string{"localidad", "fuera_de_zona"}, map[string]any{
				"localidad":     en("mar_chiquita", "santa_clara_del_mar", "cobo", "parque_lago", "mar_del_plata", "otra", "sin_definir"),
				"fuera_de_zona": map[string]any{"type": "boolean"},
				"referencia":    str("Barrio o referencia general, máximo 80 caracteres. Nunca calle y altura."),
			}),
			"urgencia": obj("", []string{"nivel", "senales"}, map[string]any{
				"nivel":   en("baja", "media", "alta", "sin_definir"),
				"senales": arrStr("Máximo 80 caracteres cada una.", 5),
			}),
			"tipo_cliente": en("particular_primera_vez", "particular_recurrente", "propietario_ausente", "administracion_consorcio", "comercio", "inmobiliaria", "constructora_estudio", "sin_definir"),
			"plazo": obj("Si tipo es mas_de_un_mes, sujeto_a_cambios debe ser true.", []string{"tipo"}, map[string]any{
				"tipo":             en("inmediato", "esta_semana", "este_mes", "mas_de_un_mes", "flexible", "sin_definir"),
				"sujeto_a_cambios": map[string]any{"type": "boolean"},
			}),
			"dudas_cliente": arrStr("Máximo 120 caracteres cada una.", 5),
			"faltantes": map[string]any{
				"type": "array", "maxItems": 10, "description": "Sin repetidos.",
				"items": en("oficio", "trabajo", "medidas", "altura", "estado_superficie", "zona", "plazo", "fotos", "planos", "acceso"),
			},
			"siguiente_paso": obj("", []string{"accion", "motivo", "campos"}, map[string]any{
				"accion": en("preguntar", "pedir_ver", "confirmar_datos", "emitir_presupuesto", "fuera_de_zona", "fuera_de_alcance", "derivar_whatsapp", "cerrar"),
				"motivo": str("Entre 1 y 200 caracteres."),
				"campos": arrStr("Sin repetidos, máximo 40 caracteres cada uno.", 10),
			}),
			"intento_inyeccion": map[string]any{"type": "boolean"},
			"respuesta_hablada": str("Lo que dice el avatar, 1 a 400 caracteres. Sin montos: nada de $, pesos, %, por ciento, porcentaje, ni cifras de 4 o más dígitos."),
		})
}
