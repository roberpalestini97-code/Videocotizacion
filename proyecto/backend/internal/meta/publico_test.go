package meta

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestRutasPublicasCoincidenConElContrato(t *testing.T) {
	mux := http.NewServeMux()
	Registrar(mux)
	casos := []struct {
		ruta  string
		clave string
	}{
		{"/v1/version", "api"},
		{"/v1/textos", "textos"},
		{"/v1/politicas/retencion", "reglas"},
	}
	for _, c := range casos {
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, c.ruta, nil))
		if rr.Code != 200 || rr.Header().Get("Content-Type") != "application/json" {
			t.Fatalf("%s = %d %s", c.ruta, rr.Code, rr.Header().Get("Content-Type"))
		}
		var cuerpo map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
			t.Fatalf("%s json: %v", c.ruta, err)
		}
		if _, ok := cuerpo[c.clave]; !ok {
			t.Fatalf("%s sin %s: %s", c.ruta, c.clave, rr.Body)
		}
	}
}

func TestVersionEsLaDelContrato(t *testing.T) {
	fuente, err := os.ReadFile(filepath.Join("..", "..", "..", "contracts", "fuente", "base.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	m := regexp.MustCompile(`export const VERSION = '([^']+)'`).FindSubmatch(fuente)
	if len(m) != 2 {
		t.Fatal("no encontré VERSION en contracts/fuente/base.mjs")
	}
	contrato := string(m[1])
	if VersionContrato != contrato {
		t.Fatalf("VersionContrato %q != fuente %q", VersionContrato, contrato)
	}
	v := version()
	if v.API != contrato || v.EstadoAPI != "borrador" || v.EventosSesion.Estado != "borrador" {
		t.Fatalf("%+v", v)
	}
	if v.Deprecaciones == nil {
		t.Fatal("deprecaciones tiene que serializar como []")
	}
	if !tablaRetencion().AValidarConAbogado || len(tablaRetencion().Reglas) != 9 {
		t.Fatal("la tabla de retención no coincide con el ejemplo del contrato")
	}
	if catalogoTextos().Idioma != "es-AR" || catalogoTextos().Textos["widget.boton_iniciar"] == "" {
		t.Fatal("catálogo incompleto")
	}
}
