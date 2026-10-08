// Package pgprueba prepara bases PostgreSQL efímeras para las pruebas de
// integración. Necesita PG_PRUEBA_URL: URL de un administrador (CREATEROLE y
// CREATEDB, o superusuario) de un clúster DESCARTABLE. Si falta, las pruebas
// que lo usan se omiten.
//
// Por cada llamada crea una base vc_prueba_<aleatorio> con dueño vc_dueno, le
// aplica las migraciones con `migrador` (como haría `api migrar`) y devuelve
// las URL del rol dueño y del rol de la API. Los roles se crean si faltan, con
// una contraseña fija de prueba: no usar contra un clúster real.
package pgprueba

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"videocotizacion/backend/internal/migrador"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/migrations"
)

// Variable de entorno con la URL de administración del clúster de prueba.
const Variable = "PG_PRUEBA_URL"

// ClaveRoles es la contraseña de vc_dueno y vc_api en el clúster de prueba.
const ClaveRoles = "vc-prueba-solo-local"

// Base es una base de prueba migrada.
type Base struct {
	Nombre   string
	URLAdmin secreto.Secreto // administrador, sobre esta base
	URLDueno secreto.Secreto // vc_dueno
	URLAPI   secreto.Secreto // vc_api
	admin    string
}

// URLAdmin devuelve la URL de administración o "" si no está configurada.
func URLAdmin() string { return os.Getenv(Variable) }

// Preparar crea y migra una base nueva; la borra al terminar la prueba.
func Preparar(t testing.TB) *Base { return preparar(t, true) }

// PrepararSinMigrar crea una base vacía (para probar el migrador).
func PrepararSinMigrar(t testing.TB) *Base { return preparar(t, false) }

func preparar(t testing.TB, migrar bool) *Base {
	t.Helper()
	admin := URLAdmin()
	if admin == "" {
		t.Skipf("%s no está definida: se omite la prueba contra PostgreSQL", Variable)
	}
	ctx, cancelar := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancelar()
	if err := exigirDescartable(admin); err != nil {
		t.Fatal(err)
	}
	b, err := crear(ctx, admin, migrar)
	if err != nil {
		t.Fatalf("preparar PostgreSQL de prueba: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancelar := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelar()
		if err := b.Borrar(ctx); err != nil {
			t.Errorf("borrar base de prueba: %v", err)
		}
	})
	return b
}

// exigirDescartable evita crear roles con clave fija en un clúster que no sea
// local, salvo que se declare descartable a propósito (H8 de T43).
func exigirDescartable(admin string) error {
	u, err := url.Parse(admin)
	if err != nil {
		return fmt.Errorf("%s inválida", Variable)
	}
	switch u.Hostname() {
	case "127.0.0.1", "localhost", "::1":
		return nil
	}
	if os.Getenv("PG_PRUEBA_DESCARTABLE") == "1" {
		return nil
	}
	return fmt.Errorf("%s apunta a %q: solo se admite un clúster local o PG_PRUEBA_DESCARTABLE=1", Variable, u.Hostname())
}

// Crear arma y migra la base (útil en TestMain).
func Crear(ctx context.Context, admin string) (*Base, error) {
	if err := exigirDescartable(admin); err != nil {
		return nil, err
	}
	return crear(ctx, admin, true)
}

func crear(ctx context.Context, admin string, migrar bool) (*Base, error) {
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		return nil, fmt.Errorf("conectar como administrador: %w", err)
	}
	defer func() { _ = conn.Close(context.WithoutCancel(ctx)) }()
	if err := asegurarRoles(ctx, conn); err != nil {
		return nil, err
	}
	var aleatorio [6]byte
	if _, err := rand.Read(aleatorio[:]); err != nil {
		return nil, fmt.Errorf("nombre de base: %w", err)
	}
	nombre := "vc_prueba_" + hex.EncodeToString(aleatorio[:])
	ident := pgx.Identifier{nombre}.Sanitize()
	for _, sql := range []string{
		"CREATE DATABASE " + ident + " OWNER vc_dueno",
		"REVOKE ALL ON DATABASE " + ident + " FROM PUBLIC",
		"GRANT CONNECT ON DATABASE " + ident + " TO vc_api",
	} {
		if _, err := conn.Exec(ctx, sql); err != nil {
			return nil, fmt.Errorf("crear base de prueba: %w", err)
		}
	}
	b := &Base{Nombre: nombre, admin: admin}
	for destino, usuario := range map[*secreto.Secreto]*url.Userinfo{
		&b.URLAdmin: nil, &b.URLDueno: url.UserPassword("vc_dueno", ClaveRoles), &b.URLAPI: url.UserPassword("vc_api", ClaveRoles),
	} {
		u, err := conURL(admin, nombre, usuario)
		if err != nil {
			return nil, err
		}
		*destino = secreto.Nuevo(u)
	}
	if migrar {
		if err := b.Migrar(ctx); err != nil {
			return nil, err
		}
	}
	return b, nil
}

// Migrar aplica las migraciones embebidas con el rol dueño.
func (b *Base) Migrar(ctx context.Context) error {
	ms, err := migrador.Leer(migrations.Archivos)
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, b.URLDueno.Revelar())
	if err != nil {
		return fmt.Errorf("conectar como vc_dueno: %w", err)
	}
	defer func() { _ = conn.Close(context.WithoutCancel(ctx)) }()
	if _, err := migrador.Aplicar(ctx, conn, ms); err != nil {
		return fmt.Errorf("migrar base de prueba: %w", err)
	}
	return nil
}

// Borrar elimina la base de prueba.
func (b *Base) Borrar(ctx context.Context) error {
	conn, err := pgx.Connect(ctx, b.admin)
	if err != nil {
		return fmt.Errorf("conectar como administrador: %w", err)
	}
	defer func() { _ = conn.Close(context.WithoutCancel(ctx)) }()
	_, err = conn.Exec(ctx, "DROP DATABASE IF EXISTS "+pgx.Identifier{b.Nombre}.Sanitize()+" WITH (FORCE)")
	return err
}

// asegurarRoles crea vc_dueno y vc_api si faltan. Varios paquetes de prueba
// corren en paralelo: un advisory lock los serializa.
func asegurarRoles(ctx context.Context, conn *pgx.Conn) error {
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock(7324012)"); err != nil {
		return fmt.Errorf("bloqueo de roles: %w", err)
	}
	defer func() { _, _ = conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock(7324012)") }()
	for _, r := range []struct{ nombre, atributos string }{
		{"vc_dueno", "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB"},
		{"vc_api", "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT"},
	} {
		_, err := conn.Exec(ctx, fmt.Sprintf("CREATE ROLE %s %s PASSWORD '%s'", r.nombre, r.atributos, ClaveRoles))
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42710" { // ya existe
			err = nil
		}
		if err != nil {
			return fmt.Errorf("crear rol %s: %w", r.nombre, err)
		}
	}
	return nil
}

func conURL(admin, base string, usuario *url.Userinfo) (string, error) {
	u, err := url.Parse(admin)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return "", fmt.Errorf("%s debe ser una URL postgres://", Variable)
	}
	if usuario != nil {
		u.User = usuario
	}
	u.Path = "/" + base
	return u.String(), nil
}
