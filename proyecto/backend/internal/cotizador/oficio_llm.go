package cotizador

import "videocotizacion/backend/internal/dominio"

// OficioDesdeSalidaLLM aplica S4 (estado-de-congelamiento): paisajismo del
// esquema T06 se normaliza a jardineria en DatosExtraidos y cotización.
func OficioDesdeSalidaLLM(raw string) (dominio.Oficio, bool) {
	switch raw {
	case "paisajismo":
		return dominio.OficioJardineria, true
	case "otro", "sin_definir", "":
		return "", false
	default:
		o := dominio.Oficio(raw)
		return o, o.Valido()
	}
}
