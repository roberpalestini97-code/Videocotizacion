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

func TestActualizarPerfil(t *testing.T) {
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

	f.relojPanel(reloj)
	preliminar, csrfPrevio := f.paso1(t, "192.0.2.100")
	rr := f.patchPerfil("192.0.2.100", preliminar, csrfPrevio, `{"nombre_visible":"No"}`)
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
		t.Fatalf("preliminar: %d %s", rr.Code, rr.Body.String())
	}

	cookie, csrf := f.entrarPanel(t, reloj, "192.0.2.101", "juan@ejemplo.local", clavePanelOK, secreto[:])
	sin := f.patchPerfil("192.0.2.101", "", csrf, `{"nombre_visible":"No"}`)
	if sin.Code != http.StatusUnauthorized || problemaSinTraza(t, sin)["codigo"] != "credencial_ausente" {
		t.Fatalf("sin cookie: %d %s", sin.Code, sin.Body.String())
	}

	rr = f.patchPerfil("192.0.2.101", cookie, csrf, `{"nombre_visible":"Juan Pérez"}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("nombre: %d %s", rr.Code, rr.Body.String())
	}
	var perfil struct {
		Nombre string `json:"nombre_visible"`
		Was    string `json:"whatsapp"`
		Email  string `json:"email"`
		TOTP   bool   `json:"totp_activo"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &perfil); err != nil {
		t.Fatal(err)
	}
	if perfil.Nombre != "Juan Pérez" || perfil.Was != "+5492235550000" || perfil.Email != "juan@ejemplo.local" || !perfil.TOTP {
		t.Fatalf("respuesta: %+v", perfil)
	}
	got := f.pedirRuta(http.MethodGet, "/v1/panel/perfil", "192.0.2.101", cookie)
	if got.Code != http.StatusOK || !strings.Contains(got.Body.String(), "Juan Pérez") || !strings.Contains(got.Body.String(), "+5492235550000") {
		t.Fatalf("GET: %d %s", got.Code, got.Body.String())
	}

	malo := f.patchPerfil("192.0.2.101", cookie, csrf, `{"oficios":["plomeria"]}`)
	if malo.Code != http.StatusUnprocessableEntity || problemaSinTraza(t, malo)["codigo"] != "validacion_fallida" || strings.Contains(malo.Body.String(), "plomeria") {
		t.Fatalf("oficio: %d %s", malo.Code, malo.Body.String())
	}
	sigue := f.pedirRuta(http.MethodGet, "/v1/panel/perfil", "192.0.2.101", cookie)
	var oficios struct {
		Oficios []string `json:"oficios"`
		Nombre  string   `json:"nombre_visible"`
	}
	if err := json.Unmarshal(sigue.Body.Bytes(), &oficios); err != nil {
		t.Fatal(err)
	}
	if len(oficios.Oficios) != 1 || oficios.Oficios[0] != "pintura" || oficios.Nombre != "Juan Pérez" {
		t.Fatalf("oficios cambiaron: %+v", oficios)
	}

	ajeno := f.patchPerfil("192.0.2.101", cookie, strings.Repeat("B", 43), `{"nombre_visible":"Otro"}`)
	if ajeno.Code != http.StatusForbidden || problemaSinTraza(t, ajeno)["codigo"] != "csrf_invalido" {
		t.Fatalf("csrf: %d %s", ajeno.Code, ajeno.Body.String())
	}
	despues := f.pedirRuta(http.MethodGet, "/v1/panel/perfil", "192.0.2.101", cookie)
	if !strings.Contains(despues.Body.String(), "Juan Pérez") || strings.Contains(despues.Body.String(), `"nombre_visible":"Otro"`) {
		t.Fatalf("el csrf cambió el nombre: %s", despues.Body.String())
	}

	correo := f.patchPerfil("192.0.2.101", cookie, csrf, `{"email":"otro@ejemplo.local","nombre_visible":"No Debe"}`)
	if correo.Code != http.StatusUnprocessableEntity || problemaSinTraza(t, correo)["codigo"] != "validacion_fallida" || strings.Contains(correo.Body.String(), "otro@ejemplo.local") {
		t.Fatalf("email: %d %s", correo.Code, correo.Body.String())
	}
	final := f.pedirRuta(http.MethodGet, "/v1/panel/perfil", "192.0.2.101", cookie)
	if !strings.Contains(final.Body.String(), "juan@ejemplo.local") || !strings.Contains(final.Body.String(), "Juan Pérez") || strings.Contains(final.Body.String(), "No Debe") {
		t.Fatalf("el email o el nombre cambiaron: %s", final.Body.String())
	}
}

func (f *fixSesion) patchPerfil(ip, cookie, csrf, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPatch, "/v1/panel/perfil", strings.NewReader(body))
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
