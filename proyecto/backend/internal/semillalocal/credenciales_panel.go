package semillalocal

import (
	"context"
	"fmt"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
)

// Credenciales de panel solo para SEMILLA_LOCAL (desarrollo). No son secretos de producción.
const (
	EmailPanelLocal              = "demo@videocotizacion.local"
	EmailPanelLocal2             = "demo2@videocotizacion.local"
	EmailPanelLocal3             = "demo3@videocotizacion.local"
	ContrasenaPanelLocal         = "frase-larga-de-demo-0"
	CodigoRecuperacionPanelLocal = "DEMO-LOCA-2026"
)

func sembrarCredencialesPanel(ctx context.Context, a almacen.Completo, claveHMAC string) error {
	if claveHMAC == "" {
		return fmt.Errorf("semilla local panel: falta CLAVE_HMAC")
	}
	pares := []struct {
		asesorID string
		email    string
	}{
		{IDAsesor, EmailPanelLocal},
		{IDAsesor2, EmailPanelLocal2},
		{IDAsesor3, EmailPanelLocal3},
	}
	for _, p := range pares {
		c, err := dominio.NuevaContrasena(p.asesorID, p.email, ContrasenaPanelLocal)
		if err != nil {
			return fmt.Errorf("semilla local panel: contraseña %s: %w", p.email, err)
		}
		c.CreadaEn = time.Now().UTC()
		if err := a.GuardarContrasena(ctx, IDTenant, c); err != nil {
			return fmt.Errorf("semilla local panel: guardar contraseña %s: %w", p.email, err)
		}
	}
	if err := a.GuardarCodigoRecuperacion(ctx, IDTenant, dominio.CodigoRecuperacion{
		AsesorID: IDAsesor,
		Hash:     claves.HMAC(claveHMAC, CodigoRecuperacionPanelLocal),
		Metodo:   dominio.MetodoHMACRecuperacion,
	}); err != nil {
		return fmt.Errorf("semilla local panel: código recuperación: %w", err)
	}
	return nil
}
