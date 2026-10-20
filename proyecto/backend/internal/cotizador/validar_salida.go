package cotizador

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"unicode/utf8"

	"videocotizacion/backend/internal/errores"
)

// ErrMontoEnRespuesta marca una respuesta_hablada con montos, moneda o
// porcentajes (ADR 0002 §4). El resto de la salida puede ser válida: el
// orquestador descarta solo el texto y usa una plantilla.
var ErrMontoEnRespuesta = errors.New("respuesta_hablada con montos")

// reMontoHablado es el patrón "not" de respuesta_hablada en
// conductas/esquema-salida-llm.schema.json (RE2 admite \b y \s).
var reMontoHablado = regexp.MustCompile(`(\$|[Pp]esos|ARS|USD|[Dd][oó]lares|[Ll]ucas|\b[Mm]il(es|lones)?\b|\d[\d.,]{3,}|%|[Pp]or\s*ciento|[Pp]orcentaje)`)

// HabladaConMontos informa si un texto para el avatar menciona montos.
func HabladaConMontos(s string) bool { return reMontoHablado.MatchString(s) }

// ValidarSalidaLLM aplica TODO el esquema 1.0 en Go, sin confiar en el
// "modo JSON" del proveedor: decodificación estricta (un campo precio, monto o
// descuento hace fallar), requeridos, enums, largos, rangos, unicidad y la
// regla plazo→sujeto_a_cambios. Si lo único que falla es el filtro de montos
// de respuesta_hablada, devuelve la salida junto con ErrMontoEnRespuesta.
func ValidarSalidaLLM(raw []byte) (SalidaLLM, error) {
	s, err := DecodificarSalidaLLM(raw)
	if err != nil {
		return SalidaLLM{}, err
	}
	if err := requeridos(raw); err != nil {
		return SalidaLLM{}, invalidaLLM(err)
	}
	if err := s.validarCampos(); err != nil {
		return SalidaLLM{}, invalidaLLM(err)
	}
	if HabladaConMontos(s.RespuestaHablada) {
		return s, errores.Envolver(errores.ValidacionFallida, ErrMontoEnRespuesta)
	}
	return s, nil
}

func invalidaLLM(err error) error {
	return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("salida del LLM: %w", err))
}

var (
	enumOficio    = conjunto("pintura", "jardineria", "paisajismo", "mantenimiento", "reparaciones", "limpieza", "otro", "sin_definir")
	enumTrabajo   = conjunto("pintura_interior", "pintura_exterior", "pintura_fachada_altura", "impermeabilizacion_techo", "pintura_rejas_aberturas", "enduido_completo", "tratamiento_hongos", "hidrolavado", "corte_cesped", "poda", "desmalezado", "mantenimiento_jardin_periodico", "parquizacion", "diseno_paisajismo", "riego", "colocacion_cesped", "cercos_vivos", "limpieza_terreno", "limpieza_final_obra", "reparacion_general", "otro", "sin_definir")
	enumComplej   = conjunto("simple", "media", "tecnica", "sin_definir")
	enumOrigen    = conjunto("dicho_por_cliente", "visto_en_camara", "estimado", "plano")
	enumAndamio   = conjunto("si", "no", "sin_definir")
	enumMedio     = conjunto("escalera", "andamio", "silleta", "hidroelevador", "ninguno", "sin_definir")
	enumEstado    = conjunto("bueno", "regular", "malo", "con_humedad", "descascarado", "con_hongos", "con_salitre", "no_aplica", "sin_definir")
	enumLocalidad = conjunto("mar_chiquita", "santa_clara_del_mar", "cobo", "parque_lago", "mar_del_plata", "otra", "sin_definir")
	enumUrgencia  = conjunto("baja", "media", "alta", "sin_definir")
	enumCliente   = conjunto("particular_primera_vez", "particular_recurrente", "propietario_ausente", "administracion_consorcio", "comercio", "inmobiliaria", "constructora_estudio", "sin_definir")
	enumPlazo     = conjunto("inmediato", "esta_semana", "este_mes", "mas_de_un_mes", "flexible", "sin_definir")
	enumFaltante  = conjunto("oficio", "trabajo", "medidas", "altura", "estado_superficie", "zona", "plazo", "fotos", "planos", "acceso")
	enumAccion    = conjunto("preguntar", "pedir_ver", "confirmar_datos", "emitir_presupuesto", "fuera_de_zona", "fuera_de_alcance", "derivar_whatsapp", "cerrar")
)

func conjunto(vs ...string) map[string]bool {
	m := make(map[string]bool, len(vs))
	for _, v := range vs {
		m[v] = true
	}
	return m
}

func (s SalidaLLM) validarCampos() error {
	var errs []error
	enum := func(campo, v string, permitidos map[string]bool) {
		if !permitidos[v] {
			errs = append(errs, fmt.Errorf("%s fuera del enum", campo))
		}
	}
	largo := func(campo, v string, min, max int) {
		if n := utf8.RuneCountInString(v); n < min || n > max {
			errs = append(errs, fmt.Errorf("%s con largo fuera de %d..%d", campo, min, max))
		}
	}
	enum("/oficio", s.Oficio, enumOficio)
	enum("/trabajo/tipo", s.Trabajo.Tipo, enumTrabajo)
	largo("/trabajo/descripcion", s.Trabajo.Descripcion, 0, 300)
	if s.Trabajo.Complejidad != "" {
		enum("/trabajo/complejidad", s.Trabajo.Complejidad, enumComplej)
	}
	if j := s.Trabajo.JornadasEstimadas; len(j) > 0 && string(j) != "null" {
		var n int
		if json.Unmarshal(j, &n) != nil || n < 1 || n > 120 {
			errs = append(errs, errors.New("/trabajo/jornadas_estimadas fuera de 1..120"))
		}
	}
	if len(s.Medidas) > 20 {
		errs = append(errs, errors.New("/medidas con más de 20 ítems"))
	}
	for i, m := range s.Medidas {
		largo(fmt.Sprintf("/medidas/%d/concepto", i), m.Concepto, 0, 80)
		if !unidadesLLM[m.Unidad] {
			errs = append(errs, fmt.Errorf("/medidas/%d/unidad fuera del enum", i))
		}
		enum(fmt.Sprintf("/medidas/%d/origen", i), m.Origen, enumOrigen)
		c, err := CentesimasDesdeDecimal(string(m.Cantidad))
		if err != nil || c <= 0 || c > 100000*100 {
			errs = append(errs, fmt.Errorf("/medidas/%d/cantidad fuera de (0, 100000]", i))
		}
	}
	if s.Altura.MetrosMax != nil {
		c, err := CentesimasDesdeDecimal(string(*s.Altura.MetrosMax))
		if err != nil || c > 60*100 {
			errs = append(errs, errors.New("/altura/metros_max fuera de 0..60"))
		}
	}
	enum("/altura/requiere_andamio", s.Altura.RequiereAndamio, enumAndamio)
	if s.Altura.Medio != "" {
		enum("/altura/medio", s.Altura.Medio, enumMedio)
	}
	enum("/estado_superficie", s.EstadoSuperficie, enumEstado)
	enum("/zona/localidad", s.Zona.Localidad, enumLocalidad)
	largo("/zona/referencia", s.Zona.Referencia, 0, 80)
	enum("/urgencia/nivel", s.Urgencia.Nivel, enumUrgencia)
	if len(s.Urgencia.Senales) > 5 {
		errs = append(errs, errors.New("/urgencia/senales con más de 5 ítems"))
	}
	for i, v := range s.Urgencia.Senales {
		largo(fmt.Sprintf("/urgencia/senales/%d", i), v, 0, 80)
	}
	enum("/tipo_cliente", s.TipoCliente, enumCliente)
	enum("/plazo/tipo", s.Plazo.Tipo, enumPlazo)
	if s.Plazo.Tipo == "mas_de_un_mes" && (s.Plazo.SujetoACambios == nil || !*s.Plazo.SujetoACambios) {
		errs = append(errs, errors.New("/plazo/sujeto_a_cambios tiene que ser true con mas_de_un_mes"))
	}
	if len(s.DudasCliente) > 5 {
		errs = append(errs, errors.New("/dudas_cliente con más de 5 ítems"))
	}
	for i, v := range s.DudasCliente {
		largo(fmt.Sprintf("/dudas_cliente/%d", i), v, 0, 120)
	}
	if len(s.Faltantes) > 10 || !unicos(s.Faltantes) {
		errs = append(errs, errors.New("/faltantes con más de 10 ítems o repetidos"))
	}
	for i, v := range s.Faltantes {
		enum(fmt.Sprintf("/faltantes/%d", i), v, enumFaltante)
	}
	enum("/siguiente_paso/accion", s.SiguientePaso.Accion, enumAccion)
	largo("/siguiente_paso/motivo", s.SiguientePaso.Motivo, 1, 200)
	if len(s.SiguientePaso.Campos) > 10 || !unicos(s.SiguientePaso.Campos) {
		errs = append(errs, errors.New("/siguiente_paso/campos con más de 10 ítems o repetidos"))
	}
	for i, v := range s.SiguientePaso.Campos {
		largo(fmt.Sprintf("/siguiente_paso/campos/%d", i), v, 0, 40)
	}
	largo("/respuesta_hablada", s.RespuestaHablada, 1, 400)
	return errors.Join(errs...)
}

func unicos(vs []string) bool {
	vistos := make(map[string]bool, len(vs))
	for _, v := range vs {
		if vistos[v] {
			return false
		}
		vistos[v] = true
	}
	return true
}

// obligatorios por objeto, según "required" del esquema 1.0.
var obligatorios = map[string][]string{
	"":               {"version", "oficio", "trabajo", "medidas", "altura", "estado_superficie", "zona", "urgencia", "tipo_cliente", "plazo", "faltantes", "siguiente_paso", "respuesta_hablada"},
	"trabajo":        {"tipo", "descripcion"},
	"altura":         {"metros_max", "requiere_andamio"},
	"zona":           {"localidad", "fuera_de_zona"},
	"urgencia":       {"nivel", "senales"},
	"plazo":          {"tipo"},
	"siguiente_paso": {"accion", "motivo", "campos"},
}

// requeridos verifica presencia (y no null, salvo metros_max) de los campos
// obligatorios: la decodificación a struct no distingue ausente de vacío.
func requeridos(raw []byte) error {
	var raiz map[string]json.RawMessage
	if err := json.Unmarshal(raw, &raiz); err != nil {
		return err
	}
	var errs []error
	exigir := func(obj map[string]json.RawMessage, ruta string, claves []string) {
		for _, k := range claves {
			v, ok := obj[k]
			if !ok || (string(v) == "null" && !(ruta == "altura" && k == "metros_max")) {
				errs = append(errs, fmt.Errorf("/%s falta", joinRuta(ruta, k)))
			}
		}
	}
	exigir(raiz, "", obligatorios[""])
	for ruta, claves := range obligatorios {
		if ruta == "" {
			continue
		}
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(raiz[ruta], &obj); err != nil || obj == nil {
			errs = append(errs, fmt.Errorf("/%s no es un objeto", ruta))
			continue
		}
		exigir(obj, ruta, claves)
	}
	var medidas []map[string]json.RawMessage
	if err := json.Unmarshal(raiz["medidas"], &medidas); err != nil {
		errs = append(errs, errors.New("/medidas no es una lista de objetos"))
	}
	for i, m := range medidas {
		exigir(m, fmt.Sprintf("medidas/%d", i), []string{"concepto", "cantidad", "unidad", "origen"})
		// json.Number acepta "12" entre comillas: el esquema pide number.
		if c := m["cantidad"]; len(c) > 0 && c[0] == '"' {
			errs = append(errs, fmt.Errorf("/medidas/%d/cantidad no es número", i))
		}
	}
	var alt map[string]json.RawMessage
	if json.Unmarshal(raiz["altura"], &alt) == nil {
		if c := alt["metros_max"]; len(c) > 0 && c[0] == '"' {
			errs = append(errs, errors.New("/altura/metros_max no es número"))
		}
	}
	return errors.Join(errs...)
}

func joinRuta(ruta, k string) string {
	if ruta == "" {
		return k
	}
	return ruta + "/" + k
}
