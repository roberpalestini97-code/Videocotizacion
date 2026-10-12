package semillalocal

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
)

func TestSembrarEnMemoria(t *testing.T) {
	t.Cleanup(func() { dominio.PermitirOriginLoopback(false) })
	a := memoria.Nuevo()
	t.Cleanup(a.Cerrar)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	const hmac = "clave-de-prueba-de-32-bytes-minimo"
	if err := Sembrar(context.Background(), a, hmac, log); err != nil {
		t.Fatal(err)
	}
	en, err := a.LeerEnlace(context.Background(), IDTenant, EnlacePublico)
	if err != nil || en.AsesorID != IDAsesor {
		t.Fatalf("enlace: %v %+v", err, en)
	}
	hall, err := a.BuscarClavePorHash(context.Background(), claves.HMAC(hmac, ClavePublica))
	if err != nil || hall.TenantID != IDTenant {
		t.Fatalf("clave: %v %+v", err, hall)
	}
	ch, err := a.BuscarContrasenaPorEmail(context.Background(), EmailPanelLocal)
	if err != nil || ch.AsesorID != IDAsesor || !ch.ContrasenaAsesor.Coincide(ContrasenaPanelLocal) {
		t.Fatalf("panel contraseña: %v %+v", err, ch)
	}
	recs, err := a.ListarCodigosRecuperacion(context.Background(), IDTenant, IDAsesor)
	if err != nil || len(recs) != 1 || recs[0].Usado {
		t.Fatalf("panel recuperación: %v %+v", err, recs)
	}
}
