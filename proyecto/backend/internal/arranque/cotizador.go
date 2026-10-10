package arranque

import (
	"log/slog"

	"videocotizacion/backend/internal/cotizador"
)

// AbrirCotizador delega en cotizador.AbrirDesdeRutasHabituales (repo, tests, Docker).
func AbrirCotizador(log *slog.Logger) *cotizador.Cotizador {
	return cotizador.AbrirDesdeRutasHabituales(log)
}
