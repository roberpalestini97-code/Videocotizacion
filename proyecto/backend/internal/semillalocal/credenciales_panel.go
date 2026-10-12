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
	ContrasenaPanelLocal         = "frase-larga-de-demo-0"
	CodigoRecuperacionPanelLocal = "DEMO-LOCA-2026"
)

func sembrarCredencialesPanel(ctx context.Context, a almacen.Completo, claveHMAC string) error {
	c, err := dominio.NuevaContrasena(IDAsesor, EmailPanelLocal, ContrasenaPanelLocal)
	if err != nil {
		return fmt.Errorf("semilla local panel: contraseña: %w", err)
	}
	c.CreadaEn = time.Now().UTC()
	if err := a.GuardarContrasena(ctx, IDTenant, c); err != nil {
		return fmt.Errorf("semilla local panel: guardar contraseña: %w", err)
	}
	if claveHMAC == "" {
		return fmt.Errorf("semilla local panel: falta CLAVE_HMAC")
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
