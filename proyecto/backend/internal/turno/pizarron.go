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

// pizarronDesdeSalida arma campos sin montos (ADR 0006). version sube por turno.
func pizarronDesdeSalida(s cotizador.SalidaLLM, version int) Evento {
	campos := make([]map[string]any, 0, 4+len(s.Faltantes))
	if s.Oficio != "" {
		campos = append(campos, campoPizarron("oficio", "Oficio", tituloOficio(s.Oficio), "anotado"))
	}
	if d := strings.TrimSpace(s.Trabajo.Descripcion); d != "" {
		campos = append(campos, campoPizarron("trabajo", "Trabajo", truncar200(d), "anotado"))
	}
	if s.Zona.Localidad != "" && s.Zona.Localidad != "sin_definir" {
		campos = append(campos, campoPizarron("localidad", "Localidad", truncar200(s.Zona.Localidad), "anotado"))
	}
	for _, f := range s.Faltantes {
		clave := strings.ToLower(strings.TrimSpace(f))
		if clave == "" {
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
	if len(s) <= 200 {
		return s
	}
	return s[:200]
}
