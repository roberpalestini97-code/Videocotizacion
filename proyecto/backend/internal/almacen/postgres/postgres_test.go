package postgres_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"videocotizacion/backend/internal/almacen/conformidad"
	"videocotizacion/backend/internal/almacen/pgprueba"
	"videocotizacion/backend/internal/almacen/postgres"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/migrador"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/migrations"
)

// tablasDeVC sale del catálogo: una tabla nueva entra sola a las pruebas de RLS.
func tablasDeVC(t *testing.T, conn *pgx.Conn) []string {
	t.Helper()
	filas, err := conn.Query(context.Background(), "SELECT relname::text FROM pg_class WHERE relnamespace = 'vc'::regnamespace AND relkind IN ('r', 'p') ORDER BY 1")
	if err != nil {
		t.Fatal(err)
	}
	l, err := pgx.CollectRows(filas, pgx.RowTo[string])
	if err != nil || len(l) < 7 {
		t.Fatalf("tablas de vc: %v %v", l, err)
	}
	return l
}

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
	tablas := tablasDeVC(t, conn)

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
			"UPDATE vc.asesores SET email = email",
			"UPDATE vc.asesores SET rol = rol",
			"UPDATE vc.consentimientos SET aviso_version = '2026-10-08.2'", // R12 solo-anexar
			"DELETE FROM vc.consentimientos",
			"UPDATE vc.contactos SET nombre = 'x'",
			"DELETE FROM vc.contactos",
			"UPDATE vc.consentimientos_asesor SET aviso_version = aviso_version",
			"DELETE FROM vc.consentimientos_asesor",
			"UPDATE vc.lecturas SET accion = accion",
			"DELETE FROM vc.lecturas",
			"UPDATE vc.contrasenas_asesor SET email = email",
			"DELETE FROM vc.contrasenas_asesor",
			"UPDATE vc.ingresos_panel SET asesor_id = asesor_id",
			"DELETE FROM vc.ingresos_panel",
			"UPDATE vc.ingresos_panel SET hash_csrf = hash_csrf",
			"UPDATE vc.ingresos_panel SET csrf_cifrado = csrf_cifrado",
			"UPDATE vc.secretos_totp SET cifrado = cifrado",
			"DELETE FROM vc.secretos_totp",
			"DELETE FROM vc.codigos_recuperacion",
			"UPDATE vc.pasos_totp SET paso = paso",
			"DELETE FROM vc.pasos_totp",
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
		// vc_dueno no es superusuario (pgprueba lo crea NOSUPERUSER NOBYPASSRLS,
		// como en producción). En vc.sesiones tiene a propósito la política de
		// solo lectura dueno_lee_handshake (0004, para vc.buscar_sesion_medios);
		// donde no hay política para el dueño, FORCE lo deja sin filas.
		for _, tabla := range []string{"vc.cotizaciones", "vc.consentimientos"} {
			var n int
			if err := d.QueryRow(ctx, "SELECT count(*) FROM "+tabla).Scan(&n); err != nil || n != 0 {
				t.Fatalf("el dueño sin tenant ve %d filas de %s (%v): falta FORCE", n, tabla, err)
			}
		}
		tag, err := d.Exec(ctx, "UPDATE vc.sesiones SET estado = estado")
		if err != nil || tag.RowsAffected() != 0 {
			t.Fatalf("el dueño sin tenant modificó %d sesiones (%v): falta FORCE", tag.RowsAffected(), err)
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
	// H1 de T43: con el pool REAL del almacén (una sola conexión), después de
	// una operación la conexión no conserva el tenant. Si alguien cambia el
	// SET LOCAL por un SET de sesión, esto falla.
	pool := a.PoolDePrueba()
	for _, tn := range []dominio.TenantID{A, B, A} {
		if _, err := a.LeerTenant(ctx, tn); err != nil {
			t.Fatal(err)
		}
		var valor *string
		var n int
		if err := pool.QueryRow(ctx, "SELECT current_setting('app.tenant_id', true), (SELECT count(*) FROM vc.sesiones)").Scan(&valor, &n); err != nil {
			t.Fatal(err)
		}
		if (valor != nil && *valor != "") || n != 0 {
			t.Fatalf("la conexión del pool quedó con tenant %q y ve %d sesiones fuera de una transacción", *valor, n)
		}
	}
	if st := pool.Stat(); st.TotalConns() != 1 {
		t.Fatalf("la prueba necesita una sola conexión, hay %d", st.TotalConns())
	}
}

// mutarYExigirFalla aplica una sentencia como dueño (o administrador), exige
// que la API no arranque con un mensaje que contenga quiero y revierte.
func mutarYExigirFalla(t *testing.T, base *pgprueba.Base, dsn secreto.Secreto, mutar, revertir, quiero string) {
	t.Helper()
	exec(t, dsn.Revelar(), mutar)
	defer exec(t, dsn.Revelar(), revertir)
	a, err := abrir(t, base.URLAPI, postgres.Opciones{})
	exigirInseguro(t, a, err, quiero)
}

// H2 de T43: los privilegios de vc_api son EXACTAMENTE los permitidos.
func TestPrivilegiosExactosDeLaAPI(t *testing.T) {
	base := pgprueba.Preparar(t)
	a, err := abrir(t, base.URLAPI, postgres.Opciones{})
	if err != nil {
		t.Fatalf("con los privilegios de la migración la API debía arrancar: %v", err)
	}
	a.Cerrar()
	for _, c := range []struct{ mutar, revertir, quiero string }{
		{"GRANT TRUNCATE ON vc.items_cotizacion TO vc_api", "REVOKE TRUNCATE ON vc.items_cotizacion FROM vc_api", "tabla vc.items_cotizacion:TRUNCATE"},
		{"GRANT UPDATE ON vc.cotizaciones TO vc_api", "REVOKE UPDATE ON vc.cotizaciones FROM vc_api", "tabla vc.cotizaciones:UPDATE"},
		{"GRANT UPDATE (tenant_id) ON vc.sesiones TO vc_api", "REVOKE UPDATE (tenant_id) ON vc.sesiones FROM vc_api", "columna vc.sesiones.tenant_id:UPDATE"},
		{"GRANT REFERENCES, TRIGGER ON vc.tenants TO vc_api", "REVOKE REFERENCES, TRIGGER ON vc.tenants FROM vc_api", "tabla vc.tenants:REFERENCES"},
		{"GRANT DELETE ON vc.consentimientos TO vc_api", "REVOKE DELETE ON vc.consentimientos FROM vc_api", "tabla vc.consentimientos:DELETE"},
		{"GRANT CREATE ON SCHEMA vc TO vc_api", "REVOKE CREATE ON SCHEMA vc FROM vc_api", "esquema vc:CREATE"},
		{"REVOKE INSERT ON vc.asesores FROM vc_api", "GRANT INSERT ON vc.asesores TO vc_api", "faltan [tabla vc.asesores:INSERT]"},
	} {
		mutarYExigirFalla(t, base, base.URLDueno, c.mutar, c.revertir, c.quiero)
	}
	// Atributos y membresías (los cambia el administrador).
	mutarYExigirFalla(t, base, base.URLAdmin, "GRANT pg_read_all_data TO vc_api", "REVOKE pg_read_all_data FROM vc_api", "pg_read_all_data")
	mutarYExigirFalla(t, base, base.URLAdmin, "ALTER ROLE vc_api CREATEDB", "ALTER ROLE vc_api NOCREATEDB", "CREATEDB")
	mutarYExigirFalla(t, base, base.URLAdmin, "GRANT TEMPORARY ON DATABASE "+base.Nombre+" TO vc_api",
		"REVOKE TEMPORARY ON DATABASE "+base.Nombre+" FROM vc_api", "base:TEMPORARY")
	a, err = abrir(t, base.URLAPI, postgres.Opciones{})
	if err != nil {
		t.Fatalf("después de revertir todo la API debía arrancar: %v", err)
	}
	a.Cerrar()
}

// H3 de T43: la única excepción a RLS (SECURITY DEFINER) y la política del
// dueño están endurecidas, y vc.tenant_actual() no se puede aflojar.
func TestEndurecimientoDeLaExcepcionARLS(t *testing.T) {
	base := pgprueba.Preparar(t)
	conn, err := pgx.Connect(context.Background(), base.URLAPI.Revelar())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(context.Background()) }()
	var secdef bool
	var config []string
	var dueno string
	var publico, api bool
	err = conn.QueryRow(context.Background(), `SELECT prosecdef, proconfig, pg_get_userbyid(proowner),
		has_function_privilege('public', oid, 'EXECUTE'), has_function_privilege('vc_api', oid, 'EXECUTE')
		FROM pg_proc WHERE oid = 'vc.tenants_para_retencion()'::regprocedure`).Scan(&secdef, &config, &dueno, &publico, &api)
	if err != nil {
		t.Fatal(err)
	}
	if !secdef || len(config) != 1 || config[0] != "search_path=pg_catalog, pg_temp" || dueno != "vc_dueno" || publico || !api {
		t.Fatalf("definer: secdef=%v config=%v dueño=%s public=%v api=%v", secdef, config, dueno, publico, api)
	}
	d := base.URLDueno
	for _, c := range []struct{ mutar, revertir, quiero string }{
		{"ALTER FUNCTION vc.tenants_para_retencion() RESET search_path",
			"ALTER FUNCTION vc.tenants_para_retencion() SET search_path = pg_catalog, pg_temp", "SECURITY DEFINER"},
		{"GRANT EXECUTE ON FUNCTION vc.tenants_para_retencion() TO PUBLIC",
			"REVOKE EXECUTE ON FUNCTION vc.tenants_para_retencion() FROM PUBLIC", "SECURITY DEFINER"},
		{"CREATE FUNCTION vc.otra() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS 'SELECT 1'",
			"DROP FUNCTION vc.otra()", "vc.otra"},
		{"ALTER POLICY dueno_lista_tenants ON vc.tenants TO PUBLIC",
			"ALTER POLICY dueno_lista_tenants ON vc.tenants TO vc_dueno", "políticas RLS"},
		{"ALTER POLICY aislamiento_por_tenant ON vc.sesiones WITH CHECK (true)",
			"ALTER POLICY aislamiento_por_tenant ON vc.sesiones WITH CHECK (tenant_id = vc.tenant_actual())", "políticas RLS"},
		{"CREATE POLICY extra ON vc.cotizaciones FOR SELECT USING (true)", "DROP POLICY extra ON vc.cotizaciones", "políticas RLS"},
		{"CREATE OR REPLACE FUNCTION vc.tenant_actual() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('app.tenant_id', true)::uuid $$",
			"CREATE OR REPLACE FUNCTION vc.tenant_actual() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$",
			"tenant_actual"},
	} {
		mutarYExigirFalla(t, base, d, c.mutar, c.revertir, c.quiero)
	}
	a, err := abrir(t, base.URLAPI, postgres.Opciones{})
	if err != nil {
		t.Fatalf("después de revertir todo la API debía arrancar: %v", err)
	}
	a.Cerrar()
}

// H5 de T43: con plan genérico (pgx prepara y PostgreSQL lo usa tras 5
// ejecuciones) el cursor del listado sigue siendo condición de índice.
func TestPlanDelListadoUsaElIndice(t *testing.T) {
	base := pgprueba.Preparar(t)
	a, err := abrir(t, base.URLAPI, postgres.Opciones{})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Cerrar()
	tn := conformidad.NuevoTenant(t, a)
	// Varios asesores por tenant, como en producción: con uno solo asesor_id no
	// filtra nada y el planificador elige con razón sesiones_por_creacion.
	asesores := make([]string, 20)
	for i := range asesores {
		asesores[i] = conformidad.NuevoAsesor(t, a, tn.ID).ID
	}
	as := struct{ ID string }{asesores[0]}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, base.URLAPI.Revelar())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", string(tn.ID)); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO vc.sesiones (tenant_id, sesion_id, asesor_id, estado, modo_avatar, creada_en, borrar_despues_de)
		SELECT $1, 'ses_' || upper(lpad(to_hex(g), 26, '0')), ($2::text[])[1 + g % 20], 'creada', '3d',
		       timestamptz '2026-01-01' + g * interval '1 minute', timestamptz '2027-01-01'
		FROM generate_series(1, 5000) g`, string(tn.ID), asesores); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	exec(t, base.URLDueno.Revelar(), "ANALYZE vc.sesiones")
	tx, _ = conn.Begin(ctx)
	_, _ = tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", string(tn.ID))
	if _, err := tx.Exec(ctx, "SET LOCAL plan_cache_mode = force_generic_plan"); err != nil {
		t.Fatal(err)
	}
	// PREPARE explícito: así EXPLAIN EXECUTE muestra el plan genérico ($n),
	// que es el que usa pgx después de varias ejecuciones.
	if _, err := tx.Exec(ctx, "PREPARE listado(uuid, text, timestamptz, text, int) AS "+postgres.ListadoSiguientePagina); err != nil {
		t.Fatal(err)
	}
	// EXECUTE no admite parámetros: valores fijos de la prueba (sin entrada externa).
	filas, err := tx.Query(ctx, fmt.Sprintf("EXPLAIN EXECUTE listado('%s', '%s', '%s', 'ses_ZZZZZZZZZZZZZZZZZZZZZZZZZZ', 21)",
		tn.ID, as.ID, conformidad.Base.Format(time.RFC3339Nano)), pgx.QueryExecModeSimpleProtocol)
	if err != nil {
		t.Fatal(err)
	}
	lineas, err := pgx.CollectRows(filas, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	plan := strings.Join(lineas, "\n")
	condicion := ""
	for _, l := range lineas {
		if strings.Contains(l, "Index Cond:") {
			condicion = l
		}
	}
	if !strings.Contains(plan, "sesiones_por_asesor") || !strings.Contains(condicion, "ROW(creada_en, sesion_id) < ROW($3, $4)") {
		t.Fatalf("el cursor no es condición de índice con plan genérico:\n%s", plan)
	}
	_ = tx.Rollback(ctx)
}

func TestRespuestasModeloPostgres(t *testing.T) {
	base := pgprueba.Preparar(t)
	a, err := abrir(t, base.URLAPI, postgres.Opciones{})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Cerrar()
	ctx := context.Background()
	tn := conformidad.NuevoTenant(t, a)
	as := conformidad.NuevoAsesor(t, a, tn.ID)
	s := conformidad.NuevaSesion(t, a, tn.ID, as.ID, conformidad.Base, 30)
	salida := []byte(`{"version":"1.0","oficio":"pintura","respuesta_hablada":"hola"}`)
	r := dominio.RespuestaModelo{
		SesionID: s.ID, Turno: 1, RegistradaEn: conformidad.Base, SalidaJSON: salida,
	}
	if err := a.AnexarRespuestaModelo(ctx, tn.ID, r); err != nil {
		t.Fatal(err)
	}
	if err := a.AnexarRespuestaModelo(ctx, tn.ID, r); !errores.Es(err, errores.EstadoInvalido) {
		t.Fatalf("turno duplicado: %v", err)
	}
	list, err := a.ListarRespuestasModeloDeSesion(ctx, tn.ID, s.ID)
	// jsonb normaliza espacios y orden de claves: se compara el JSON, no los bytes.
	if err != nil || len(list) != 1 || list[0].Turno != 1 || !mismoJSON(t, list[0].SalidaJSON, salida) {
		t.Fatalf("listar: %+v %v", list, err)
	}
	if _, err := a.ListarRespuestasModeloDeSesion(ctx, tn.ID, "ses_ZZZZZZZZZZZZZZZZZZZZZZZZZZ"); !errores.Es(err, errores.NoEncontrado) {
		t.Fatalf("sesión inexistente: %v", err)
	}
	tb := conformidad.NuevoTenant(t, a)
	if _, err := a.ListarRespuestasModeloDeSesion(ctx, tb.ID, s.ID); !errores.Es(err, errores.NoEncontrado) {
		t.Fatalf("otro tenant no debe ver respuestas: %v", err)
	}
}

func mismoJSON(t *testing.T, a, b []byte) bool {
	t.Helper()
	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		t.Fatalf("JSON guardado inválido: %v", err)
	}
	if err := json.Unmarshal(b, &y); err != nil {
		t.Fatal(err)
	}
	return reflect.DeepEqual(x, y)
}
