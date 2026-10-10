package rutas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
)

const codigoRecuperacionPanel = "AB12-CD34-EF56"

func TestVerificarTotp(t *testing.T) {
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
	reloj := time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC)
	if err := f.alm.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
		AsesorID: f.asesor, Cifrado: cif, CreadaEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	if err := f.alm.GuardarCodigoRecuperacion(t.Context(), f.tenant, dominio.CodigoRecuperacion{
		AsesorID: f.asesor, Hash: claves.HMAC(f.claveSrv, codigoRecuperacionPanel), Metodo: dominio.MetodoHMACRecuperacion,
	}); err != nil {
		t.Fatal(err)
	}

	t.Run("entra y rota", func(t *testing.T) {
		cuando := reloj
		f.relojPanel(cuando)
		cookie, csrf := f.paso1(t, "192.0.2.50")
		rr := f.totp("192.0.2.50", cookie, csrf, totpJSON("codigo", dominio.CodigoTOTP(secreto[:], cuando)))
		if rr.Code != http.StatusOK {
			t.Fatalf("estado %d: %s", rr.Code, rr.Body.String())
		}
		nueva := valorCookiePanel(t, rr)
		if nueva == cookie || strings.Contains(nueva, "juan") || strings.Contains(nueva, "@") {
			t.Fatal("la cookie nueva repite la vieja o lleva el email")
		}
		if !strings.Contains(rr.Header().Get("Set-Cookie"), "Max-Age=43200") {
			t.Fatalf("Set-Cookie %q", rr.Header().Get("Set-Cookie"))
		}
		var cuerpo struct {
			Asesor struct {
				ID     string `json:"asesor_id"`
				Nombre string `json:"nombre_visible"`
				Rol    string `json:"rol"`
			} `json:"asesor"`
			CSRF  string `json:"csrf_token"`
			Inact string `json:"vence_inactividad_en"`
			Abs   string `json:"vence_absoluto_en"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
			t.Fatal(err)
		}
		if cuerpo.Asesor.ID != f.asesor || cuerpo.Asesor.Nombre != "Juan P." || cuerpo.Asesor.Rol != "administrador" || !reCSRF.MatchString(cuerpo.CSRF) {
			t.Fatalf("sesión %+v", cuerpo)
		}
		if cuerpo.Inact != cuando.Add(inactividadPanel).Format(time.RFC3339) || cuerpo.Abs != cuando.Add(absolutoPanel).Format(time.RFC3339) {
			t.Fatalf("vencimientos %s %s", cuerpo.Inact, cuerpo.Abs)
		}
		vieja := f.totp("192.0.2.50", cookie, csrf, totpJSON("codigo", dominio.CodigoTOTP(secreto[:], cuando)))
		if vieja.Code != http.StatusUnauthorized || problemaSinTraza(t, vieja)["codigo"] != "sesion_vencida" {
			t.Fatalf("cookie vieja: %d %s", vieja.Code, vieja.Body.String())
		}
	})

	t.Run("codigo malo", func(t *testing.T) {
		cuando := reloj.Add(3 * time.Minute)
		f.relojPanel(cuando)
		cookie, csrf := f.paso1(t, "192.0.2.51")
		malo := codigoDistinto(secreto[:], cuando)
		rr := f.totp("192.0.2.51", cookie, csrf, totpJSON("codigo", malo))
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "totp_invalido" {
			t.Fatalf("malo: %d %s", rr.Code, rr.Body.String())
		}
		if cuerpoTiene(rr, malo) {
			t.Fatal("el código apareció en el error")
		}
	})

	t.Run("reuso", func(t *testing.T) {
		cuando := reloj.Add(6 * time.Minute)
		f.relojPanel(cuando)
		codigo := dominio.CodigoTOTP(secreto[:], cuando)
		cookie, csrf := f.paso1(t, "192.0.2.52")
		primero := f.totp("192.0.2.52", cookie, csrf, totpJSON("codigo", codigo))
		if primero.Code != http.StatusOK {
			t.Fatalf("primero: %d %s", primero.Code, primero.Body.String())
		}
		cookie2, csrf2 := f.paso1(t, "192.0.2.53")
		rr := f.totp("192.0.2.53", cookie2, csrf2, totpJSON("codigo", codigo))
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "totp_invalido" {
			t.Fatalf("reuso: %d %s", rr.Code, rr.Body.String())
		}
		if cuerpoTiene(rr, codigo) {
			t.Fatal("el código apareció en el reuso")
		}
	})

	t.Run("csrf", func(t *testing.T) {
		cuando := reloj.Add(9 * time.Minute)
		f.relojPanel(cuando)
		codigo := dominio.CodigoTOTP(secreto[:], cuando)
		cookie, csrf := f.paso1(t, "192.0.2.54")
		ambos := f.totp("192.0.2.54", cookie, csrf, `{"codigo":"`+codigo+`","codigo_recuperacion":"`+codigoRecuperacionPanel+`"}`)
		if ambos.Code != http.StatusBadRequest || problemaSinTraza(t, ambos)["codigo"] != "solicitud_invalida" {
			t.Fatalf("ambos: %d %s", ambos.Code, ambos.Body.String())
		}
		if cuerpoTiene(ambos, codigo) || strings.Contains(ambos.Body.String(), codigoRecuperacionPanel) {
			t.Fatal("el código apareció en el 400")
		}
		ajeno := f.totp("192.0.2.54", cookie, strings.Repeat("a", 43), totpJSON("codigo", codigo))
		if ajeno.Code != http.StatusForbidden || problemaSinTraza(t, ajeno)["codigo"] != "csrf_invalido" {
			t.Fatalf("csrf: %d %s", ajeno.Code, ajeno.Body.String())
		}
		if cuerpoTiene(ajeno, codigo) {
			t.Fatal("el código apareció en el 403")
		}
		rr := f.totp("192.0.2.54", cookie, csrf, totpJSON("codigo", codigo))
		if rr.Code != http.StatusOK {
			t.Fatalf("el csrf malo consumió el código: %d %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("sin cookie", func(t *testing.T) {
		rr := f.totp("192.0.2.55", "", "", totpJSON("codigo", "123456"))
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
			t.Fatalf("sin cookie: %d %s", rr.Code, rr.Body.String())
		}
		if cuerpoTiene(rr, "123456") {
			t.Fatal("el código apareció en el 401")
		}
	})

	t.Run("recuperacion", func(t *testing.T) {
		cuando := reloj.Add(12 * time.Minute)
		f.relojPanel(cuando)
		cookie, csrf := f.paso1(t, "192.0.2.56")
		rr := f.totp("192.0.2.56", cookie, csrf, totpJSON("codigo_recuperacion", codigoRecuperacionPanel))
		if rr.Code != http.StatusOK {
			t.Fatalf("recuperación: %d %s", rr.Code, rr.Body.String())
		}
		if strings.Contains(rr.Body.String(), codigoRecuperacionPanel) {
			t.Fatal("el código de recuperación volvió en la respuesta")
		}
		cookie2, csrf2 := f.paso1(t, "192.0.2.57")
		otra := f.totp("192.0.2.57", cookie2, csrf2, totpJSON("codigo_recuperacion", codigoRecuperacionPanel))
		if otra.Code != http.StatusUnauthorized || problemaSinTraza(t, otra)["codigo"] != "totp_invalido" {
			t.Fatalf("segunda recuperación: %d %s", otra.Code, otra.Body.String())
		}
		if strings.Contains(otra.Body.String(), codigoRecuperacionPanel) {
			t.Fatal("el código de recuperación apareció en el 401")
		}
	})
}

func (f *fixSesion) relojPanel(t time.Time) {
	f.hdl.ahoraPanel = func() time.Time { return t }
}

func (f *fixSesion) paso1(t *testing.T, ip string) (cookie, csrf string) {
	t.Helper()
	rr := f.login(ip, loginJSON("juan@ejemplo.local", clavePanelOK))
	if rr.Code != http.StatusOK {
		t.Fatalf("paso 1: %d %s", rr.Code, rr.Body.String())
	}
	cookie = valorCookiePanel(t, rr)
	var cuerpo struct {
		CSRF string `json:"csrf_token"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}
	return cookie, cuerpo.CSRF
}

func (f *fixSesion) totp(ip, cookie, csrf, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/panel/sesion/totp", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
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

func valorCookiePanel(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()
	c := rr.Header().Get("Set-Cookie")
	if !reCookiePanel.MatchString(c) {
		t.Fatalf("Set-Cookie %q", c)
	}
	return strings.SplitN(strings.TrimPrefix(c, "__Host-vc_panel="), ";", 2)[0]
}

func totpJSON(campo, valor string) string {
	b, _ := json.Marshal(map[string]string{campo: valor})
	return string(b)
}

func cuerpoTiene(rr *httptest.ResponseRecorder, secreto string) bool {
	var m map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		return strings.Contains(rr.Body.String(), secreto)
	}
	delete(m, "id_traza")
	b, _ := json.Marshal(m)
	return strings.Contains(string(b), secreto)
}

func codigoDistinto(secreto []byte, cuando time.Time) string {
	ocupados := map[string]bool{}
	for _, d := range []time.Duration{-dominio.PasoTOTP, 0, dominio.PasoTOTP} {
		ocupados[dominio.CodigoTOTP(secreto, cuando.Add(d))] = true
	}
	for _, c := range []string{"000000", "111111", "222222"} {
		if !ocupados[c] {
			return c
		}
	}
	return "333333"
}
