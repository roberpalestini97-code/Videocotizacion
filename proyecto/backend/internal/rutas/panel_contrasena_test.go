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

func TestCambiarContrasenaPanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	var secreto [20]byte
	for i := range secreto {
		secreto[i] = byte(i + 1)
	}
	reloj := time.Date(2026, 10, 8, 18, 0, 0, 0, time.UTC)
	cif, err := dominio.CifrarSecretoTOTP(f.claveSrv, secreto[:])
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
		AsesorID: f.asesor, Cifrado: cif, CreadaEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	const (
		ipA   = "192.0.2.110"
		ipB   = "192.0.2.111"
		nueva = "otra-frase-bien-larga-0"
		corta = "clave-corta"
	)

	rr := f.cambiarContrasena(ipA, "", "x", cambioJSON(nueva))
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "credencial_ausente" {
		t.Fatalf("sin cookie: %d %s", rr.Code, rr.Body.String())
	}

	f.relojPanel(reloj)
	previa, csrfPrevio := f.paso1(t, ipA)
	rr = f.cambiarContrasena(ipA, previa, csrfPrevio, cambioJSON(nueva))
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
		t.Fatalf("preliminar: %d %s", rr.Code, rr.Body.String())
	}

	cookieA, csrfA, inact, absoluto := f.sesionTOTP(t, reloj, ipA, secreto[:])
	rr = f.cambiarContrasena(ipA, cookieA, csrfA, cambioJSON(nueva))
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "reautenticacion_requerida" {
		t.Fatalf("sin reautenticar: %d %s", rr.Code, rr.Body.String())
	}
	if cuerpoTiene(rr, nueva) || cuerpoTiene(rr, clavePanelOK) {
		t.Fatal("el 401 cita una contraseña")
	}
	vieja := f.login("192.0.2.112", loginJSON("juan@ejemplo.local", clavePanelOK))
	if vieja.Code != http.StatusOK || !strings.Contains(vieja.Body.String(), `"paso":"totp"`) {
		t.Fatalf("la vieja debía seguir: %d %s", vieja.Code, vieja.Body.String())
	}

	cookieB, _, _, _ := f.sesionTOTP(t, reloj.Add(3*time.Minute), ipB, secreto[:])
	cuando := reloj.Add(6 * time.Minute)
	f.relojPanel(cuando)
	otorgada := f.reautenticar(ipA, cookieA, csrfA, reauthJSON(clavePanelOK, dominio.CodigoTOTP(secreto[:], cuando)))
	if otorgada.Code != http.StatusOK {
		t.Fatalf("reautenticar: %d %s", otorgada.Code, otorgada.Body.String())
	}

	distinto := f.cambiarContrasena(ipA, cookieA, csrfA+"x", cambioJSON(nueva))
	if distinto.Code != http.StatusForbidden || problemaSinTraza(t, distinto)["codigo"] != "csrf_invalido" {
		t.Fatalf("csrf: %d %s", distinto.Code, distinto.Body.String())
	}
	if cuerpoTiene(distinto, nueva) {
		t.Fatal("el 403 cita la contraseña")
	}

	mala := f.cambiarContrasena(ipA, cookieA, csrfA, cambioJSON(corta))
	if mala.Code != http.StatusUnprocessableEntity || problemaSinTraza(t, mala)["codigo"] != "validacion_fallida" {
		t.Fatalf("corta: %d %s", mala.Code, mala.Body.String())
	}
	if cuerpoTiene(mala, corta) || cuerpoTiene(mala, clavePanelOK) {
		t.Fatal("el 422 cita una contraseña")
	}

	f.relojPanel(cuando.Add(5 * time.Minute))
	vencida := f.cambiarContrasena(ipA, cookieA, csrfA, cambioJSON(nueva))
	if vencida.Code != http.StatusUnauthorized || problemaSinTraza(t, vencida)["codigo"] != "reautenticacion_requerida" {
		t.Fatalf("a los cinco minutos: %d %s", vencida.Code, vencida.Body.String())
	}
	sigue := f.login("192.0.2.113", loginJSON("juan@ejemplo.local", clavePanelOK))
	if sigue.Code != http.StatusOK || !strings.Contains(sigue.Body.String(), `"paso":"totp"`) {
		t.Fatalf("el hash no debía cambiar: %d %s", sigue.Code, sigue.Body.String())
	}

	otro := reloj.Add(12 * time.Minute)
	f.relojPanel(otro)
	deNuevo := f.reautenticar(ipA, cookieA, csrfA, reauthJSON(clavePanelOK, dominio.CodigoTOTP(secreto[:], otro)))
	if deNuevo.Code != http.StatusOK {
		t.Fatalf("segunda reautenticación: %d %s", deNuevo.Code, deNuevo.Body.String())
	}
	ok := f.cambiarContrasena(ipA, cookieA, csrfA, cambioJSON(nueva))
	if ok.Code != http.StatusNoContent || ok.Body.Len() != 0 || ok.Header().Get("Set-Cookie") != "" {
		t.Fatalf("cambio: %d cookie %q %s", ok.Code, ok.Header().Get("Set-Cookie"), ok.Body.String())
	}

	ajena := f.pedirPanel(http.MethodGet, ipB, cookieB, "")
	if ajena.Code != http.StatusUnauthorized || problemaSinTraza(t, ajena)["codigo"] != "sesion_vencida" {
		t.Fatalf("la otra sesión: %d %s", ajena.Code, ajena.Body.String())
	}
	actual := f.pedirPanel(http.MethodGet, ipA, cookieA, "")
	if actual.Code != http.StatusOK {
		t.Fatalf("la sesión actual: %d %s", actual.Code, actual.Body.String())
	}
	var sesion map[string]any
	if err := json.Unmarshal(actual.Body.Bytes(), &sesion); err != nil {
		t.Fatal(err)
	}
	if _, hay := sesion["reautenticado_hasta"]; hay || sesion["csrf_token"] != csrfA || sesion["vence_inactividad_en"] != inact || sesion["vence_absoluto_en"] != absoluto {
		t.Fatalf("sesión tras el cambio: %+v", sesion)
	}

	otra := f.cambiarContrasena(ipA, cookieA, csrfA, cambioJSON(nueva+"-2"))
	if otra.Code != http.StatusUnauthorized || problemaSinTraza(t, otra)["codigo"] != "reautenticacion_requerida" {
		t.Fatalf("ventana consumida: %d %s", otra.Code, otra.Body.String())
	}
	yaNo := f.login("192.0.2.114", loginJSON("juan@ejemplo.local", clavePanelOK))
	if yaNo.Code != http.StatusUnauthorized || problemaSinTraza(t, yaNo)["codigo"] != "credenciales_incorrectas" || cuerpoTiene(yaNo, clavePanelOK) || cuerpoTiene(yaNo, nueva) {
		t.Fatalf("vieja: %d %s", yaNo.Code, yaNo.Body.String())
	}
	paso := f.login("192.0.2.115", loginJSON("juan@ejemplo.local", nueva))
	if paso.Code != http.StatusOK || !strings.Contains(paso.Body.String(), `"paso":"totp"`) || strings.Contains(paso.Body.String(), nueva) {
		t.Fatalf("nueva: %d %s", paso.Code, paso.Body.String())
	}
}

func (f *fixSesion) cambiarContrasena(ip, cookie, csrf, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/panel/contrasena", strings.NewReader(body))
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

func cambioJSON(clave string) string {
	b, _ := json.Marshal(map[string]string{"contrasena_nueva": clave})
	return string(b)
}
