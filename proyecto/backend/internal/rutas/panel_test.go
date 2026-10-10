package rutas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
)

const (
	clavePanelOK   = "una-frase-larga-de-prueba-0"
	clavePanelMala = "clave-incorrecta-de-prueba"
)

// SetCookiePanel de contracts/openapi.yaml.
var reCookiePanel = regexp.MustCompile(`^__Host-vc_panel=[A-Za-z0-9_-]{22,}; Path=/; Secure; HttpOnly; SameSite=Strict(; Max-Age=[0-9]+)?$`)

func TestIniciarSesionPanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)

	t.Run("paso totp", func(t *testing.T) {
		rr := f.login("192.0.2.10", loginJSON("juan@ejemplo.local", clavePanelOK))
		if rr.Code != http.StatusOK {
			t.Fatalf("estado %d: %s", rr.Code, rr.Body.String())
		}
		cookie := rr.Header().Get("Set-Cookie")
		if !reCookiePanel.MatchString(cookie) {
			t.Fatalf("Set-Cookie %q", cookie)
		}
		if strings.Contains(cookie, "juan") || strings.Contains(cookie, "@") || strings.Contains(cookie, clavePanelOK) {
			t.Fatal("la cookie contiene el email o la contraseña")
		}
		var cuerpo struct {
			Paso  string `json:"paso"`
			CSRF  string `json:"csrf_token"`
			Vence string `json:"vence_en"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
			t.Fatal(err)
		}
		if cuerpo.Paso != "totp" || !reCSRF.MatchString(cuerpo.CSRF) {
			t.Fatalf("paso %+v", cuerpo)
		}
		vence, err := time.Parse(time.RFC3339, cuerpo.Vence)
		if err != nil || !strings.HasSuffix(cuerpo.Vence, "Z") {
			t.Fatalf("vence_en %q", cuerpo.Vence)
		}
		if d := vence.Sub(time.Now()); d < 4*time.Minute || d > 5*time.Minute+time.Second {
			t.Fatalf("vence_en a %s", d)
		}
		valor := strings.SplitN(strings.TrimPrefix(cookie, "__Host-vc_panel="), ";", 2)[0]
		ing, err := f.a.LeerIngresoPanel(t.Context(), f.tenant, claves.HMAC(f.claveSrv, valor))
		if err != nil {
			t.Fatal(err)
		}
		if ing.AsesorID != f.asesor || string(ing.HashCookie) == valor || strings.Contains(string(ing.HashCookie), "juan") {
			t.Fatal("se guardó el valor de la cookie")
		}
		if rr.Header().Get("Set-Cookie") == "" || strings.Contains(rr.Body.String(), clavePanelOK) {
			t.Fatal("la contraseña volvió en la respuesta")
		}
	})

	t.Run("401 uniforme", func(t *testing.T) {
		desconocido := f.login("192.0.2.20", loginJSON("nadie@ejemplo.local", clavePanelMala))
		mala := f.login("192.0.2.21", loginJSON("juan@ejemplo.local", clavePanelMala))
		if desconocido.Code != http.StatusUnauthorized || mala.Code != http.StatusUnauthorized {
			t.Fatalf("estados %d y %d", desconocido.Code, mala.Code)
		}
		a, b := problemaSinTraza(t, desconocido), problemaSinTraza(t, mala)
		if !reflect.DeepEqual(a, b) || a["codigo"] != "credenciales_incorrectas" || a["detail"] != b["detail"] {
			t.Fatalf("cuerpos distintos: %#v %#v", a, b)
		}
		for _, rr := range []*httptest.ResponseRecorder{desconocido, mala} {
			if strings.Contains(rr.Body.String(), clavePanelMala) || strings.Contains(rr.Body.String(), clavePanelOK) {
				t.Fatal("la contraseña apareció en el error")
			}
		}
	})

	t.Run("sexto fallo", func(t *testing.T) {
		id := debeAsesor(t)
		as := dominio.Asesor{
			ID: id, Rol: dominio.RolAdministrar, NombreVisible: "Laura Q.", Email: "laura@ejemplo.local",
			WhatsApp: "+5492235550001", Oficios: []dominio.Oficio{dominio.OficioPintura},
			Zonas: []dominio.Zona{dominio.ZonaMarChiquita}, CreadoEn: time.Now().UTC(),
		}
		if err := f.a.CrearAsesor(t.Context(), f.tenant, as); err != nil {
			t.Fatal(err)
		}
		const claveLaura = "otra-frase-larga-de-panel"
		sembrarClavePanel(t, f, id, "laura@ejemplo.local", claveLaura)
		for i := 1; i <= 5; i++ {
			rr := f.login("192.0.2.30", loginJSON("laura@ejemplo.local", clavePanelMala))
			if rr.Code != http.StatusUnauthorized || strings.Contains(rr.Body.String(), clavePanelMala) {
				t.Fatalf("intento %d: %d %s", i, rr.Code, rr.Body.String())
			}
		}
		rr := f.login("192.0.2.30", loginJSON("laura@ejemplo.local", clavePanelMala))
		if rr.Code != http.StatusTooManyRequests {
			t.Fatalf("sexto: %d %s", rr.Code, rr.Body.String())
		}
		if problemaSinTraza(t, rr)["codigo"] != "intentos_excedidos" || rr.Header().Get("Retry-After") != "900" {
			t.Fatalf("429: %s retry %q", rr.Body.String(), rr.Header().Get("Retry-After"))
		}
		if strings.Contains(rr.Body.String(), clavePanelMala) || strings.Contains(rr.Body.String(), claveLaura) {
			t.Fatal("la contraseña apareció en el 429")
		}
		// Un acierto no levanta el bloqueo ya activo.
		ok := f.login("192.0.2.31", loginJSON("laura@ejemplo.local", claveLaura))
		if ok.Code != http.StatusTooManyRequests || ok.Header().Get("Set-Cookie") != "" {
			t.Fatalf("acierto bloqueado: %d cookie %q", ok.Code, ok.Header().Get("Set-Cookie"))
		}
		if strings.Contains(ok.Body.String(), claveLaura) {
			t.Fatal("la contraseña apareció en el bloqueo")
		}
	})

	t.Run("solicitud invalida", func(t *testing.T) {
		rr := f.login("192.0.2.40", `{"email":"juan@ejemplo.local","contrasena":"`+clavePanelOK+`","extra":1}`)
		if rr.Code != http.StatusBadRequest || problemaSinTraza(t, rr)["codigo"] != "solicitud_invalida" {
			t.Fatalf("mal formado: %d %s", rr.Code, rr.Body.String())
		}
		if strings.Contains(rr.Body.String(), clavePanelOK) {
			t.Fatal("la contraseña apareció en el 400")
		}
	})
}

func sembrarClavePanel(t *testing.T, f *fixSesion, asesor, email, clara string) {
	t.Helper()
	c, err := dominio.NuevaContrasena(asesor, email, clara)
	if err != nil {
		t.Fatal(err)
	}
	c.CreadaEn = time.Now().UTC()
	if err := f.a.GuardarContrasena(t.Context(), f.tenant, c); err != nil {
		t.Fatal(err)
	}
}

func (f *fixSesion) login(ip, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/panel/sesion", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.RemoteAddr = ip + ":1234"
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func loginJSON(email, contrasena string) string {
	b, _ := json.Marshal(map[string]string{"email": email, "contrasena": contrasena})
	return string(b)
}

func problemaSinTraza(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatalf("json: %v %s", err, rr.Body.String())
	}
	delete(m, "id_traza")
	return m
}
