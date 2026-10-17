package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
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

const claveGemini = "AIzaSy-clave-gemini-NO-DEBE-VERSE"

func TestProveedoresRealesT13(t *testing.T) {
	m := base()
	m["PROVEEDOR_STT"], m["PROVEEDOR_TTS"], m["PROVEEDOR_LLM"], m["PROVEEDOR_WHATSAPP"] = "navegador", "navegador", "gemini", "enlace"
	m["GEMINI_API_KEY"] = claveGemini
	c, err := Cargar(entorno(m), Servir)
	if err != nil {
		t.Fatal(err)
	}
	if c.Gemini.Clave.Revelar() != claveGemini || c.Gemini.Modelo != "" || c.Gemini.Reintentos != 2 {
		t.Fatalf("gemini: %+v", c.Gemini)
	}
	var log bytes.Buffer
	slog.New(slog.NewJSONHandler(&log, nil)).Info("arranque", "config", c)
	if strings.Contains(log.String()+fmt.Sprintf("%+v %#v", c, c), claveGemini) {
		t.Fatal("la clave de Gemini aparece en el log o en el formato")
	}

	// Archivo de clave (secreto de Docker).
	delete(m, "GEMINI_API_KEY")
	archivo := t.TempDir() + "/gemini"
	if err := os.WriteFile(archivo, []byte(claveGemini+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	m["GEMINI_API_KEY_FILE"] = archivo
	if c, err = Cargar(entorno(m), Servir); err != nil || c.Gemini.Clave.Revelar() != claveGemini {
		t.Fatalf("archivo: %v", err)
	}

	casos := map[string]func(map[string]string){
		"sin clave":         func(m map[string]string) { delete(m, "GEMINI_API_KEY_FILE") },
		"las dos claves":    func(m map[string]string) { m["GEMINI_API_KEY"] = claveGemini },
		"archivo ausente":   func(m map[string]string) { m["GEMINI_API_KEY_FILE"] = archivo + ".no" },
		"llm navegador":     func(m map[string]string) { m["PROVEEDOR_LLM"] = "navegador" },
		"stt gemini":        func(m map[string]string) { m["PROVEEDOR_STT"] = "gemini" },
		"whatsapp twilio":   func(m map[string]string) { m["PROVEEDOR_WHATSAPP"] = "twilio" },
		"reintentos de más": func(m map[string]string) { m["GEMINI_REINTENTOS"] = "9" },
	}
	for nombre, cambiar := range casos {
		mm := map[string]string{}
		for k, v := range m {
			mm[k] = v
		}
		cambiar(mm)
		_, err := Cargar(entorno(mm), Servir)
		if err == nil {
			t.Errorf("%s: se esperaba error", nombre)
		} else if strings.Contains(err.Error(), claveGemini) {
			t.Errorf("%s: el error muestra la clave", nombre)
		}
	}
}

// En producción los reales se aceptan; los falsos no.
func TestProduccionAceptaReales(t *testing.T) {
	m := map[string]string{
		"ENTORNO": "produccion", "ALMACEN": "postgres", "CLAVE_HMAC": "x",
		"DB_URL":        "postgres://vc_api:x@db/vc?sslmode=verify-full",
		"PROVEEDOR_STT": "navegador", "PROVEEDOR_TTS": "navegador", "PROVEEDOR_LLM": "gemini", "PROVEEDOR_WHATSAPP": "enlace",
		"GEMINI_API_KEY": claveGemini,
	}
	if _, err := Cargar(entorno(m), Servir); err != nil {
		t.Fatal(err)
	}
	m["GEMINI_URL_BASE"] = "http://127.0.0.1:9/v1beta"
	if _, err := Cargar(entorno(m), Servir); err == nil {
		t.Fatal("producción con GEMINI_URL_BASE http")
	}
}

func TestOrigenesPublicosYURLMedios(t *testing.T) {
	e := base()
	e["ORIGENES_PUBLICOS"] = " https://videocotizacion.vercel.app, ,https://panel.test:8443"
	e["URL_MEDIOS"] = "wss://api.test/"
	c, err := Cargar(entorno(e), Servir)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.OrigenesPublicos) != 2 || c.OrigenesPublicos[1] != "https://panel.test:8443" || c.URLMedios != "wss://api.test" {
		t.Fatalf("inesperado: %q %q", c.OrigenesPublicos, c.URLMedios)
	}
	for variable, valor := range map[string]string{
		"ORIGENES_PUBLICOS": "http://inseguro.test",
		"URL_MEDIOS":        "wss://api.test/v1",
	} {
		e := base()
		e[variable] = valor
		if _, err := Cargar(entorno(e), Servir); err == nil || !strings.Contains(err.Error(), variable) {
			t.Fatalf("%s=%q debía fallar: %v", variable, valor, err)
		}
	}
}
