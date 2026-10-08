package conformidad_test

import (
	"context"
	"testing"

	"videocotizacion/backend/internal/almacen/conformidad"
	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/almacen/pgprueba"
	"videocotizacion/backend/internal/almacen/postgres"
	"videocotizacion/backend/internal/migrador"
	"videocotizacion/backend/migrations"
)

func TestMemoria(t *testing.T) {
	a := memoria.Nuevo()
	defer a.Cerrar()
	conformidad.Correr(t, a)
}

// TestPostgres corre la misma batería contra PostgreSQL real con el rol de
// la API (vc_api). Se omite si PG_PRUEBA_URL no está definida.
func TestPostgres(t *testing.T) {
	base := pgprueba.Preparar(t)
	ms, err := migrador.Leer(migrations.Archivos)
	if err != nil {
		t.Fatal(err)
	}
	a, err := postgres.Abrir(context.Background(), base.URLAPI, postgres.Opciones{ConexionesMax: 8, VersionEsquema: migrador.Ultima(ms)})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Cerrar()
	conformidad.Correr(t, a)
}
