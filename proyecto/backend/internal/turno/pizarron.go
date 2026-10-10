package turno

import (
	"strings"

	"videocotizacion/backend/internal/cotizador"
)

var etiquetaFaltante = map[string]string{
	"medidas":           "Medidas",
	"estado_superficie": "Estado de pared",
	"altura":            "Altura",
	"zona":              "Zona",
	"tipo_trabajo":      "Tipo de trabajo",
	"plazo":             "Plazo",
	"urgencia":          "Urgencia",
}

// pizarronDesdeSalida arma los campos anotados (sin montos, ADR 0006 §4)
// desde la salida validada, que acumula los datos de la sesión. version = turno.
func pizarronDesdeSalida(s cotizador.SalidaLLM, version int) Evento {
	campos := make([]map[string]any, 0, 8+len(s.Faltantes))
	anotar := func(clave, etiqueta, valor string) {
		if v := truncar200(TextoPlano(valor)); v != "" {
			campos = append(campos, campoPizarron(clave, etiqueta, v, "anotado"))
		}
	}
	if s.Oficio != "" && s.Oficio != "sin_definir" {
		anotar("oficio", "Oficio", tituloOficio(s.Oficio))
	}
	anotar("trabajo", "Trabajo", strings.TrimSpace(s.Trabajo.Descripcion))
	if len(s.Medidas) > 0 {
		partes := make([]string, 0, len(s.Medidas))
		for _, m := range s.Medidas {
			partes = append(partes, strings.TrimSpace(m.Concepto+" "+string(m.Cantidad)+" "+m.Unidad))
		}
		anotar("medidas", "Medidas", strings.Join(partes, "; "))
	}
	if s.Altura.MetrosMax != nil {
		anotar("altura", "Altura", "hasta "+string(*s.Altura.MetrosMax)+" m")
	}
	if v := s.EstadoSuperficie; v != "" && v != "sin_definir" && v != "no_aplica" {
		anotar("estado_superficie", "Estado de pared", strings.ReplaceAll(v, "_", " "))
	}
	if s.Zona.Localidad != "" && s.Zona.Localidad != "sin_definir" {
		anotar("localidad", "Localidad", strings.ReplaceAll(s.Zona.Localidad, "_", " "))
	}
	if v := s.Urgencia.Nivel; v != "" && v != "sin_definir" {
		anotar("urgencia", "Urgencia", v)
	}
	if v := s.Plazo.Tipo; v != "" && v != "sin_definir" {
		anotar("plazo", "Plazo", strings.ReplaceAll(v, "_", " "))
	}
	anotadas := map[string]bool{}
	for _, c := range campos {
		anotadas[c["clave"].(string)] = true
	}
	for _, f := range s.Faltantes {
		clave := strings.ToLower(strings.TrimSpace(f))
		if clave == "" || anotadas[clave] || len(campos) >= 40 {
			continue
		}
		etiq, ok := etiquetaFaltante[clave]
		if !ok {
			etiq = strings.ReplaceAll(clave, "_", " ")
		}
		campos = append(campos, campoPizarron(clave, etiq, "Falta", "faltante"))
	}
	if version < 1 {
		version = 1
	}
	return Evento{
		Tipo: "pizarron.actualizado",
		Datos: map[string]any{
			"version": version,
			"campos":  campos,
		},
	}
}

func campoPizarron(clave, etiqueta, valor, estado string) map[string]any {
	return map[string]any{
		"clave":    clave,
		"etiqueta": etiqueta,
		"valor":    valor,
		"estado":   estado,
	}
}

func tituloOficio(o string) string {
	switch o {
	case "pintura":
		return "Pintura"
	case "jardineria":
		return "Jardinería"
	default:
		return truncar200(strings.ReplaceAll(o, "_", " "))
	}
}

func truncar200(s string) string {
	r := []rune(s)
	if len(r) <= 200 {
		return s
	}
	return string(r[:200])
}
