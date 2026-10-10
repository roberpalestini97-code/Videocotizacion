package rutas

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/dominio"
)

func TestTopeCrearSesion(t *testing.T) {
	f := nuevaFixtureSesion(t)
	enc := f.desafioResuelto(t)
	antes := f.cantidad(t)
	enlaces := f.sembrarEnlaces(t, 12)
	const ipFija = "192.0.2.10:1234"
	const clavePublica = "vc_pub_desconocida_tasa"

	for i := range 10 {
		rr := f.postCrear(ipFija, f.sec, true, "", cuerpoAlta(enlaces[i]))
		if rr.Code != http.StatusCreated {
			t.Fatalf("pedido %d por IP: %d %s", i+1, rr.Code, rr.Body.String())
		}
	}
	rr := f.postCrear(ipFija, f.sec, true, "", cuerpoAlta(enlaces[10]))
	exigirTasa(t, rr)
	if n := f.cantidad(t); n != antes+10 {
		t.Fatalf("el 429 de IP creó sesión: %d", n)
	}

	for i := range 10 {
		rr = f.postCrear("192.0.2."+strconv.Itoa(20+i)+":1234", f.sec, true, "", f.cuerpo("3d"))
		if rr.Code != http.StatusCreated {
			t.Fatalf("pedido %d por enlace: %d %s", i+1, rr.Code, rr.Body.String())
		}
	}
	rr = f.postCrear("192.0.2.40:1234", f.sec, true, "", f.cuerpo("3d"))
	exigirTasa(t, rr)
	if n := f.cantidad(t); n != antes+20 {
		t.Fatalf("el 429 de enlace creó sesión: %d", n)
	}

	for i := range 10 {
		rr = f.postCrear("192.0.2."+strconv.Itoa(50+i)+":1234", clavePublica, false, "", "{")
		if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_ausente" {
			t.Fatalf("clave desconocida %d: %d %s", i+1, rr.Code, rr.Body.String())
		}
	}
	rr = f.postCrear("192.0.2.70:1234", clavePublica, false, enc, "{")
	exigirTasa(t, rr)
	if strings.Contains(rr.Body.String(), clavePublica) {
		t.Fatalf("el 429 devolvió la clave: %s", rr.Body.String())
	}
	if n := f.cantidad(t); n != antes+20 {
		t.Fatalf("el 429 de clave creó sesión: %d", n)
	}

	rr = f.postCrear("192.0.2.80:1234", f.sec, true, "", cuerpoAlta(enlaces[10]))
	if rr.Code != http.StatusCreated {
		t.Fatalf("bajo el tope: %d %s", rr.Code, rr.Body.String())
	}
	rr = f.postCrear("192.0.2.81:1234", f.pub, false, enc, cuerpoAlta(enlaces[11]))
	if rr.Code != http.StatusCreated {
		t.Fatalf("el 429 consumió el desafío: %d %s", rr.Code, rr.Body.String())
	}
}

func (f *fixSesion) sembrarEnlaces(t *testing.T, n int) []string {
	t.Helper()
	out := make([]string, n)
	ahora := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	for i := range out {
		id, err := dominio.NuevoIDPublico()
		if err != nil {
			t.Fatal(err)
		}
		if err := f.a.GuardarEnlace(t.Context(), f.tenant, dominio.Enlace{
			IDPublico: id, AsesorID: f.asesor, CreadoEn: ahora,
		}); err != nil {
			t.Fatal(err)
		}
		out[i] = id
	}
	return out
}

func cuerpoAlta(id string) string {
	return `{"enlace":"` + id + `","modo_avatar":"3d"}`
}

func (f *fixSesion) postCrear(ip, clave string, secreta bool, desafioHdr, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/sesiones", strings.NewReader(body))
	r.RemoteAddr = ip
	r.Header.Set("Content-Type", "application/json")
	if secreta {
		r.Header.Set("Authorization", "Bearer "+clave)
	} else if clave != "" {
		r.Header.Set("X-VC-Clave-Publica", clave)
	}
	if !secreta && desafioHdr != "" {
		r.Header.Set("X-Desafio", desafioHdr)
		r.Header.Set("Origin", f.origen)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func exigirTasa(t *testing.T, rr *httptest.ResponseRecorder) {
	t.Helper()
	if rr.Code != http.StatusTooManyRequests || codigoDe(t, rr) != "limite_de_tasa" {
		t.Fatalf("429: %d %s", rr.Code, rr.Body.String())
	}
	n, err := strconv.Atoi(rr.Header().Get("Retry-After"))
	if err != nil || n < 1 || n > 60 {
		t.Fatalf("Retry-After: %q", rr.Header().Get("Retry-After"))
	}
}
