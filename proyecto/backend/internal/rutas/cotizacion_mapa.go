package rutas

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

func mapaCotizacionContrato(cot dominio.Cotizacion) map[string]any {
	items := make([]map[string]any, 0, len(cot.Items))
	for _, it := range cot.Items {
		items = append(items, map[string]any{
			"tipo":                     string(it.Tipo),
			"codigo_tarea":             it.CodigoTarea,
			"descripcion":              it.Descripcion,
			"unidad":                   string(it.Unidad),
			"cantidad_centesimas":      it.CantidadCentesimas,
			"precio_unitario_centavos": int64(it.PrecioUnitarioMinCentavos),
			"importe_centavos":         int64(it.ImporteMinCentavos),
		})
	}
	return map[string]any{
		"cotizacion_id":  cot.ID,
		"sesion_id":      cot.SesionID,
		"emitida_en":     cot.EmitidaEn.Format(time.RFC3339),
		"moneda":         string(cot.Moneda),
		"oficio":         string(cot.Oficio),
		"zona":           string(cot.Zona),
		"fuera_de_zona":  cot.FueraDeZona,
		"items":          items,
		"total_centavos": int64(cot.TotalMinCentavos),
		"orientativa":    true,
		"leyenda":        cot.Leyenda,
		"tarifas": map[string]any{
			"version": cot.Tarifas.Version,
			"estado":  string(cot.Tarifas.Estado),
		},
		"validez_dias": cot.ValidezDias,
	}
}

func mapaDerivacionWhatsApp(sesionID, whatsappE164 string, generada time.Time) (map[string]any, error) {
	codigo, err := codigoReferencia(sesionID)
	if err != nil {
		return nil, err
	}
	numero := strings.TrimPrefix(whatsappE164, "+")
	if numero == "" || strings.Contains(numero, "+") {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("whatsapp del asesor inutilizable"))
	}
	texto := "Hola, quiero seguir con mi videocotización " + codigo
	return map[string]any{
		"codigo_referencia": codigo,
		"url_wa_me":         "https://wa.me/" + numero + "?text=" + url.PathEscape(texto),
		"texto_prellenado":  texto,
		"generada_en":       generada.UTC().Format(time.RFC3339),
	}, nil
}
