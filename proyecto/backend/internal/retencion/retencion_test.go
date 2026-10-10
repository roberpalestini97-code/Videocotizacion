package retencion

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/almacen/conformidad"
	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/reloj"
)

func TestEjecutarConRelojFalso(t *testing.T) {
	a := memoria.Nuevo()
	r := reloj.NuevoFalso(conformidad.Base)
	var log bytes.Buffer
	l := slog.New(slog.NewJSONHandler(&log, nil))
	A, B := conformidad.NuevoTenant(t, a), conformidad.NuevoTenant(t, a)
	asA, asB := conformidad.NuevoAsesor(t, a, A.ID), conformidad.NuevoAsesor(t, a, B.ID)
	sA := conformidad.NuevaSesion(t, a, A.ID, asA.ID, conformidad.Base, 7)
	conformidad.NuevaSesion(t, a, B.ID, asB.ID, conformidad.Base, 30)

	res, err := Ejecutar(context.Background(), a, r, l)
	if err != nil || res.Tenants != 2 || res.Sesiones != 0 {
		t.Fatalf("antes de vencer: %+v %v", res, err)
	}
	r.Avanzar(7 * 24 * time.Hour)
	res, err = Ejecutar(context.Background(), a, r, l)
	if err != nil || res.Sesiones != 1 {
		t.Fatalf("a los 7 días: %+v %v", res, err)
	}
	if _, err := a.LeerSesion(context.Background(), A.ID, sA.ID); !errores.Es(err, errores.NoEncontrado) {
		t.Fatal("la sesión vencida debía borrarse")
	}
	if len(a.RegistroBorrados(A.ID)) != 2 {
		t.Fatal("cada corrida deja constancia")
	}
	r.Avanzar(30 * 24 * time.Hour)
	res, _ = Ejecutar(context.Background(), a, r, l)
	if res.Sesiones != 1 {
		t.Fatalf("a los 37 días: %+v", res)
	}
	// El log no lleva datos personales del asesor.
	if strings.Contains(log.String(), asA.Email) || strings.Contains(log.String(), asA.WhatsApp) {
		t.Fatal("el log de retención no debe tener datos personales")
	}
}

// conFalla hace fallar la retención de un tenant puntual.
type conFalla struct {
	*memoria.Almacen
	malo dominio.TenantID
}

func (c conFalla) BorrarVencidos(ctx context.Context, t dominio.TenantID, ahora time.Time) (almacen.Borrados, error) {
	if t == c.malo {
		return almacen.Borrados{}, errores.Nuevo(errores.ServicioNoDisponible)
	}
	return c.Almacen.BorrarVencidos(ctx, t, ahora)
}

func TestUnTenantQueFallaNoFrenaALosDemas(t *testing.T) {
	m := memoria.Nuevo()
	A, B := conformidad.NuevoTenant(t, m), conformidad.NuevoTenant(t, m)
	res, err := Ejecutar(context.Background(), conFalla{m, A.ID}, reloj.NuevoFalso(conformidad.Base), slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	if err == nil || !strings.Contains(err.Error(), string(A.ID)) || res.Tenants != 1 || len(m.RegistroBorrados(B.ID)) != 1 {
		t.Fatalf("res=%+v err=%v", res, err)
	}
}

func TestProgramarSeDetiene(t *testing.T) {
	a := memoria.Nuevo()
	conformidad.NuevoTenant(t, a)
	ctx, cancelar := context.WithCancel(context.Background())
	listo := make(chan struct{})
	go func() {
		Programar(ctx, 5*time.Millisecond, a, reloj.Sistema{}, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
		close(listo)
	}()
	time.Sleep(30 * time.Millisecond)
	cancelar()
	select {
	case <-listo:
	case <-time.After(2 * time.Second):
		t.Fatal("Programar no terminó al cancelar el contexto")
	}
}
