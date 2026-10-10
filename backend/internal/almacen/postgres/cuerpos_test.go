package postgres_test

import (
	"io/fs"
	"regexp"
	"strings"
	"testing"

	"videocotizacion/backend/internal/almacen/postgres"
	"videocotizacion/backend/migrations"
)

var reFuncion = regexp.MustCompile(`(?s)CREATE (?:OR REPLACE )?FUNCTION (vc\.[a-z_]+)\(.*?\bAS \$\$(.*?)\$\$`)

// H7 de T04b1: la huella de cada cuerpo SECURITY DEFINER que verifica el
// arranque es la del texto de las migraciones (una migración que cambie un
// cuerpo obliga a actualizar CuerposDefiners a conciencia).
func TestCuerposDefinersIgualALasMigraciones(t *testing.T) {
	cuerpos := map[string]string{}
	err := fs.WalkDir(migrations.Archivos, ".", func(ruta string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || strings.HasSuffix(ruta, ".revertir.sql") {
			return err
		}
		b, err := fs.ReadFile(migrations.Archivos, ruta)
		for _, m := range reFuncion.FindAllStringSubmatch(string(b), -1) {
			cuerpos[m[1]] = m[2]
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(postgres.CuerposDefiners) != len(postgres.DefinersPermitidos) {
		t.Fatalf("cada definer permitido necesita su cuerpo: %d cuerpos, %d definers", len(postgres.CuerposDefiners), len(postgres.DefinersPermitidos))
	}
	for firma, huella := range postgres.CuerposDefiners {
		nombre := firma[:strings.Index(firma, "(")]
		cuerpo, ok := cuerpos[nombre]
		if !ok {
			t.Errorf("%s no está en las migraciones", nombre)
			continue
		}
		if got := postgres.HuellaCuerpo(cuerpo); got != huella {
			t.Errorf("%q: %q,", firma, got)
		}
	}
}
