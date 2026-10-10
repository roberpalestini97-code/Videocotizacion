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

func TestPerfilYCotizacionesPanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	laura := debeAsesor(t)
	reloj := time.Date(2026, 10, 8, 16, 0, 0, 0, time.UTC)
	if err := f.alm.CrearAsesor(t.Context(), f.tenant, dominio.Asesor{
		ID: laura, Rol: dominio.RolAsesorBase, NombreVisible: "Laura G.",
		Email: "laura@ejemplo.local", WhatsApp: "+5492235550102",
		Oficios:  []dominio.Oficio{dominio.OficioJardineria},
		Zonas:    []dominio.Zona{dominio.ZonaMarChiquita, dominio.ZonaCobo},
		CreadoEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	const claveLaura = "clave-laura-panel-ok"
	sembrarClavePanel(t, f, laura, "laura@ejemplo.local", claveLaura)
	var secretoJuan, secretoLaura [20]byte
	for i := range secretoJuan {
		secretoJuan[i] = byte(i + 1)
		secretoLaura[i] = byte(i + 21)
	}
	for _, par := range []struct {
		id      string
		secreto []byte
	}{
		{f.asesor, secretoJuan[:]},
		{laura, secretoLaura[:]},
	} {
		cif, err := dominio.CifrarSecretoTOTP(f.claveSrv, par.secreto)
		if err != nil {
			t.Fatal(err)
		}
		if err := f.alm.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
			AsesorID: par.id, Cifrado: cif, CreadaEn: reloj,
		}); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("sin cookie", func(t *testing.T) {
		for _, ruta := range []string{"/v1/panel/perfil", "/v1/panel/cotizaciones"} {
			rr := f.pedirRuta(http.MethodGet, ruta, "192.0.2.90", "")
			if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "credencial_ausente" {
				t.Fatalf("%s: %d %s", ruta, rr.Code, rr.Body.String())
			}
		}
	})

	t.Run("cookie preliminar", func(t *testing.T) {
		f.relojPanel(reloj)
		cookie, _ := f.paso1(t, "192.0.2.91")
		for _, ruta := range []string{"/v1/panel/perfil", "/v1/panel/cotizaciones"} {
			rr := f.pedirRuta(http.MethodGet, ruta, "192.0.2.91", cookie)
			if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
				t.Fatalf("%s: %d %s", ruta, rr.Code, rr.Body.String())
			}
		}
	})

	cookieJuan, _ := f.entrarPanel(t, reloj, "192.0.2.92", "juan@ejemplo.local", clavePanelOK, secretoJuan[:])
	rr := f.pedirRuta(http.MethodGet, "/v1/panel/perfil", "192.0.2.92", cookieJuan)
	if rr.Code != http.StatusOK {
		t.Fatalf("perfil: %d %s", rr.Code, rr.Body.String())
	}
	var perfil struct {
		ID      string   `json:"asesor_id"`
		Nombre  string   `json:"nombre_visible"`
		Email   string   `json:"email"`
		Rol     string   `json:"rol"`
		Was     string   `json:"whatsapp"`
		Oficios []string `json:"oficios"`
		TOTP    bool     `json:"totp_activo"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &perfil); err != nil {
		t.Fatal(err)
	}
	if perfil.ID != f.asesor || perfil.Nombre != "Juan P." || perfil.Email != "juan@ejemplo.local" || perfil.Rol != "administrador" || perfil.Was != "+5492235550000" || !perfil.TOTP || len(perfil.Oficios) != 1 || perfil.Oficios[0] != "pintura" {
		t.Fatalf("perfil: %+v", perfil)
	}
	var crudo map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &crudo); err != nil {
		t.Fatal(err)
	}
	for _, clave := range []string{"dni", "domicilio", "consentimiento_asesor"} {
		if _, ok := crudo[clave]; ok {
			t.Fatalf("el perfil trajo %s", clave)
		}
	}

	vacio := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones", "192.0.2.92", cookieJuan)
	if vacio.Code != http.StatusOK {
		t.Fatalf("lista vacía: %d %s", vacio.Code, vacio.Body.String())
	}
	if items := filasCotizacion(t, vacio); len(items) != 0 {
		t.Fatalf("lista vacía: %+v", items)
	}

	mia := exigirCreada(t, f, f.pedir(f.sec, "", "", "", f.cuerpo("3d"), true))
	suya, err := dominio.NuevaSesion(laura, dominio.ModoAvatar3D, reloj, 45)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.CrearSesion(t.Context(), f.tenant, suya); err != nil {
		t.Fatal(err)
	}
	codigo, err := codigoReferencia(mia.SesionID)
	if err != nil {
		t.Fatal(err)
	}
	lista := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?limite=20", "192.0.2.92", cookieJuan)
	if lista.Code != http.StatusOK {
		t.Fatalf("listado: %d %s", lista.Code, lista.Body.String())
	}
	filas := filasCotizacion(t, lista)
	if len(filas) != 1 || filas[0].ID != mia.SesionID || filas[0].Contacto || filas[0].Codigo != codigo {
		t.Fatalf("listado de Juan: %+v", filas)
	}
	if strings.Contains(lista.Body.String(), suya.ID) || strings.Contains(lista.Body.String(), "+5492235551000") {
		t.Fatal("el listado trajo la sesión de Laura o un teléfono")
	}

	contacto := f.contacto(mia.Token.Valor, mia.SesionID, contactoValido())
	if contacto.Code != http.StatusCreated {
		t.Fatalf("contacto: %d %s", contacto.Code, contacto.Body.String())
	}
	con := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones", "192.0.2.92", cookieJuan)
	if con.Code != http.StatusOK {
		t.Fatalf("con contacto: %d %s", con.Code, con.Body.String())
	}
	filas = filasCotizacion(t, con)
	if len(filas) != 1 || !filas[0].Contacto || filas[0].ID != mia.SesionID {
		t.Fatalf("después del contacto: %+v", filas)
	}
	if strings.Contains(con.Body.String(), "+5492235551000") || strings.Contains(con.Body.String(), "Marta") {
		t.Fatal("el listado incluyó datos del cliente")
	}

	cookieLaura, _ := f.entrarPanel(t, reloj.Add(3*time.Minute), "192.0.2.93", "laura@ejemplo.local", claveLaura, secretoLaura[:])
	ajena := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones", "192.0.2.93", cookieLaura)
	if ajena.Code != http.StatusOK {
		t.Fatalf("Laura: %d %s", ajena.Code, ajena.Body.String())
	}
	filas = filasCotizacion(t, ajena)
	if len(filas) != 1 || filas[0].ID != suya.ID || strings.Contains(ajena.Body.String(), mia.SesionID) {
		t.Fatalf("Laura ve lo de Juan: %+v", filas)
	}
}

func (f *fixSesion) entrarPanel(t *testing.T, cuando time.Time, ip, email, clave string, secreto []byte) (cookie, csrf string) {
	t.Helper()
	f.relojPanel(cuando)
	rr := f.login(ip, loginJSON(email, clave))
	if rr.Code != http.StatusOK {
		t.Fatalf("paso 1: %d %s", rr.Code, rr.Body.String())
	}
	previa := valorCookiePanel(t, rr)
	var paso struct {
		CSRF string `json:"csrf_token"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &paso); err != nil {
		t.Fatal(err)
	}
	totp := f.totp(ip, previa, paso.CSRF, totpJSON("codigo", dominio.CodigoTOTP(secreto, cuando)))
	if totp.Code != http.StatusOK {
		t.Fatalf("totp: %d %s", totp.Code, totp.Body.String())
	}
	var cuerpo struct {
		CSRF string `json:"csrf_token"`
	}
	if err := json.Unmarshal(totp.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}
	return valorCookiePanel(t, totp), cuerpo.CSRF
}

func (f *fixSesion) pedirRuta(metodo, ruta, ip, cookie string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(metodo, ruta, nil)
	r.RemoteAddr = ip + ":1234"
	if cookie != "" {
		r.AddCookie(&http.Cookie{Name: "__Host-vc_panel", Value: cookie})
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func filasCotizacion(t *testing.T, rr *httptest.ResponseRecorder) []struct {
	ID       string `json:"sesion_id"`
	Contacto bool   `json:"contacto_disponible"`
	Codigo   string `json:"codigo_referencia"`
} {
	t.Helper()
	var cuerpo struct {
		Items []struct {
			ID       string `json:"sesion_id"`
			Contacto bool   `json:"contacto_disponible"`
			Codigo   string `json:"codigo_referencia"`
		} `json:"items"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
		t.Fatalf("json: %v %s", err, rr.Body.String())
	}
	if cuerpo.Items == nil {
		t.Fatal("items nulo")
	}
	return cuerpo.Items
}
