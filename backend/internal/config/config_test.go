package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"videocotizacion/backend/internal/secreto"
)

const claveAPI = "clave-api-NO-DEBE-VERSE"
const claveDueno = "clave-dueno-NO-DEBE-VERSE"

func entorno(pares map[string]string) Getenv {
	return func(k string) string { return pares[k] }
}

func base() map[string]string {
	return map[string]string{
		"ENTORNO": "desarrollo", "ALMACEN": "memoria",
		"PROVEEDOR_STT": "falso", "PROVEEDOR_LLM": "falso", "PROVEEDOR_TTS": "falso", "PROVEEDOR_WHATSAPP": "falso",
	}
}

func TestDesarrolloConFalsosYMemoria(t *testing.T) {
	c, err := Cargar(entorno(base()), Servir)
	if err != nil {
		t.Fatal(err)
	}
	if c.Direccion != ":8080" || c.CuerpoMaxBytes != 64<<10 || c.LecturaEncabezados.Seconds() != 5 {
		t.Fatalf("valores por defecto inesperados: %+v", c)
	}
}

func TestFaltantesFallan(t *testing.T) {
	casos := map[string]func(map[string]string){
		"sin ENTORNO":           func(m map[string]string) { delete(m, "ENTORNO") },
		"ENTORNO raro":          func(m map[string]string) { m["ENTORNO"] = "prod" },
		"sin ALMACEN":           func(m map[string]string) { delete(m, "ALMACEN") },
		"postgres sin DB_URL":   func(m map[string]string) { m["ALMACEN"] = "postgres" },
		"sin proveedor":         func(m map[string]string) { delete(m, "PROVEEDOR_LLM") },
		"proveedor real":        func(m map[string]string) { m["PROVEEDOR_TTS"] = "otro" },
		"timeout inválido":      func(m map[string]string) { m["HTTP_TIMEOUT_LECTURA"] = "mucho" },
		"cuerpo fuera de rango": func(m map[string]string) { m["HTTP_CUERPO_MAX_BYTES"] = "1" },
		"misma credencial": func(m map[string]string) {
			m["ALMACEN"], m["DB_URL"], m["DB_URL_DUENO"] = "postgres", "postgres://x@h/db", "postgres://x@h/db"
		},
	}
	for nombre, mutar := range casos {
		t.Run(nombre, func(t *testing.T) {
			m := base()
			mutar(m)
			if _, err := Cargar(entorno(m), Servir); err == nil {
				t.Fatal("debía fallar")
			}
		})
	}
}

// H4: producción nunca arranca con memoria ni con proveedores falsos.
func TestProduccionProhibeMemoriaYFalsos(t *testing.T) {
	m := base()
	m["ENTORNO"] = "produccion"
	_, err := Cargar(entorno(m), Servir)
	if err == nil {
		t.Fatal("producción con memoria y falsos debía fallar")
	}
	for _, esperado := range []string{"ALMACEN=memoria", "PROVEEDOR_STT=falso", "PROVEEDOR_LLM=falso", "PROVEEDOR_TTS=falso", "PROVEEDOR_WHATSAPP=falso"} {
		if !strings.Contains(err.Error(), esperado) {
			t.Errorf("el error no menciona %s: %v", esperado, err)
		}
	}
	m["ALMACEN"], m["DB_URL"] = "postgres", "postgres://vc_api:"+claveAPI+"@db/vc?sslmode=disable"
	_, err = Cargar(entorno(m), Servir)
	if err == nil || !strings.Contains(err.Error(), "sslmode=verify-full") {
		t.Fatalf("producción sin TLS hacia la base debía fallar: %v", err)
	}
	if strings.Contains(err.Error(), claveAPI) {
		t.Fatal("el error de configuración filtró la contraseña")
	}
}

func TestMigrarExigeDueno(t *testing.T) {
	m := map[string]string{"ENTORNO": "desarrollo"}
	if _, err := Cargar(entorno(m), Migrar); err == nil || !strings.Contains(err.Error(), "DB_URL_DUENO") {
		t.Fatalf("migrar sin DB_URL_DUENO: %v", err)
	}
	m["DB_URL_DUENO"] = "postgres://vc_dueno@h/db"
	if _, err := Cargar(entorno(m), Migrar); err != nil {
		t.Fatal(err)
	}
	if _, err := Cargar(entorno(m), Comando("otro")); err == nil {
		t.Fatal("comando desconocido debía fallar")
	}
}

func TestSslmodeEnProduccion(t *testing.T) {
	for dsn, ok := range map[string]bool{
		"postgres://u:p@h/db?sslmode=verify-full":               true,
		"host=h user=u sslmode=verify-full":                     true,
		"postgres://u:p@h/db?sslmode=verify-ca":                 false, // no valida el nombre del servidor
		"host=h sslmode=verify-full sslmode=disable":            false, // pgx usaría el último
		"postgres://u@h/db?sslmode=verify-full&sslmode=disable": false,
		"postgres://u@h/db":                                     false,
		"host=h":                                                false,
		"postgres://u@h/db?sslmode=require":                     false,
	} {
		errs := exigirTLS("DB_URL", secreto.Nuevo(dsn))
		if (len(errs) == 0) != ok {
			t.Errorf("%q: aceptado=%v, quería %v (%v)", dsn, len(errs) == 0, ok, errs)
		}
	}
}

// H1: la configuración formateada de cualquier forma no revela secretos.
func TestConfigNoRevelaSecretos(t *testing.T) {
	m := base()
	m["ALMACEN"] = "postgres"
	m["DB_URL"] = "postgres://vc_api:" + claveAPI + "@db/vc"
	m["DB_URL_DUENO"] = "postgres://vc_dueno:" + claveDueno + "@db/vc"
	c, err := Cargar(entorno(m), Servir)
	if err != nil {
		t.Fatal(err)
	}
	var log bytes.Buffer
	slog.New(slog.NewJSONHandler(&log, nil)).Info("arranque", "config", c)
	slog.New(slog.NewTextHandler(&log, nil)).Info("arranque", "config", c)
	j, _ := json.Marshal(c)
	salidas := []string{
		fmt.Sprintf("%v", c), fmt.Sprintf("%+v", c), fmt.Sprintf("%#v", c), fmt.Sprint(c),
		fmt.Sprint(c.DBURL), string(j), log.String(),
	}
	for i, s := range salidas {
		if strings.Contains(s, claveAPI) || strings.Contains(s, claveDueno) {
			t.Fatalf("salida %d revela un secreto: %s", i, s)
		}
	}
	if c.DBURL.Revelar() != m["DB_URL"] {
		t.Fatal("Revelar debe devolver el valor real")
	}
}
