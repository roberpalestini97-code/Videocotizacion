package servidor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/errores"
)

func opciones(listo func(context.Context) error, log *bytes.Buffer) Opciones {
	return Opciones{
		Direccion: ":0", LecturaEncabezados: time.Second, Lectura: time.Second, Escritura: time.Second,
		Inactividad: time.Second, CuerpoMaxBytes: 1024, EncabezadosMax: 8 << 10, Listo: listo,
		Log: slog.New(slog.NewJSONHandler(log, nil)),
	}
}

func pedir(t *testing.T, h http.Handler, metodo, ruta string, cuerpo io.Reader) (*httptest.ResponseRecorder, errores.Problema) {
	t.Helper()
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(metodo, ruta, cuerpo))
	var p errores.Problema
	if strings.HasPrefix(rr.Header().Get("Content-Type"), "application/problem+json") {
		if err := json.Unmarshal(rr.Body.Bytes(), &p); err != nil {
			t.Fatalf("problem+json inválido: %v", err)
		}
	}
	return rr, p
}

func TestTiemposYLimitesDelServidor(t *testing.T) {
	s := Nuevo(opciones(nil, &bytes.Buffer{}))
	if s.ReadHeaderTimeout == 0 || s.ReadTimeout == 0 || s.WriteTimeout == 0 || s.IdleTimeout == 0 || s.MaxHeaderBytes == 0 {
		t.Fatalf("faltan tiempos o límites: %+v", s)
	}
}

func TestSaludYListo(t *testing.T) {
	var log bytes.Buffer
	listo := true
	h := Manejador(opciones(func(context.Context) error {
		if listo {
			return nil
		}
		return errors.New("base caída: host=db password=NO-DEBE-SALIR")
	}, &log), nil)
	if rr, _ := pedir(t, h, "GET", "/salud", nil); rr.Code != 200 || !strings.Contains(rr.Body.String(), `"ok"`) {
		t.Fatalf("/salud = %d %s", rr.Code, rr.Body)
	}
	if rr, _ := pedir(t, h, "GET", "/listo", nil); rr.Code != 200 {
		t.Fatalf("/listo = %d", rr.Code)
	}
	listo = false
	rr, p := pedir(t, h, "GET", "/listo", nil)
	if rr.Code != 503 || p.Codigo != errores.ServicioNoDisponible || rr.Header().Get("Retry-After") == "" {
		t.Fatalf("/listo caído = %d %+v", rr.Code, p)
	}
	if strings.Contains(rr.Body.String(), "NO-DEBE-SALIR") || strings.Contains(rr.Body.String(), "base caída") {
		t.Fatal("la causa interna llegó al cliente")
	}
	if !strings.Contains(log.String(), p.IDTraza) {
		t.Fatal("el log debe tener el id de traza para correlacionar")
	}
	if rr.Header().Get("X-Content-Type-Options") != "nosniff" || rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("faltan encabezados de seguridad")
	}
}

func TestRutaDesconocidaEs404DelCatalogo(t *testing.T) {
	h := Manejador(opciones(nil, &bytes.Buffer{}), nil)
	for _, c := range []struct{ metodo, ruta string }{{"GET", "/v1/sesiones"}, {"POST", "/salud"}, {"DELETE", "/x"}} {
		rr, p := pedir(t, h, c.metodo, c.ruta, nil)
		if rr.Code != 404 || p.Codigo != errores.NoEncontrado || p.Type != errores.BaseTipo+"no_encontrado" {
			t.Fatalf("%s %s = %d %+v", c.metodo, c.ruta, rr.Code, p)
		}
	}
}

func TestCuerpoDemasiadoGrande(t *testing.T) {
	h := Manejador(opciones(nil, &bytes.Buffer{}), func(mux *http.ServeMux) {
		mux.HandleFunc("POST /eco", func(w http.ResponseWriter, r *http.Request) {
			if _, err := io.ReadAll(r.Body); err != nil {
				EscribirError(w, r, slog.Default(), err)
				return
			}
			w.WriteHeader(204)
		})
	})
	// Con Content-Length declarado: corta antes de leer.
	rr, p := pedir(t, h, "POST", "/eco", strings.NewReader(strings.Repeat("a", 2048)))
	if rr.Code != 413 || p.Codigo != errores.CuerpoDemasiadoGrande {
		t.Fatalf("con largo = %d %+v", rr.Code, p)
	}
	// Sin Content-Length (chunked): corta al leer.
	req := httptest.NewRequest("POST", "/eco", io.MultiReader(strings.NewReader(strings.Repeat("a", 2048))))
	req.ContentLength = -1
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req)
	if rr2.Code != 413 {
		t.Fatalf("sin largo = %d", rr2.Code)
	}
	if rr, _ := pedir(t, h, "POST", "/eco", strings.NewReader("chico")); rr.Code != 204 {
		t.Fatalf("cuerpo chico = %d", rr.Code)
	}
}

func TestPanicoEs500SinTraza(t *testing.T) {
	h := Manejador(opciones(nil, &bytes.Buffer{}), func(mux *http.ServeMux) {
		mux.HandleFunc("GET /panico", func(http.ResponseWriter, *http.Request) { panic("detalle interno secreto") })
	})
	rr, p := pedir(t, h, "GET", "/panico", nil)
	if rr.Code != 500 || p.Codigo != errores.ErrorInterno || strings.Contains(rr.Body.String(), "secreto") {
		t.Fatalf("pánico = %d %s", rr.Code, rr.Body)
	}
}
