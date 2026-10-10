package rutas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/dominio"
)

func TestLeerYCerrarSesionPanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	var secreto [20]byte
	for i := range secreto {
		secreto[i] = byte(i + 1)
	}
	cif, err := dominio.CifrarSecretoTOTP(f.claveSrv, secreto[:])
	if err != nil {
		t.Fatal(err)
	}
	reloj := time.Date(2026, 10, 8, 15, 0, 0, 0, time.UTC)
	if err := f.alm.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
		AsesorID: f.asesor, Cifrado: cif, CreadaEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}

	t.Run("get con la cookie nueva", func(t *testing.T) {
		cuando := reloj
		cookie, csrf, inact, absoluto := f.sesionTOTP(t, cuando, "192.0.2.80", secreto[:])
		f.relojPanel(cuando.Add(2 * time.Minute))
		rr := f.pedirPanel(http.MethodGet, "192.0.2.80", cookie, "")
		if rr.Code != http.StatusOK {
			t.Fatalf("estado %d: %s", rr.Code, rr.Body.String())
		}
		if rr.Header().Get("Set-Cookie") != "" {
			t.Fatal("GET movió la cookie")
		}
		var cuerpo struct {
			Asesor struct {
				ID     string `json:"asesor_id"`
				Nombre string `json:"nombre_visible"`
				Rol    string `json:"rol"`
			} `json:"asesor"`
			CSRF     string `json:"csrf_token"`
			Inact    string `json:"vence_inactividad_en"`
			Absoluto string `json:"vence_absoluto_en"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
			t.Fatal(err)
		}
		if cuerpo.CSRF != csrf || cuerpo.Inact != inact || cuerpo.Absoluto != absoluto {
			t.Fatalf("la lectura cambió la sesión: %+v", cuerpo)
		}
		if cuerpo.Asesor.ID != f.asesor || cuerpo.Asesor.Nombre != "Juan P." || cuerpo.Asesor.Rol != "administrador" {
			t.Fatalf("asesor: %+v", cuerpo.Asesor)
		}
		var crudo map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &crudo); err != nil {
			t.Fatal(err)
		}
		if _, ok := crudo["reautenticado_hasta"]; ok || strings.Contains(rr.Body.String(), cookie) {
			t.Fatal("la lectura devolvió de más")
		}
	})

	t.Run("get con la preliminar", func(t *testing.T) {
		f.relojPanel(reloj)
		cookie, csrf := f.paso1(t, "192.0.2.81")
		rr := f.pedirPanel(http.MethodGet, "192.0.2.81", cookie, csrf)
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
			t.Fatalf("preliminar: %d %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("delete cierra", func(t *testing.T) {
		cuando := reloj.Add(3 * time.Minute)
		cookie, csrf, _, _ := f.sesionTOTP(t, cuando, "192.0.2.82", secreto[:])
		rr := f.pedirPanel(http.MethodDelete, "192.0.2.82", cookie, csrf)
		if rr.Code != http.StatusNoContent || rr.Body.Len() != 0 || rr.Header().Get("Set-Cookie") != cookiePanelBorrada {
			t.Fatalf("cierre: %d cuerpo %q cookie %q", rr.Code, rr.Body.String(), rr.Header().Get("Set-Cookie"))
		}
		sigue := f.pedirPanel(http.MethodGet, "192.0.2.82", cookie, "")
		if sigue.Code != http.StatusUnauthorized || problemaSinTraza(t, sigue)["codigo"] != "sesion_vencida" {
			t.Fatalf("después de cerrar: %d %s", sigue.Code, sigue.Body.String())
		}
	})

	t.Run("delete csrf distinto", func(t *testing.T) {
		cuando := reloj.Add(6 * time.Minute)
		cookie, csrf, _, _ := f.sesionTOTP(t, cuando, "192.0.2.83", secreto[:])
		ajeno := strings.Repeat("B", 43)
		rr := f.pedirPanel(http.MethodDelete, "192.0.2.83", cookie, ajeno)
		if rr.Code != http.StatusForbidden || problemaSinTraza(t, rr)["codigo"] != "csrf_invalido" {
			t.Fatalf("csrf: %d %s", rr.Code, rr.Body.String())
		}
		if rr.Header().Get("Set-Cookie") != "" || cuerpoTiene(rr, ajeno) || cuerpoTiene(rr, csrf) {
			t.Fatal("el csrf distinto borró la cookie o se repitió en el error")
		}
		sigue := f.pedirPanel(http.MethodGet, "192.0.2.83", cookie, "")
		if sigue.Code != http.StatusOK || !strings.Contains(sigue.Body.String(), csrf) {
			t.Fatalf("la sesión no siguió viva: %d %s", sigue.Code, sigue.Body.String())
		}
	})

	t.Run("sin cookie", func(t *testing.T) {
		get := f.pedirPanel(http.MethodGet, "192.0.2.84", "", "")
		if get.Code != http.StatusUnauthorized || problemaSinTraza(t, get)["codigo"] != "credencial_ausente" {
			t.Fatalf("GET: %d %s", get.Code, get.Body.String())
		}
		del := f.pedirPanel(http.MethodDelete, "192.0.2.84", "", strings.Repeat("C", 43))
		if del.Code != http.StatusUnauthorized || problemaSinTraza(t, del)["codigo"] != "credencial_ausente" {
			t.Fatalf("DELETE: %d %s", del.Code, del.Body.String())
		}
	})

	t.Run("inactividad vencida", func(t *testing.T) {
		cuando := reloj.Add(9 * time.Minute)
		cookie, csrf, _, _ := f.sesionTOTP(t, cuando, "192.0.2.85", secreto[:])
		f.relojPanel(cuando.Add(inactividadPanel))
		rr := f.pedirPanel(http.MethodGet, "192.0.2.85", cookie, "")
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
			t.Fatalf("idle: %d %s", rr.Code, rr.Body.String())
		}
		del := f.pedirPanel(http.MethodDelete, "192.0.2.85", cookie, csrf)
		if del.Code != http.StatusUnauthorized || problemaSinTraza(t, del)["codigo"] != "sesion_vencida" || del.Header().Get("Set-Cookie") != "" {
			t.Fatalf("delete vencida: %d cookie %q %s", del.Code, del.Header().Get("Set-Cookie"), del.Body.String())
		}
		f.relojPanel(cuando)
		sigue := f.pedirPanel(http.MethodGet, "192.0.2.85", cookie, "")
		if sigue.Code != http.StatusOK || !strings.Contains(sigue.Body.String(), csrf) {
			t.Fatalf("el vencimiento no debía revocar: %d %s", sigue.Code, sigue.Body.String())
		}
	})
}

func (f *fixSesion) sesionTOTP(t *testing.T, cuando time.Time, ip string, secreto []byte) (cookie, csrf, inact, absoluto string) {
	t.Helper()
	f.relojPanel(cuando)
	previa, paso := f.paso1(t, ip)
	rr := f.totp(ip, previa, paso, totpJSON("codigo", dominio.CodigoTOTP(secreto, cuando)))
	if rr.Code != http.StatusOK {
		t.Fatalf("totp: %d %s", rr.Code, rr.Body.String())
	}
	var cuerpo struct {
		CSRF     string `json:"csrf_token"`
		Inact    string `json:"vence_inactividad_en"`
		Absoluto string `json:"vence_absoluto_en"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}
	return valorCookiePanel(t, rr), cuerpo.CSRF, cuerpo.Inact, cuerpo.Absoluto
}

func (f *fixSesion) pedirPanel(metodo, ip, cookie, csrf string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(metodo, "/v1/panel/sesion", nil)
	r.RemoteAddr = ip + ":1234"
	if cookie != "" {
		r.AddCookie(&http.Cookie{Name: "__Host-vc_panel", Value: cookie})
	}
	if csrf != "" {
		r.Header.Set("X-CSRF-Token", csrf)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}
