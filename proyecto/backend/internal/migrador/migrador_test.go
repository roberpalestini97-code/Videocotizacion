package migrador_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"testing/fstest"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/almacen/pgprueba"
	"videocotizacion/backend/internal/migrador"
	"videocotizacion/backend/migrations"
)

func TestLeer(t *testing.T) {
	ms, err := migrador.Leer(fstest.MapFS{
		"0002_dos.sql":              {Data: []byte("SELECT 2")},
		"0001_uno.sql":              {Data: []byte("SELECT 1")},
		"0001_uno.revertir.sql":     {Data: []byte("DROP")},
		"LEEME.md":                  {Data: []byte("x")},
		"subdir/0003_no_se_lee.sql": {Data: []byte("x")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ms) != 2 || ms[0].Version != "0001" || ms[1].Version != "0002" || migrador.Ultima(ms) != "0002" || len(ms[0].SHA256) != 64 {
		t.Fatalf("migraciones = %+v", ms)
	}
	for nombre, fs := range map[string]fstest.MapFS{
		"nombre inválido":  {"1_x.sql": {Data: []byte("x")}},
		"versión repetida": {"0001_a.sql": {Data: []byte("x")}, "0001_b.sql": {Data: []byte("y")}},
		"vacío":            {},
	} {
		if _, err := migrador.Leer(fs); err == nil {
			t.Errorf("%s: debía fallar", nombre)
		}
	}
	reales, err := migrador.Leer(migrations.Archivos)
	if err != nil || reales[0].Version != "0001" || migrador.Ultima(reales) != "0014" {
		t.Fatalf("migraciones embebidas: %v (última=%s) %v", reales, migrador.Ultima(reales), err)
	}
}

func conectar(t *testing.T, dsn string) *pgx.Conn {
	t.Helper()
	c, err := pgx.Connect(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close(context.Background()) })
	return c
}

// H3 y S06: solo el dueño migra, es idempotente, detecta cambios en
// migraciones aplicadas y la reversión deja aplicar todo desde cero.
func TestAplicarContraPostgres(t *testing.T) {
	base := pgprueba.Preparar(t) // ya migrada una vez por el ayudante
	ctx := context.Background()
	ms, err := migrador.Leer(migrations.Archivos)
	if err != nil {
		t.Fatal(err)
	}
	dueno := conectar(t, base.URLDueno.Revelar())
	res, err := migrador.Aplicar(ctx, dueno, ms)
	if err != nil || len(res.Aplicadas) != 0 || len(res.YaAplicadas) != len(ms) {
		t.Fatalf("segunda corrida debía ser no-op: %+v %v", res, err)
	}

	if _, err := migrador.Aplicar(ctx, conectar(t, base.URLAPI.Revelar()), ms); err == nil || !strings.Contains(err.Error(), "rol de la API") {
		t.Fatalf("migrar con vc_api debía fallar: %v", err)
	}
	if _, err := migrador.Aplicar(ctx, conectar(t, base.URLAdmin.Revelar()), ms); err == nil || !strings.Contains(err.Error(), "superusuario") {
		t.Fatalf("migrar como superusuario debía fallar: %v", err)
	}

	cambiada := append([]migrador.Migracion(nil), ms...)
	cambiada[0].SHA256 = strings.Repeat("0", 64)
	if _, err := migrador.Aplicar(ctx, dueno, cambiada); err == nil || !strings.Contains(err.Error(), "cambió") {
		t.Fatalf("una migración aplicada y editada debía frenar: %v", err)
	}
	if _, err := migrador.Aplicar(ctx, dueno, ms[:0:0]); err != nil {
		// Lista vacía: no aplica nada pero detecta que la base tiene versiones desconocidas.
		if !strings.Contains(err.Error(), "no conoce") {
			t.Fatalf("binario viejo: %v", err)
		}
	} else {
		t.Fatal("un binario sin la migración 0001 debía detectar que la base es más nueva")
	}

	// Reversión manual y vuelta a aplicar desde cero.
	rev, err := os.ReadFile(filepath.Join("..", "..", "migrations", "0001_esquema_inicial.revertir.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := dueno.Exec(ctx, string(rev)); err != nil {
		t.Fatalf("reversión: %v", err)
	}
	var existe bool
	if err := dueno.QueryRow(ctx, "SELECT to_regnamespace('vc') IS NOT NULL").Scan(&existe); err != nil || existe {
		t.Fatalf("después de revertir no debe quedar el esquema vc (%v)", err)
	}
	res, err = migrador.Aplicar(ctx, dueno, ms)
	if err != nil || len(res.Aplicadas) != len(ms) {
		t.Fatalf("aplicar desde cero tras revertir: %+v %v", res, err)
	}
	var propietario string
	if err := dueno.QueryRow(ctx, "SELECT tableowner FROM pg_tables WHERE schemaname = 'vc' AND tablename = 'sesiones'").Scan(&propietario); err != nil || propietario != "vc_dueno" {
		t.Fatalf("las tablas deben ser de vc_dueno, son de %q (%v)", propietario, err)
	}
}

// H7 de T43 (M10): varios `api migrar` a la vez sobre una base vacía terminan
// bien y la migración se aplica una sola vez (advisory lock).
func TestMigrarEnParalelo(t *testing.T) {
	base := pgprueba.PrepararSinMigrar(t)
	ms, err := migrador.Leer(migrations.Archivos)
	if err != nil {
		t.Fatal(err)
	}
	const n = 6
	conns := make([]*pgx.Conn, n)
	for i := range conns {
		conns[i] = conectar(t, base.URLDueno.Revelar())
	}
	var wg sync.WaitGroup
	largada := make(chan struct{})
	res := make([]migrador.Resultado, n)
	errs := make([]error, n)
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-largada
			res[i], errs[i] = migrador.Aplicar(context.Background(), conns[i], ms)
		}()
	}
	close(largada)
	wg.Wait()
	aplicaron := 0
	for i := range n {
		if errs[i] != nil {
			t.Fatalf("migración concurrente %d: %v", i, errs[i])
		}
		if len(res[i].Aplicadas) > 0 {
			aplicaron++
		}
	}
	if aplicaron != 1 {
		t.Fatalf("la migración se aplicó %d veces", aplicaron)
	}
}
