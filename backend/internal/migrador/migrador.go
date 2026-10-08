// Package migrador aplica las migraciones SQL embebidas con el rol dueño
// (`api migrar`, corrección H3 de T20). Cada migración corre en su propia
// transacción, queda registrada con su SHA-256 en vc_meta.migraciones y un
// cambio posterior del archivo ya aplicado se detecta y frena el proceso.
package migrador

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Migracion es un archivo NNNN_nombre.sql.
type Migracion struct {
	Version string
	Nombre  string
	SQL     string
	SHA256  string
}

var reArchivo = regexp.MustCompile(`^([0-9]{4})_([a-z0-9_]+)\.sql$`)

// RolAPI es el rol de la API; el migrador se niega a correr con él.
const RolAPI = "vc_api"

// Leer devuelve las migraciones del FS ordenadas por versión. Ignora los
// archivos .revertir.sql y rechaza nombres mal formados o versiones repetidas.
func Leer(archivos fs.FS) ([]Migracion, error) {
	entradas, err := fs.ReadDir(archivos, ".")
	if err != nil {
		return nil, fmt.Errorf("leer migraciones: %w", err)
	}
	var out []Migracion
	vistas := map[string]bool{}
	for _, e := range entradas {
		n := e.Name()
		if e.IsDir() || !strings.HasSuffix(n, ".sql") || strings.HasSuffix(n, ".revertir.sql") {
			continue
		}
		m := reArchivo.FindStringSubmatch(n)
		if m == nil {
			return nil, fmt.Errorf("migración con nombre inválido: %s (se espera NNNN_nombre.sql)", n)
		}
		if vistas[m[1]] {
			return nil, fmt.Errorf("versión de migración repetida: %s", m[1])
		}
		vistas[m[1]] = true
		b, err := fs.ReadFile(archivos, n)
		if err != nil {
			return nil, fmt.Errorf("leer %s: %w", n, err)
		}
		suma := sha256.Sum256(b)
		out = append(out, Migracion{Version: m[1], Nombre: m[2], SQL: string(b), SHA256: hex.EncodeToString(suma[:])})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	if len(out) == 0 {
		return nil, errors.New("no hay migraciones")
	}
	return out, nil
}

// Ultima devuelve la versión más alta embebida (la que la API exige).
func Ultima(ms []Migracion) string { return ms[len(ms)-1].Version }

// Resultado informa qué se aplicó.
type Resultado struct {
	Aplicadas   []string
	YaAplicadas []string
}

const bloqueo = 7_324_011 // clave del advisory lock de migraciones

// Aplicar corre las migraciones pendientes con la conexión del rol dueño.
func Aplicar(ctx context.Context, conn *pgx.Conn, ms []Migracion) (Resultado, error) {
	var res Resultado
	if err := verificarRolDueno(ctx, conn); err != nil {
		return res, err
	}
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", bloqueo); err != nil {
		return res, fmt.Errorf("tomar el bloqueo de migraciones: %w", err)
	}
	defer func() { _, _ = conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock($1)", bloqueo) }()

	if _, err := conn.Exec(ctx, `
		CREATE SCHEMA IF NOT EXISTS vc_meta;
		REVOKE ALL ON SCHEMA vc_meta FROM PUBLIC;
		CREATE TABLE IF NOT EXISTS vc_meta.migraciones (
			version     text        PRIMARY KEY CHECK (version ~ '^[0-9]{4}$'),
			nombre      text        NOT NULL,
			sha256      text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
			aplicada_en timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return res, fmt.Errorf("preparar vc_meta.migraciones: %w", err)
	}
	aplicadas := map[string]string{}
	filas, err := conn.Query(ctx, "SELECT version, sha256 FROM vc_meta.migraciones")
	if err != nil {
		return res, fmt.Errorf("leer migraciones aplicadas: %w", err)
	}
	for filas.Next() {
		var v, s string
		if err := filas.Scan(&v, &s); err != nil {
			filas.Close()
			return res, fmt.Errorf("leer migraciones aplicadas: %w", err)
		}
		aplicadas[v] = s
	}
	filas.Close()
	if err := filas.Err(); err != nil {
		return res, fmt.Errorf("leer migraciones aplicadas: %w", err)
	}
	// Antes de aplicar nada: un binario viejo no toca una base más nueva (H7).
	for v := range aplicadas {
		if !contiene(ms, v) {
			return res, fmt.Errorf("la base tiene la migración %s que este binario no conoce: binario viejo", v)
		}
	}
	for _, m := range ms {
		if suma, ok := aplicadas[m.Version]; ok {
			if suma != m.SHA256 {
				return res, fmt.Errorf("la migración %s ya aplicada cambió (sha256 distinto): no se editan migraciones aplicadas, se agrega una nueva", m.Version)
			}
			res.YaAplicadas = append(res.YaAplicadas, m.Version)
			continue
		}
		if err := aplicarUna(ctx, conn, m); err != nil {
			return res, err
		}
		res.Aplicadas = append(res.Aplicadas, m.Version)
	}
	return res, nil
}

func aplicarUna(ctx context.Context, conn *pgx.Conn, m Migracion) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("migración %s: %w", m.Version, err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	// Sin argumentos pgx usa el protocolo simple: admite varias sentencias.
	if _, err := tx.Exec(ctx, m.SQL); err != nil {
		return fmt.Errorf("migración %s_%s: %w", m.Version, m.Nombre, err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO vc_meta.migraciones (version, nombre, sha256) VALUES ($1, $2, $3)",
		m.Version, m.Nombre, m.SHA256); err != nil {
		return fmt.Errorf("registrar migración %s: %w", m.Version, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("confirmar migración %s: %w", m.Version, err)
	}
	return nil
}

// verificarRolDueno impide migrar como superusuario (las tablas quedarían de
// un rol que saltea RLS siempre), con BYPASSRLS o con el rol de la API.
func verificarRolDueno(ctx context.Context, conn *pgx.Conn) error {
	var rol string
	var super, bypass bool
	err := conn.QueryRow(ctx,
		"SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user").Scan(&rol, &super, &bypass)
	if err != nil {
		return fmt.Errorf("leer el rol del migrador: %w", err)
	}
	switch {
	case rol == RolAPI:
		return errors.New("`api migrar` no puede correr con el rol de la API: usar DB_URL_DUENO (vc_dueno)")
	case super:
		return fmt.Errorf("`api migrar` no puede correr como superusuario (%s): usar el rol dueño vc_dueno", rol)
	case bypass:
		return fmt.Errorf("el rol dueño %s no puede tener BYPASSRLS", rol)
	}
	return nil
}

func contiene(ms []Migracion, v string) bool {
	for _, m := range ms {
		if m.Version == v {
			return true
		}
	}
	return false
}
