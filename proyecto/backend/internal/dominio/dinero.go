package dominio

import (
	"errors"
	"fmt"
	"math/bits"

	"videocotizacion/backend/internal/errores"
)

// Centavos es un monto en centavos de la moneda. Siempre int64, nunca float
// (G01, S05, O04). Tope práctico 2^53−1 para clientes JavaScript (Centavos.schema.json).
type Centavos int64

// MaxCentavos es el máximo representable en el contrato.
const MaxCentavos Centavos = 9007199254740991

// MaxCantidadCentesimas es el máximo de CantidadCentesimas.schema.json.
const MaxCantidadCentesimas int64 = 1000000000

// ErrDesborde indica que un cálculo de dinero superó el rango permitido.
var ErrDesborde = errors.New("monto fuera de rango")

// MulDivRedondeo calcula (a × b + div/2) div div con enteros sin signo de
// 128 bits y redondeo mitad hacia arriba. Falla con ErrDesborde si algún
// operando es negativo, div ≤ 0 o el resultado supera MaxCentavos.
func MulDivRedondeo(a, b, div int64) (Centavos, error) {
	if a < 0 || b < 0 || div <= 0 {
		return 0, errores.Envolver(errores.ErrorInterno, fmt.Errorf("%w: operandos inválidos", ErrDesborde))
	}
	hi, lo := bits.Mul64(uint64(a), uint64(b))
	lo, acarreo := bits.Add64(lo, uint64(div/2), 0)
	hi += acarreo
	if hi >= uint64(div) {
		return 0, errores.Envolver(errores.ErrorInterno, ErrDesborde)
	}
	q, _ := bits.Div64(hi, lo, uint64(div))
	if q > uint64(MaxCentavos) {
		return 0, errores.Envolver(errores.ErrorInterno, ErrDesborde)
	}
	return Centavos(q), nil
}

// ImporteItem aplica la fórmula del contrato (ItemCotizacion):
// importe = (cantidad_centesimas × precio_unitario_centavos + 50) div 100.
func ImporteItem(cantidadCentesimas int64, precioUnitario Centavos) (Centavos, error) {
	return MulDivRedondeo(cantidadCentesimas, int64(precioUnitario), 100)
}

// RecargoBps calcula base × bps / 10000 con redondeo mitad hacia arriba.
func RecargoBps(base Centavos, bps int64) (Centavos, error) {
	return MulDivRedondeo(int64(base), bps, 10000)
}

// Sumar suma montos verificando el tope.
func Sumar(montos ...Centavos) (Centavos, error) {
	var total Centavos
	for _, m := range montos {
		if m < 0 || m > MaxCentavos-total {
			return 0, errores.Envolver(errores.ErrorInterno, ErrDesborde)
		}
		total += m
	}
	return total, nil
}
