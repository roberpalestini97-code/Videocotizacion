package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestComprobar(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer ok.Close()
	mal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(503) }))
	defer mal.Close()
	redir := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/otra", http.StatusFound)
	}))
	defer redir.Close()

	casos := []struct {
		nombre, url string
		falla       bool
	}{
		{"2xx pasa", ok.URL, false},
		{"503 falla", mal.URL, true},
		{"redirección no se sigue y falla", redir.URL, true},
		{"destino externo rechazado", "http://example.org/", true},
		{"https rechazado", "https://127.0.0.1/", true},
		{"url rota", "http://[::1", true},
	}
	for _, c := range casos {
		err := comprobar(context.Background(), c.url)
		if (err != nil) != c.falla {
			t.Errorf("%s: err=%v, falla esperada=%v", c.nombre, err, c.falla)
		}
	}
}
