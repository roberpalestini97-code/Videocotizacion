// Package salud agrupa las comprobaciones de disponibilidad (/listo). /salud
// solo indica que el proceso vive; /listo corre estas comprobaciones.
package salud

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Comprobacion verifica una dependencia (base, proveedores, etc.).
type Comprobacion struct {
	Nombre string
	Probar func(ctx context.Context) error
}

// Listo corre todas las comprobaciones con un tiempo límite común. Devuelve
// un error que nombra las que fallaron (para logs; nunca va al cliente).
func Listo(ctx context.Context, limite time.Duration, cs ...Comprobacion) error {
	ctx, cancelar := context.WithTimeout(ctx, limite)
	defer cancelar()
	var errs []error
	for _, c := range cs {
		if err := c.Probar(ctx); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", c.Nombre, err))
		}
	}
	return errors.Join(errs...)
}
