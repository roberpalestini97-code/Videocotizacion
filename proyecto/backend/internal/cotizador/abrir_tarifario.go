package cotizador

import (
	"log/slog"
	"os"
)

var rutasTarifario = []string{
	"tarifas/tarifas-2026.json",
	"../tarifas/tarifas-2026.json",
	"../../tarifas/tarifas-2026.json",
	"../../../tarifas/tarifas-2026.json",
}

// AbrirDesdeRutasHabituales carga tarifas-2026.json desde cwd de repo, tests o
// imagen Docker (WORKDIR /). Si no encuentra el archivo, devuelve nil.
func AbrirDesdeRutasHabituales(log *slog.Logger) *Cotizador {
	for _, p := range rutasTarifario {
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		tf, err := CargarTarifario(f)
		_ = f.Close()
		if err != nil {
			continue
		}
		c, err := Nuevo(tf, Opciones{ValidezDias: 15})
		if err != nil {
			continue
		}
		if log != nil {
			log.Info("cotizador listo", "tarifas", p)
		}
		return c
	}
	if log != nil {
		log.Warn("cotizador no cargado: no se encontró tarifas-2026.json")
	}
	return nil
}
