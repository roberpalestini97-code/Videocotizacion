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

func TestReautenticacionPanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	var secreto [20]byte
	for i := range secreto {
		secreto[i] = byte(i + 1)
	}
	reloj := time.Date(2026, 10, 8, 17, 0, 0, 0, time.UTC)
	cif, err := dominio.CifrarSecretoTOTP(f.claveSrv, secreto[:])
	if err != nil {
		t.Fatal(err)
	}
	if err := f.a.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
		AsesorID: f.asesor, Cifrado: cif, CreadaEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	const ip = "192.0.2.70"

	t.Run("sin cookie", func(t *testing.T) {
		rr := f.reautenticar(ip, "", "x", reauthJSON(clavePanelOK, "123456"))
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "credencial_ausente" {
			t.Fatalf("sin cookie: %d %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("cookie preliminar", func(t *testing.T) {
		f.relojPanel(reloj)
		cookie, csrf := f.paso1(t, ip)
		rr := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelOK, dominio.CodigoTOTP(secreto[:], reloj)))
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
			t.Fatalf("preliminar: %d %s", rr.Code, rr.Body.String())
		}
	})

	cookie, csrf, inact, absoluto := f.sesionTOTP(t, reloj, ip, secreto[:])
	usado := dominio.CodigoTOTP(secreto[:], reloj)

	t.Run("código ya usado en el login", func(t *testing.T) {
		rr := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelOK, usado))
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "totp_invalido" {
			t.Fatalf("reuso: %d %s", rr.Code, rr.Body.String())
		}
		if cuerpoTiene(rr, usado) || cuerpoTiene(rr, clavePanelOK) {
			t.Fatal("el cuerpo del 401 cita el secreto")
		}
	})

	cuando := reloj.Add(3 * time.Minute)
	f.relojPanel(cuando)
	codigo := dominio.CodigoTOTP(secreto[:], cuando)
	rr := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelOK, codigo))
	if rr.Code != http.StatusOK || rr.Header().Get("Set-Cookie") != "" {
		t.Fatalf("otorgada: %d cookie %q %s", rr.Code, rr.Header().Get("Set-Cookie"), rr.Body.String())
	}
	var otorgada struct {
		Hasta string `json:"valida_hasta"`
		Seg   int    `json:"valida_s"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &otorgada); err != nil {
		t.Fatal(err)
	}
	fin := dominio.Instante(cuando.Add(5 * time.Minute)).Format(time.RFC3339)
	if otorgada.Seg != 300 || otorgada.Hasta != fin || cuerpoTiene(rr, codigo) || cuerpoTiene(rr, clavePanelOK) {
		t.Fatalf("ventana %+v", otorgada)
	}
	get := f.pedirPanel(http.MethodGet, ip, cookie, "")
	if get.Code != http.StatusOK {
		t.Fatalf("sesión: %d %s", get.Code, get.Body.String())
	}
	var sesion map[string]any
	if err := json.Unmarshal(get.Body.Bytes(), &sesion); err != nil {
		t.Fatal(err)
	}
	if sesion["reautenticado_hasta"] != fin || sesion["vence_inactividad_en"] != inact || sesion["vence_absoluto_en"] != absoluto {
		t.Fatalf("sesión tras otorgar: %+v", sesion)
	}

	f.relojPanel(cuando.Add(5 * time.Minute))
	vencida := f.pedirPanel(http.MethodGet, ip, cookie, "")
	if vencida.Code != http.StatusOK {
		t.Fatalf("sesión a los cinco minutos: %d %s", vencida.Code, vencida.Body.String())
	}
	var despues map[string]any
	if err := json.Unmarshal(vencida.Body.Bytes(), &despues); err != nil {
		t.Fatal(err)
	}
	if _, ok := despues["reautenticado_hasta"]; ok || despues["vence_absoluto_en"] != absoluto || despues["vence_inactividad_en"] != inact {
		t.Fatalf("la ventana debía omitirse: %+v", despues)
	}

	t.Run("contraseña mala", func(t *testing.T) {
		otro := reloj.Add(9 * time.Minute)
		f.relojPanel(otro)
		codigo := dominio.CodigoTOTP(secreto[:], otro)
		mala := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelMala, codigo))
		if mala.Code != http.StatusUnauthorized || problemaSinTraza(t, mala)["codigo"] != "credenciales_incorrectas" {
			t.Fatalf("contraseña: %d %s", mala.Code, mala.Body.String())
		}
		if cuerpoTiene(mala, clavePanelMala) || cuerpoTiene(mala, codigo) {
			t.Fatal("el 401 cita la contraseña o el código")
		}
		sigue := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelOK, codigo))
		if sigue.Code != http.StatusOK {
			t.Fatalf("el código debía seguir sirviendo: %d %s", sigue.Code, sigue.Body.String())
		}
	})

	t.Run("código malo", func(t *testing.T) {
		otro := reloj.Add(12 * time.Minute)
		f.relojPanel(otro)
		malo := codigoDistinto(secreto[:], otro)
		rr := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelOK, malo))
		if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "totp_invalido" {
			t.Fatalf("código: %d %s", rr.Code, rr.Body.String())
		}
		if cuerpoTiene(rr, malo) {
			t.Fatal("el 401 cita el código")
		}
	})

	t.Run("csrf distinto", func(t *testing.T) {
		otro := reloj.Add(15 * time.Minute)
		f.relojPanel(otro)
		codigo := dominio.CodigoTOTP(secreto[:], otro)
		distinto := f.reautenticar(ip, cookie, csrf+"x", reauthJSON(clavePanelOK, codigo))
		if distinto.Code != http.StatusForbidden || problemaSinTraza(t, distinto)["codigo"] != "csrf_invalido" {
			t.Fatalf("csrf: %d %s", distinto.Code, distinto.Body.String())
		}
		sigue := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelOK, codigo))
		if sigue.Code != http.StatusOK {
			t.Fatalf("el código no debía consumirse: %d %s", sigue.Code, sigue.Body.String())
		}
	})
}

func (f *fixSesion) reautenticar(ip, cookie, csrf, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/panel/reautenticacion", strings.NewReader(body))
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

func reauthJSON(clave, codigo string) string {
	b, _ := json.Marshal(map[string]string{"contrasena": clave, "codigo_totp": codigo})
	return string(b)
}
