// Package retencion corre el borrado programado (ADR 0004 punto 8, R44):
// recorre los tenants (solo ids) y borra lo vencido de cada uno dentro de su
// propia transacción con SET LOCAL. El log lleva solo ids de tenant y
// cantidades, nunca datos personales. Los plazos son propuesta: a validar con
// abogado.
package retencion

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/reloj"
)

// Resumen suma lo borrado en una corrida.
type Resumen struct {
	Tenants int
	almacen.Borrados
}

// Ejecutar hace una corrida. Si un tenant falla, sigue con los demás y
// devuelve el error conjunto.
func Ejecutar(ctx context.Context, a almacen.Completo, r reloj.Reloj, log *slog.Logger) (Resumen, error) {
	ids, err := a.TenantsParaRetencion(ctx)
	if err != nil {
		return Resumen{}, fmt.Errorf("retención: listar tenants: %w", err)
	}
	ahora := r.Ahora()
	var res Resumen
	var errs []error
	for _, id := range ids {
		b, err := a.BorrarVencidos(ctx, id, ahora)
		if err != nil {
			errs = append(errs, fmt.Errorf("retención del tenant %s: %w", id, err))
			continue
		}
		res.Tenants++
		res.Sesiones += b.Sesiones
		res.Consentimientos += b.Consentimientos
		res.Cotizaciones += b.Cotizaciones
		res.Items += b.Items
	}
	log.Info("retención ejecutada", "tenants", res.Tenants, "sesiones", res.Sesiones,
		"consentimientos", res.Consentimientos, "cotizaciones", res.Cotizaciones, "items", res.Items, "fallas", len(errs))
	return res, errors.Join(errs...)
}

// Programar corre Ejecutar al inicio y después cada intervalo, hasta que se
// cancele ctx.
func Programar(ctx context.Context, intervalo time.Duration, a almacen.Completo, r reloj.Reloj, log *slog.Logger) {
	t := time.NewTicker(intervalo)
	defer t.Stop()
	for {
		if _, err := Ejecutar(ctx, a, r, log); err != nil && ctx.Err() == nil {
			log.Error("retención con fallas", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
