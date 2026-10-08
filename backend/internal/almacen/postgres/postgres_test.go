package postgres_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"videocotizacion/backend/internal/almacen/conformidad"
	"videocotizacion/backend/internal/almacen/pgprueba"
	"videocotizacion/backend/internal/almacen/postgres"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/migrador"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/migrations"
)

var tablas = []string{"tenants", "asesores", "sesiones", "consentimientos", "cotizaciones", "items_cotizacion", "registro_borrados"}

func version(t *testing.T) string {
	t.Helper()
	ms, err := migrador.Leer(migrations.Archivos)
	if err != nil {
		t.Fatal(err)
	}
	return migrador.Ultima(ms)
}

func abrir(t *testing.T, dsn secreto.Secreto, o postgres.Opciones) (*postgres.Almacen, error) {
	t.Helper()
	if o.VersionEsquema == "" {
		o.VersionEsquema = version(t)
	}
	ctx, cancelar := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelar()
	return postgres.Abrir(ctx, dsn, o)
}

func exec(t *testing.T, dsn string, sqls ...string) {
	t.Helper()
	conn, err := pgx.Connect(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(context.Background()) }()
	for _, s := range sqls {
		if _, err := conn.Exec(context.Background(), s); err != nil {
			t.Fatalf("%s: %v", s, err)
		}
	}
}

func sufijo() string {
	var b [4]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// rolTemporal crea un rol de login con atributos dados y devuelve su URL.
func rolTemporal(t *testing.T, base *pgprueba.Base, atributos string) secreto.Secreto {
	t.Helper()
	nombre := "vc_prueba_" + sufijo()
	exec(t, base.URLAdmin.Revelar(),
		fmt.Sprintf("CREATE ROLE %s LOGIN PASSWORD 'x' %s", nombre, atributos),
		fmt.Sprintf("GRANT CONNECT ON DATABASE %s TO %s", base.Nombre, nombre),
		fmt.Sprintf("GRANT USAGE ON SCHEMA vc, vc_meta TO %s", nombre),
		fmt.Sprintf("GRANT SELECT ON ALL TABLES IN SCHEMA vc, vc_meta TO %s", nombre))
	t.Cleanup(func() {
		ctx := context.Background()
		conn, err := pgx.Connect(ctx, base.URLAdmin.Revelar())
		if err != nil {
			return
		}
		defer func() { _ = conn.Close(ctx) }()
		_, _ = conn.Exec(ctx, "DROP OWNED BY "+nombre)
		_, _ = conn.Exec(ctx, fmt.Sprintf("REVOKE ALL ON DATABASE %s FROM %s", base.Nombre, nombre))
		_, _ = conn.Exec(ctx, "DROP ROLE "+nombre)
	})
	u, _ := url.Parse(base.URLAPI.Revelar())
	u.User = url.UserPassword(nombre, "x")
	return secreto.Nuevo(u.String())
}

func exigirInseguro(t *testing.T, a *postgres.Almacen, err error, contiene string) {
	t.Helper()
	if a != nil {
		a.Cerrar()
	}
	if !errors.Is(err, postgres.ErrArranqueInseguro) || !strings.Contains(err.Error(), contiene) {
		t.Fatalf("se esperaba arranque inseguro (%s), vino: %v", contiene, err)
	}
}

// R4 / S02 / H3: la API no arranca con un rol indebido ni con el esquema mal.
func TestArranqueSeguro(t *testing.T) {
	base := pgprueba.Preparar(t)

	a, err := abrir(t, base.URLAPI, postgres.Opciones{})
	if err != nil {
		t.Fatalf("vc_api debía poder arrancar: %v", err)
	}
	a.Cerrar()

	a, err = abrir(t, base.URLDueno, postgres.Opciones{})
	exigirInseguro(t, a, err, "dueño")
	a, err = abrir(t, base.URLAdmin, postgres.Opciones{})
	exigirInseguro(t, a, err, "superusuario")
	a, err = abrir(t, rolTemporal(t, base, "BYPASSRLS"), postgres.Opciones{})
	exigirInseguro(t, a, err, "BYPASSRLS")
	a, err = abrir(t, rolTemporal(t, base, "NOINHERIT IN ROLE vc_dueno"), postgres.Opciones{})
	exigirInseguro(t, a, err, "dueño")
	a, err = abrir(t, base.URLAPI, postgres.Opciones{VersionEsquema: "9999"})
	exigirInseguro(t, a, err, "9999")
	a, err = abrir(t, base.URLAPI, postgres.Opciones{ExigirTLS: true})
	exigirInseguro(t, a, err, "TLS")

	// Una tabla sin FORCE (o sin RLS) impide arrancar.
	exec(t, base.URLDueno.Revelar(), "ALTER TABLE vc.sesiones NO FORCE ROW LEVEL SECURITY")
	a, err = abrir(t, base.URLAPI, postgres.Opciones{})
	exigirInseguro(t, a, err, "sesiones")
	exec(t, base.URLDueno.Revelar(), "ALTER TABLE vc.sesiones FORCE ROW LEVEL SECURITY",
		"CREATE TABLE vc.sin_tenant (x int)", "ALTER TABLE vc.sin_tenant ENABLE ROW LEVEL SECURITY",
		"ALTER TABLE vc.sin_tenant FORCE ROW LEVEL SECURITY")
	a, err = abrir(t, base.URLAPI, postgres.Opciones{})
	exigirInseguro(t, a, err, "sin_tenant")
	exec(t, base.URLDueno.Revelar(), "DROP TABLE vc.sin_tenant")

	if _, err := postgres.Abrir(context.Background(), secreto.Nuevo("postgres://u:clave-que-no-debe-verse@[::1"), postgres.Opciones{}); err == nil ||
		strings.Contains(err.Error(), "clave-que-no-debe-verse") {
		t.Fatalf("un DSN inválido no debe filtrarse en el error: %v", err)
	}
}

// sembrar crea dos tenants con datos y devuelve sus ids y una sesión de B.
func sembrar(t *testing.T, a *postgres.Almacen) (A, B dominio.TenantID, sesionB string) {
	t.Helper()
	ta, tb := conformidad.NuevoTenant(t, a), conformidad.NuevoTenant(t, a)
	for _, tn := range []dominio.TenantID{ta.ID, tb.ID} {
		as := conformidad.NuevoAsesor(t, a, tn)
		s := conformidad.NuevaSesion(t, a, tn, as.ID, conformidad.Base, 30)
		c, _ := dominio.NuevoConsentimiento(s, "2026-10-08.1", conformidad.Base)
		if _, err := a.RegistrarConsentimiento(context.Background(), tn, c, conformidad.Base); err != nil {
			t.Fatal(err)
		}
		if err := a.GuardarCotizacion(context.Background(), tn, conformidad.NuevaCotizacion(t, s.ID, conformidad.Base, 30)); err != nil {
			t.Fatal(err)
		}
		sesionB = s.ID
	}
	return ta.ID, tb.ID, sesionB
}

func codigoPG(err error) string {
	var e *pgconn.PgError
	if errors.As(err, &e) {
		return e.Code
	}
	return ""
}

// Pruebas de RLS con SQL directo como vc_api, sin pasar por el almacén: si un
// día el código olvida el filtro por tenant, la base sigue aislando.
func TestRLSConSQLDirecto(t *testing.T) {
	base := pgprueba.Preparar(t)
	a, err := abrir(t, base.URLAPI, postgres.Opciones{})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Cerrar()
	A, B, sesionB := sembrar(t, a)
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, base.URLAPI.Revelar())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()

	contar := func(q pgx.Tx, tabla string) int {
		t.Helper()
		var n int
		if err := q.QueryRow(ctx, "SELECT count(*) FROM vc."+tabla).Scan(&n); err != nil {
			t.Fatalf("contar %s: %v", tabla, err)
		}
		return n
	}
	enTx := func(tenant string, fn func(tx pgx.Tx)) {
		t.Helper()
		tx, err := conn.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = tx.Rollback(ctx) }()
		if tenant != "-" {
			if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenant); err != nil {
				t.Fatal(err)
			}
		}
		fn(tx)
	}

	t.Run("sin_tenant_cero_filas_e_insert_falla", func(t *testing.T) {
		for _, tenant := range []string{"-", ""} {
			enTx(tenant, func(tx pgx.Tx) {
				for _, tb := range tablas {
					if n := contar(tx, tb); n != 0 {
						t.Fatalf("sin tenant (%q) se ven %d filas de %s", tenant, n, tb)
					}
				}
				_, err := tx.Exec(ctx, "INSERT INTO vc.tenants VALUES ($1, 'x', 1, 0, 1, now())", string(A))
				if codigoPG(err) != "42501" {
					t.Fatalf("INSERT sin tenant debía fallar por RLS: %v", err)
				}
			})
		}
	})

	t.Run("tenant_manipulado_falla_cerrado", func(t *testing.T) {
		for _, malo := range []string{"no-es-uuid", "' OR 1=1 --", string(A) + "x"} {
			tx, _ := conn.Begin(ctx)
			_, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", malo)
			if err == nil {
				var n int
				err = tx.QueryRow(ctx, "SELECT count(*) FROM vc.sesiones").Scan(&n)
			}
			_ = tx.Rollback(ctx)
			if codigoPG(err) != "22P02" {
				t.Fatalf("tenant %q debía fallar con 22P02, vino %v", malo, err)
			}
		}
		otro, _ := dominio.NuevoTenantID()
		enTx(string(otro), func(tx pgx.Tx) {
			if n := contar(tx, "sesiones"); n != 0 {
				t.Fatal("un tenant inexistente no debe ver filas")
			}
		})
	})

	t.Run("con_A_no_se_ve_ni_modifica_B", func(t *testing.T) {
		enTx(string(A), func(tx pgx.Tx) {
			for _, tb := range tablas {
				var ajenas int
				if err := tx.QueryRow(ctx, "SELECT count(*) FROM vc."+tb+" WHERE tenant_id <> $1", string(A)).Scan(&ajenas); err != nil {
					t.Fatal(err)
				}
				if ajenas != 0 {
					t.Fatalf("A ve %d filas ajenas en %s", ajenas, tb)
				}
			}
			if contar(tx, "sesiones") != 1 || contar(tx, "items_cotizacion") != 2 {
				t.Fatal("A debe ver exactamente lo suyo")
			}
			tag, err := tx.Exec(ctx, "UPDATE vc.sesiones SET estado = 'cerrada', cerrada_en = now(), motivo_cierre = 'error_interno' WHERE sesion_id = $1", sesionB)
			if err != nil || tag.RowsAffected() != 0 {
				t.Fatalf("UPDATE sobre B: %v filas, %v", tag.RowsAffected(), err)
			}
			tag, err = tx.Exec(ctx, "DELETE FROM vc.sesiones WHERE sesion_id = $1", sesionB)
			if err != nil || tag.RowsAffected() != 0 {
				t.Fatalf("DELETE sobre B: %v filas, %v", tag.RowsAffected(), err)
			}
		})
		enTx(string(A), func(tx pgx.Tx) {
			_, err := tx.Exec(ctx, `INSERT INTO vc.registro_borrados (tenant_id, ejecutado_en, sesiones, consentimientos, cotizaciones, items)
				VALUES ($1, now(), 0, 0, 0, 0)`, string(B))
			if codigoPG(err) != "42501" {
				t.Fatalf("INSERT con tenant_id de B estando en A debía fallar por WITH CHECK: %v", err)
			}
		})
		enTx(string(A), func(tx pgx.Tx) {
			_, err := tx.Exec(ctx, "UPDATE vc.sesiones SET tenant_id = $1", string(B))
			if codigoPG(err) != "42501" {
				t.Fatalf("cambiar tenant_id debía estar prohibido: %v", err)
			}
		})
		enTx(string(B), func(tx pgx.Tx) {
			var estado string
			if err := tx.QueryRow(ctx, "SELECT estado FROM vc.sesiones WHERE sesion_id = $1", sesionB).Scan(&estado); err != nil || estado != "consentida" {
				t.Fatalf("la sesión de B cambió: %q %v", estado, err)
			}
		})
	})

	t.Run("privilegios_minimos", func(t *testing.T) {
		for _, sql := range []string{
			"UPDATE vc.consentimientos SET aviso_version = '2026-10-08.2'", // R12 solo-anexar
			"DELETE FROM vc.consentimientos",
			"DELETE FROM vc.items_cotizacion",
			"UPDATE vc.registro_borrados SET sesiones = 0",
			"TRUNCATE vc.sesiones",
			"ALTER TABLE vc.sesiones DISABLE ROW LEVEL SECURITY",
			"DROP POLICY aislamiento_por_tenant ON vc.sesiones",
			"CREATE TABLE vc.x (y int)",
			"INSERT INTO vc_meta.migraciones (version, nombre, sha256) VALUES ('9999', 'x', repeat('0', 64))",
		} {
			enTx(string(A), func(tx pgx.Tx) {
				if _, err := tx.Exec(ctx, sql); codigoPG(err) != "42501" {
					t.Fatalf("%q debía fallar por privilegios (42501): %v", sql, err)
				}
			})
		}
		enTx(string(A), func(tx pgx.Tx) {
			if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
				t.Fatal(err)
			}
			var n int
			err := tx.QueryRow(ctx, "SELECT count(*) FROM vc.sesiones").Scan(&n)
			if codigoPG(err) != "42501" {
				t.Fatalf("row_security=off no debe saltear RLS: %v", err)
			}
		})
	})

	t.Run("dueno_tambien_sujeto_a_RLS_forzada", func(t *testing.T) {
		d, err := pgx.Connect(ctx, base.URLDueno.Revelar())
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = d.Close(ctx) }()
		var n int
		if err := d.QueryRow(ctx, "SELECT count(*) FROM vc.sesiones").Scan(&n); err != nil || n != 0 {
			t.Fatalf("el dueño sin tenant ve %d sesiones (%v): falta FORCE", n, err)
		}
	})

	t.Run("catalogo_rls_y_rol", func(t *testing.T) {
		var sinForzar, bypass int
		err := conn.QueryRow(ctx, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'vc' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`).Scan(&sinForzar)
		if err != nil || sinForzar != 0 {
			t.Fatalf("tablas sin RLS forzada: %d (%v)", sinForzar, err)
		}
		if err := conn.QueryRow(ctx, "SELECT count(*) FROM pg_roles WHERE rolname = 'vc_api' AND (rolbypassrls OR rolsuper)").Scan(&bypass); err != nil || bypass != 0 {
			t.Fatalf("vc_api con BYPASSRLS o superusuario (%v)", err)
		}
	})

	t.Run("constancia_de_borrado_sin_datos_personales", func(t *testing.T) {
		if _, err := a.BorrarVencidos(ctx, A, conformidad.Base.AddDate(1, 0, 0)); err != nil {
			t.Fatal(err)
		}
		enTx(string(A), func(tx pgx.Tx) {
			var ses, cns, cot, it int64
			if err := tx.QueryRow(ctx, "SELECT sesiones, consentimientos, cotizaciones, items FROM vc.registro_borrados").Scan(&ses, &cns, &cot, &it); err != nil {
				t.Fatal(err)
			}
			if ses != 1 || cns != 1 || cot != 1 || it != 2 {
				t.Fatalf("constancia = %d %d %d %d", ses, cns, cot, it)
			}
		})
		enTx(string(B), func(tx pgx.Tx) {
			if contar(tx, "registro_borrados") != 0 || contar(tx, "sesiones") != 1 {
				t.Fatal("la retención de A tocó a B")
			}
		})
	})
}

// R6: con una sola conexión en el pool, alternar tenants no arrastra el
// tenant de un pedido al siguiente.
func TestPoolNoArrastraTenant(t *testing.T) {
	base := pgprueba.Preparar(t)
	a, err := abrir(t, base.URLAPI, postgres.Opciones{ConexionesMax: 1})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Cerrar()
	A, B, sesionB := sembrar(t, a)
	ctx := context.Background()
	for range 5 {
		if _, err := a.LeerSesion(ctx, B, sesionB); err != nil {
			t.Fatal(err)
		}
		if _, err := a.LeerSesion(ctx, A, sesionB); !errores.Es(err, errores.NoEncontrado) {
			t.Fatalf("A no debe ver la sesión de B en la misma conexión: %v", err)
		}
	}
	// Fuera de una transacción del almacén, la misma conexión no tiene tenant.
	pool, err := pgxpool.New(ctx, base.URLAPI.Revelar())
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for range 3 {
		tx, _ := pool.Begin(ctx)
		_, _ = tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", string(B))
		_ = tx.Commit(ctx)
		var valor *string
		var n int
		if err := pool.QueryRow(ctx, "SELECT current_setting('app.tenant_id', true), (SELECT count(*) FROM vc.sesiones)").Scan(&valor, &n); err != nil {
			t.Fatal(err)
		}
		if (valor != nil && *valor != "") || n != 0 {
			t.Fatalf("después del commit quedó tenant %v y %d filas visibles", valor, n)
		}
	}
}
