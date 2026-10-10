package main

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"videocotizacion/backend/internal/almacen/pgprueba"
)

func correr(args []string, env map[string]string) (int, string) {
	var salida bytes.Buffer
	codigo := ejecutar(context.Background(), args, func(k string) string { return env[k] }, &salida)
	return codigo, salida.String()
}

func TestComandoInvalido(t *testing.T) {
	for _, args := range [][]string{nil, {"otro"}, {"servir", "de-mas"}} {
		if c, s := correr(args, nil); c != 2 || !strings.Contains(s, "uso:") {
			t.Fatalf("%v → %d %q", args, c, s)
		}
	}
}

// ADR 0001, verificación: con ENTORNO=produccion y almacén en memoria o algún
// proveedor falso, `api servir` termina con código distinto de 0 y mensaje claro.
func TestServirEnProduccionInseguraTerminaConError(t *testing.T) {
	env := map[string]string{
		"ENTORNO": "produccion", "ALMACEN": "memoria",
		"PROVEEDOR_STT": "falso", "PROVEEDOR_LLM": "falso", "PROVEEDOR_TTS": "falso", "PROVEEDOR_WHATSAPP": "falso",
	}
	c, s := correr([]string{"servir"}, env)
	if c != 1 || !strings.Contains(s, "producción no puede usar ALMACEN=memoria") || !strings.Contains(s, "PROVEEDOR_LLM=falso") {
		t.Fatalf("código %d, salida %s", c, s)
	}
	if c, s := correr([]string{"servir"}, map[string]string{}); c != 1 || !strings.Contains(s, "falta ENTORNO") {
		t.Fatalf("sin ENTORNO: %d %s", c, s)
	}
	if c, s := correr([]string{"migrar"}, map[string]string{"ENTORNO": "desarrollo"}); c != 1 || !strings.Contains(s, "DB_URL_DUENO") {
		t.Fatalf("migrar sin dueño: %d %s", c, s)
	}
}

func TestMigrarYRetencionContraPostgres(t *testing.T) {
	base := pgprueba.Preparar(t)
	env := map[string]string{"ENTORNO": "desarrollo", "DB_URL_DUENO": base.URLDueno.Revelar()}
	if c, s := correr([]string{"migrar"}, env); c != 0 {
		t.Fatalf("api migrar: %d %s", c, s)
	}
	env = map[string]string{"ENTORNO": "desarrollo", "ALMACEN": "postgres", "DB_URL": base.URLAPI.Revelar()}
	if c, s := correr([]string{"retencion"}, env); c != 0 {
		t.Fatalf("api retencion: %d %s", c, s)
	}
	// Migrar con el rol de la API: se niega.
	env = map[string]string{"ENTORNO": "desarrollo", "DB_URL_DUENO": base.URLAPI.Revelar()}
	c, s := correr([]string{"migrar"}, env)
	if c != 1 || !strings.Contains(s, "rol de la API") || strings.Contains(s, pgprueba.ClaveRoles) {
		t.Fatalf("migrar con vc_api: %d %s", c, s)
	}
}
