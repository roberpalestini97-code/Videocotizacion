// Package arquitectura vigila las dependencias entre paquetes (ADR 0001,
// G05): el dominio no importa infraestructura, solo arranque conoce los
// adaptadores concretos y pgx queda encerrado en la capa de persistencia.
// Todo paquete nuevo tiene que declararse en la tabla: si no, la prueba falla.
package arquitectura

import (
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const modulo = "videocotizacion/backend/"

// permitidos: paquete → paquetes internos que puede importar (código que no
// es de prueba). "pgx" habilita github.com/jackc/pgx/v5/...
var permitidos = map[string][]string{
	// Núcleo puro: sin red, sin base, sin adaptadores.
	"internal/errores":     {},
	"internal/secreto":     {},
	"internal/reloj":       {},
	"internal/dominio":     {"internal/errores"},
	"internal/cotizador":   {"internal/dominio", "internal/errores"},
	"internal/almacen":     {"internal/dominio", "internal/errores"},
	"internal/proveedores": {},
	// Servicios de aplicación (solo puertos).
	"internal/retencion": {"internal/almacen", "internal/reloj"},
	"internal/salud":     {},
	"internal/servidor":  {"internal/errores"},
	"internal/config":    {"internal/secreto"},
	// Adaptadores.
	"internal/proveedores/falsos": {"internal/errores", "internal/proveedores"},
	"internal/almacen/memoria":    {"internal/almacen", "internal/dominio", "internal/errores"},
	"internal/almacen/postgres":   {"internal/almacen", "internal/dominio", "internal/errores", "internal/secreto", "pgx"},
	"internal/migrador":           {"pgx"},
	"migrations":                  {},
	// Apoyo de pruebas (los importan solo archivos _test.go).
	"internal/almacen/pgprueba":    {"internal/migrador", "internal/secreto", "migrations", "pgx"},
	"internal/almacen/conformidad": {"internal/almacen", "internal/dominio", "internal/errores"},
	// Cableado.
	"internal/arranque": {
		"internal/almacen", "internal/almacen/memoria", "internal/almacen/postgres", "internal/config",
		"internal/migrador", "internal/proveedores", "internal/proveedores/falsos", "internal/reloj",
		"internal/retencion", "internal/salud", "internal/servidor", "migrations", "pgx",
	},
	"cmd/api":               {"internal/arranque", "internal/config"},
	"internal/arquitectura": {},
}

// nucleo no puede importar estos paquetes de la librería estándar.
var nucleo = map[string]bool{
	"internal/errores": true, "internal/secreto": true, "internal/reloj": true, "internal/dominio": true,
	"internal/cotizador": true, "internal/almacen": true, "internal/proveedores": true,
}

var stdProhibidaEnNucleo = []string{"net", "database/sql", "os/exec", "syscall", "unsafe", "plugin"}

func raiz(t *testing.T) string {
	t.Helper()
	d, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(d, "go.mod")); err != nil {
		t.Fatalf("no encuentro go.mod en %s", d)
	}
	return d
}

// importsPorPaquete devuelve, por paquete, los imports de archivos que no son
// de prueba.
func importsPorPaquete(t *testing.T, base string) map[string]map[string]bool {
	t.Helper()
	out := map[string]map[string]bool{}
	fset := token.NewFileSet()
	err := filepath.WalkDir(base, func(ruta string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && (strings.HasPrefix(d.Name(), ".") || d.Name() == "testdata") && ruta != base {
			return filepath.SkipDir
		}
		if d.IsDir() || !strings.HasSuffix(ruta, ".go") {
			return nil
		}
		rel, _ := filepath.Rel(base, filepath.Dir(ruta))
		rel = filepath.ToSlash(rel)
		if out[rel] == nil {
			out[rel] = map[string]bool{}
		}
		if strings.HasSuffix(ruta, "_test.go") {
			return nil
		}
		f, err := parser.ParseFile(fset, ruta, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, imp := range f.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			out[rel][p] = true
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestDependenciasEntrePaquetes(t *testing.T) {
	for _, v := range violaciones(importsPorPaquete(t, raiz(t))) {
		t.Error(v)
	}
}

func violaciones(paquetes map[string]map[string]bool) []string {
	var out []string
	nombres := make([]string, 0, len(paquetes))
	for p := range paquetes {
		nombres = append(nombres, p)
	}
	sort.Strings(nombres)
	for _, pkg := range nombres {
		ok, declarado := permitidos[pkg]
		if !declarado {
			out = append(out, "el paquete "+pkg+" no está en la tabla de arquitectura: declararlo con sus dependencias permitidas")
			continue
		}
		permit := map[string]bool{}
		for _, p := range ok {
			permit[p] = true
		}
		imps := make([]string, 0, len(paquetes[pkg]))
		for imp := range paquetes[pkg] {
			imps = append(imps, imp)
		}
		sort.Strings(imps)
		for _, imp := range imps {
			switch {
			case strings.HasPrefix(imp, modulo):
				if !permit[strings.TrimPrefix(imp, modulo)] {
					out = append(out, pkg+" no puede importar "+imp)
				}
			case strings.HasPrefix(imp, "github.com/jackc/pgx/"):
				if !permit["pgx"] {
					out = append(out, pkg+" no puede importar pgx ("+imp+"): la base se usa solo desde almacen/postgres, migrador y arranque")
				}
			case strings.Contains(strings.SplitN(imp, "/", 2)[0], "."):
				out = append(out, pkg+" importa una dependencia externa no declarada: "+imp)
			case nucleo[pkg]:
				for _, prohibido := range stdProhibidaEnNucleo {
					if imp == prohibido || strings.HasPrefix(imp, prohibido+"/") {
						out = append(out, "el núcleo "+pkg+" no puede importar "+imp+" (infraestructura)")
					}
				}
			}
		}
	}
	return out
}

// La propia regla tiene que detectar una violación (prueba de la prueba).
func TestLaReglaDetectaViolaciones(t *testing.T) {
	dir := t.TempDir()
	escribir := func(ruta, contenido string) {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(dir, ruta)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, ruta), []byte(contenido), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	escribir("internal/dominio/x.go", "package dominio\nimport (\n_ \"net/http\"\n_ \""+modulo+"internal/almacen/postgres\"\n)\n")
	escribir("internal/nuevo/y.go", "package nuevo\n")
	escribir("internal/servidor/z.go", "package servidor\nimport _ \"github.com/jackc/pgx/v5\"\n")
	v := violaciones(importsPorPaquete(t, dir))
	quiero := []string{
		"internal/dominio no puede importar " + modulo + "internal/almacen/postgres",
		"el núcleo internal/dominio no puede importar net/http (infraestructura)",
		"el paquete internal/nuevo no está en la tabla",
		"internal/servidor no puede importar pgx",
	}
	todo := strings.Join(v, "\n")
	for _, q := range quiero {
		if !strings.Contains(todo, q) {
			t.Errorf("la regla no detectó: %s\nviolaciones: %s", q, todo)
		}
	}
}
