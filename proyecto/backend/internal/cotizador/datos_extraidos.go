package cotizador

import (
	"fmt"
	"strings"

	"videocotizacion/backend/internal/dominio"
)

// MapaDatosExtraidos traduce la salida validada del LLM al objeto DatosExtraidos
// del contrato (R42/R48). Sin montos ni campos sobre personas.
func MapaDatosExtraidos(s SalidaLLM) (map[string]any, error) {
	of, ok := OficioDesdeSalidaLLM(s.Oficio)
	if !ok {
		return nil, fmt.Errorf("oficio inválido")
	}
	zona, ok := localidadAZona(s.Zona.Localidad)
	if !ok {
		return nil, fmt.Errorf("localidad inválida")
	}
	fuera := s.Zona.FueraDeZona || zona == dominio.ZonaOtra
	out := map[string]any{
		"oficio":                string(of),
		"zona":                  string(zona),
		"fuera_de_zona":         fuera,
		"faltantes":             copiarStrings(s.Faltantes),
		"corregido_por_cliente": false,
	}
	if s.Trabajo.Tipo != "" {
		out["tarea"] = s.Trabajo.Tipo
	}
	if sup := superficieM2Centesimas(s); sup > 0 {
		out["superficie_centesimas_m2"] = sup
	}
	if s.EstadoSuperficie != "" && s.EstadoSuperficie != "sin_definir" {
		out["estado_superficie"] = s.EstadoSuperficie
	}
	if s.Urgencia.Nivel != "" && s.Urgencia.Nivel != "sin_definir" {
		out["urgencia"] = s.Urgencia.Nivel
	}
	if s.Plazo.Tipo != "" && s.Plazo.Tipo != "sin_definir" {
		out["plazo"] = s.Plazo.Tipo
	}
	if alt := alturaContrato(s); alt != "" {
		out["altura"] = alt
	}
	if ie := interiorExteriorDesdeTrabajo(s.Trabajo.Tipo); ie != "" {
		out["interior_exterior"] = ie
	}
	return out, nil
}

func localidadAZona(loc string) (dominio.Zona, bool) {
	switch loc {
	case "mar_chiquita":
		return dominio.ZonaMarChiquita, true
	case "cobo":
		return dominio.ZonaCobo, true
	case "santa_clara_del_mar":
		return dominio.ZonaSantaClara, true
	case "parque_lago":
		return dominio.ZonaParqueLago, true
	case "otra", "mar_del_plata":
		return dominio.ZonaOtra, true
	default:
		return "", false
	}
}

func superficieM2Centesimas(s SalidaLLM) int64 {
	var sum int64
	for _, m := range s.Medidas {
		if m.Unidad != "m2" {
			continue
		}
		c, err := CentesimasDesdeDecimal(string(m.Cantidad))
		if err != nil || c <= 0 {
			continue
		}
		sum += c
	}
	return sum
}

func alturaContrato(s SalidaLLM) string {
	if s.Altura.MetrosMax == nil {
		return ""
	}
	cm, err := CentesimasDesdeDecimal(string(*s.Altura.MetrosMax))
	if err != nil {
		return ""
	}
	switch {
	case cm <= 0:
		return ""
	case cm <= 250:
		return "planta_baja"
	case cm <= 300:
		return "hasta_3m"
	case cm <= 600:
		return "entre_3_y_6m"
	default:
		return "mas_de_6m"
	}
}

func interiorExteriorDesdeTrabajo(tipo string) string {
	switch {
	case strings.Contains(tipo, "interior") && strings.Contains(tipo, "exterior"):
		return "ambos"
	case strings.Contains(tipo, "interior"):
		return "interior"
	case strings.Contains(tipo, "exterior"), strings.Contains(tipo, "fachada"):
		return "exterior"
	default:
		return ""
	}
}

func copiarStrings(in []string) []any {
	if len(in) == 0 {
		return []any{}
	}
	out := make([]any, len(in))
	for i, v := range in {
		out[i] = v
	}
	return out
}
