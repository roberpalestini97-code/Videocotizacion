package cotizador

import (
	"testing"

	"videocotizacion/backend/internal/dominio"
)

// Contraste orientativo: precio mínimo por m² vs fracción de jornal UOCRA oficial (2026).
// No falla el tarifario provisorio; documenta si el rango público queda muy por debajo del piso laboral.
func TestCoherenciaManoObra2026PinturaInterior(t *testing.T) {
	tf := tarifarioReal(t)
	ta, ok := tf.Tarea("pintura_interior_latex_2_manos")
	if !ok || ta.Precio == nil {
		t.Fatal("falta tarea de referencia")
	}
	// uocra_oficial en tarifas-2026.json (oct 2026, Zona A)
	const jornalMinCentavos int64 = 5174400
	const m2PorJornalMin = 25 // coherencia_mano_obra_2026 rendimiento conservador
	pisoPorM2 := jornalMinCentavos / m2PorJornalMin
	if int64(ta.Precio.Min) < pisoPorM2/2 {
		t.Logf("aviso: min m² pintura interior (%d cent) < ~½ jornal/%d m² (%d cent); tarifario sigue siendo referencia de portales, no piso UOCRA",
			ta.Precio.Min, m2PorJornalMin, pisoPorM2/2)
	}
	if ta.Precio.Min >= ta.Precio.Max {
		t.Fatalf("rango inválido: %+v", ta.Precio)
	}
	// Smoke: el motor JSON resuelve igual que antes
	c := cotizadorReal(t)
	p := Pedido{TipoTrabajo: "pintura_interior", Localidad: "cobo", Medidas: []Medida{{100, "m2"}}}
	cot, err := c.Cotizar(sesion(t), p, t0)
	if err != nil || cot.Oficio != dominio.OficioPintura {
		t.Fatalf("cotizar: %v oficio=%s", err, cot.Oficio)
	}
}
