package servidor

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSSoloLoopback(t *testing.T) {
	h := Manejador(Opciones{CuerpoMaxBytes: 1024, CORSLoopback: true, Log: slog.New(slog.DiscardHandler)}, nil)
	preflight := func(origin string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodOptions, "/v1/sesiones", nil)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		r.Header.Set("Access-Control-Request-Method", "POST")
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		return rr
	}
	ok := preflight("http://localhost:5173")
	if ok.Code != http.StatusNoContent || ok.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("loopback: %d %v", ok.Code, ok.Header())
	}
	if !strings.Contains(ok.Header().Get("Access-Control-Allow-Headers"), "X-VC-Clave-Publica") {
		t.Fatalf("faltan encabezados: %s", ok.Header().Get("Access-Control-Allow-Headers"))
	}
	ajeno := preflight("https://evil.test")
	if ajeno.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("no debía abrir CORS: %v", ajeno.Header())
	}
	cerrado := Manejador(Opciones{CuerpoMaxBytes: 1024, Log: slog.New(slog.DiscardHandler)}, nil)
	r := httptest.NewRequest(http.MethodOptions, "/v1/sesiones", nil)
	r.Header.Set("Origin", "http://127.0.0.1:5173")
	rr := httptest.NewRecorder()
	cerrado.ServeHTTP(rr, r)
	if rr.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("sin el flag no hay CORS")
	}
}
