package rutas

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/errores"
)

// TestSuiteDeAbuso es R61 y R67: los rechazos ya implementados, en una sola
// suite, con el almacén de memoria. Estas rutas no tienen proveedor, así que
// no hay llamada que contar. El costo 0 de los falsos se afirma en arranque.
func TestSuiteDeAbuso(t *testing.T) {
	t.Run("sin desafio", func(t *testing.T) {
		f := nuevaFixtureSesion(t)
		rr := f.pedir(f.pub, f.origen, "", "", f.cuerpo("3d"), false)
		if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "desafio_invalido" {
			t.Fatalf("sin desafío: %d %s", rr.Code, rr.Body)
		}
		if n := f.cantidad(t); n != 0 {
			t.Fatalf("se creó una sesión: %d", n)
		}
	})

	t.Run("origin ajeno", func(t *testing.T) {
		f := nuevaFixtureSesion(t)
		rr := f.pedir(f.pub, "https://otro.ejemplo.local", "", "", f.cuerpo("3d"), false)
		if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "origen_no_permitido" {
			t.Fatalf("origin ajeno: %d %s", rr.Code, rr.Body)
		}
		if n := f.cantidad(t); n != 0 {
			t.Fatalf("se creó una sesión: %d", n)
		}
	})

	t.Run("rafaga por ip", func(t *testing.T) {
		f := nuevaFixtureSesion(t)
		antes := f.cantidad(t)
		enlaces := f.sembrarEnlaces(t, 11)
		const ip = "192.0.2.11:1234"
		for i := range 10 {
			rr := f.postCrear(ip, f.sec, true, "", cuerpoAlta(enlaces[i]))
			if rr.Code != http.StatusCreated {
				t.Fatalf("pedido %d: %d %s", i+1, rr.Code, rr.Body)
			}
		}
		rr := f.postCrear(ip, f.sec, true, "", cuerpoAlta(enlaces[10]))
		if rr.Code != http.StatusTooManyRequests || codigoDe(t, rr) != "limite_de_tasa" || rr.Header().Get("Retry-After") == "" {
			t.Fatalf("pedido 11: %d %s", rr.Code, rr.Body)
		}
		if n := f.cantidad(t); n != antes+10 {
			t.Fatalf("apareció la sesión 11: %d", n)
		}
	})

	t.Run("silencio", func(t *testing.T) {
		f := nuevaFixtureSesion(t)
		base := time.Date(2026, 10, 9, 16, 0, 0, 0, time.UTC)
		f.relojPanel(base)
		id, _ := f.ponerEnCurso(t)
		f.relojPanel(base.Add(time.Duration(sinVozProvisorioS) * time.Second))
		if n := f.barrer(t); n != 1 {
			t.Fatalf("barrido: %d", n)
		}
		rr := f.leer(f.sec, id)
		exigirCorte(t, rr, "sin_voz", sinVozProvisorioS)
	})

	t.Run("texto y fotograma", func(t *testing.T) {
		f := nuevaFixtureSesion(t)
		srv := httptest.NewServer(f.h)
		t.Cleanup(srv.Close)
		id, _, tok := sesionConMedios(t, f, true)
		conn := enviarToken(t, dialMedios(t, srv, id, f.origen, ""), tok)
		exigirLista(t, conn, id, tok)

		escribirTexto(t, conn, 2, strings.Repeat("a", caracteresMaxPorTurno+1))
		ev := leerEvento(t, conn)
		if ev.Tipo != "error" || ev.Datos.Codigo != string(errores.ValidacionFallida) {
			t.Fatalf("texto: %+v", ev)
		}
		if strings.Contains(ev.crudo, strings.Repeat("a", caracteresMaxPorTurno+1)) {
			t.Fatal("el error ecoa el texto")
		}

		escribirBinario(t, conn, tramaFotograma(1, []byte("esto no es un jpeg")))
		ev = leerEvento(t, conn)
		if ev.Tipo != "camara.fotograma" || ev.Datos.Resultado != "descartado" || ev.Datos.Motivo != "formato" {
			t.Fatalf("fotograma: %+v", ev)
		}
	})
}
