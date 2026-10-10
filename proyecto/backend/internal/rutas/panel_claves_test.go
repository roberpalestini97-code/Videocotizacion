package rutas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/dominio"
)

func TestClavesWidgetPanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	laura := debeAsesor(t)
	reloj := time.Date(2026, 10, 8, 20, 0, 0, 0, time.UTC)
	if err := f.alm.CrearAsesor(t.Context(), f.tenant, dominio.Asesor{
		ID: laura, Rol: dominio.RolAsesorBase, NombreVisible: "Laura G.",
		Email: "laura@ejemplo.local", WhatsApp: "+5492235550102",
		Oficios:  []dominio.Oficio{dominio.OficioJardineria},
		Zonas:    []dominio.Zona{dominio.ZonaCobo},
		CreadoEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	const claveLaura = "clave-laura-panel-ok"
	sembrarClavePanel(t, f, laura, "laura@ejemplo.local", claveLaura)
	var secretoAdmin, secretoLaura [20]byte
	for i := range secretoAdmin {
		secretoAdmin[i] = byte(i + 1)
		secretoLaura[i] = byte(i + 21)
	}
	for _, par := range []struct {
		id      string
		secreto []byte
	}{
		{f.asesor, secretoAdmin[:]},
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
	const ipAdmin, ipLaura = "192.0.2.131", "192.0.2.130"

	rr := f.pedirClaves(http.MethodGet, ipAdmin, "", "", "")
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "credencial_ausente" {
		t.Fatalf("sin cookie: %d %s", rr.Code, rr.Body.String())
	}
	f.relojPanel(reloj)
	previa, _ := f.paso1(t, ipAdmin)
	rr = f.pedirClaves(http.MethodGet, ipAdmin, previa, "", "")
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
		t.Fatalf("preliminar: %d %s", rr.Code, rr.Body.String())
	}

	cookieLaura, csrfLaura := f.entrarPanel(t, reloj, ipLaura, "laura@ejemplo.local", claveLaura, secretoLaura[:])
	rr = f.pedirClaves(http.MethodPost, ipLaura, cookieLaura, csrfLaura, claveWidgetJSON("Sitio de Laura", f.origen))
	if rr.Code != http.StatusForbidden || problemaSinTraza(t, rr)["codigo"] != "alcance_insuficiente" {
		t.Fatalf("asesor: %d %s", rr.Code, rr.Body.String())
	}

	cookie, csrf, _, _ := f.sesionTOTP(t, reloj.Add(3*time.Minute), ipAdmin, secretoAdmin[:])
	antes := f.pedirClaves(http.MethodGet, ipAdmin, cookie, "", "")
	if antes.Code != http.StatusOK || strings.Contains(antes.Body.String(), "Sitio de Laura") {
		t.Fatalf("lista tras el asesor: %d %s", antes.Code, antes.Body.String())
	}
	rr = f.pedirClaves(http.MethodPost, ipAdmin, cookie, csrf, claveWidgetJSON("No deberia guardarse", f.origen))
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "reautenticacion_requerida" {
		t.Fatalf("sin reautenticar: %d %s", rr.Code, rr.Body.String())
	}
	sigue := f.pedirClaves(http.MethodGet, ipAdmin, cookie, "", "")
	if sigue.Body.String() != antes.Body.String() {
		t.Fatalf("se guardó sin ventana: %s", sigue.Body.String())
	}

	cuando := reloj.Add(6 * time.Minute)
	f.relojPanel(cuando)
	otorgada := f.reautenticar(ipAdmin, cookie, csrf, reauthJSON(clavePanelOK, dominio.CodigoTOTP(secretoAdmin[:], cuando)))
	if otorgada.Code != http.StatusOK {
		t.Fatalf("reautenticar: %d %s", otorgada.Code, otorgada.Body.String())
	}
	var ventana struct {
		Hasta string `json:"valida_hasta"`
	}
	if err := json.Unmarshal(otorgada.Body.Bytes(), &ventana); err != nil {
		t.Fatal(err)
	}
	distinto := f.pedirClaves(http.MethodPost, ipAdmin, cookie, csrf+"x", claveWidgetJSON("Sitio principal", f.origen))
	if distinto.Code != http.StatusForbidden || problemaSinTraza(t, distinto)["codigo"] != "csrf_invalido" {
		t.Fatalf("csrf: %d %s", distinto.Code, distinto.Body.String())
	}

	creada := f.pedirClaves(http.MethodPost, ipAdmin, cookie, csrf, claveWidgetJSON("Sitio principal", f.origen))
	if creada.Code != http.StatusCreated || creada.Header().Get("Set-Cookie") != "" {
		t.Fatalf("alta: %d cookie %q %s", creada.Code, creada.Header().Get("Set-Cookie"), creada.Body.String())
	}
	var alta struct {
		Clave struct {
			ID      string   `json:"clave_id"`
			Nombre  string   `json:"nombre"`
			Prefijo string   `json:"prefijo"`
			Origins []string `json:"origins"`
			Estado  string   `json:"estado"`
		} `json:"clave"`
		Valor string `json:"valor"`
		Una   bool   `json:"se_muestra_una_sola_vez"`
	}
	if err := json.Unmarshal(creada.Body.Bytes(), &alta); err != nil {
		t.Fatal(err)
	}
	if !alta.Una || alta.Clave.Nombre != "Sitio principal" || alta.Clave.Estado != "activa" || len(alta.Clave.Origins) != 1 || alta.Clave.Origins[0] != f.origen {
		t.Fatalf("alta %+v", alta)
	}
	if !regexp.MustCompile(`^vc_pub_[A-Za-z0-9_-]{40}$`).MatchString(alta.Valor) || alta.Clave.Prefijo != alta.Valor[:len("vc_pub_")+4] || !strings.HasPrefix(alta.Valor, alta.Clave.Prefijo) {
		t.Fatalf("valor %q prefijo %q", alta.Valor, alta.Clave.Prefijo)
	}
	lista := f.pedirClaves(http.MethodGet, ipAdmin, cookie, "", "")
	if lista.Code != http.StatusOK || !strings.Contains(lista.Body.String(), alta.Clave.Prefijo) || strings.Contains(lista.Body.String(), alta.Valor) {
		t.Fatalf("lista: %d %s", lista.Code, lista.Body.String())
	}
	ok := f.widgetCon(alta.Valor)
	if ok.Code != http.StatusOK || nombreWidget(t, ok) != "Juan P." {
		t.Fatalf("widget: %d %s", ok.Code, ok.Body.String())
	}

	borrada := f.revocarClave(ipAdmin, cookie, csrf, alta.Clave.ID)
	if borrada.Code != http.StatusNoContent || borrada.Body.Len() != 0 {
		t.Fatalf("revocar: %d %s", borrada.Code, borrada.Body.String())
	}
	negada := f.widgetCon(alta.Valor)
	if negada.Code != http.StatusUnauthorized || problemaSinTraza(t, negada)["codigo"] != "credencial_invalida" {
		t.Fatalf("widget revocada: %d %s", negada.Code, negada.Body.String())
	}
	get := f.pedirPanel(http.MethodGet, ipAdmin, cookie, "")
	var sesion map[string]any
	if err := json.Unmarshal(get.Body.Bytes(), &sesion); err != nil {
		t.Fatal(err)
	}
	if get.Code != http.StatusOK || sesion["reautenticado_hasta"] != ventana.Hasta {
		t.Fatalf("la ventana no debía consumirse: %d %+v", get.Code, sesion)
	}

	ajena := dominio.ClaveAPI{
		ID: debeClave(t, true), Tipo: dominio.ClavePublica, Hash: []byte{
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
			17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
		},
		Prefijo: "vc_pub_ajen", Nombre: "Ajena", Origenes: []string{f.origen}, CreadaEn: reloj,
	}
	otro := dominio.Tenant{
		ID: debeTenant(t), Nombre: "Otro", SimultaneasTope: 5, SegundosMesTope: 30000,
		RetencionDias: 45, CreadoEn: reloj,
	}
	if err := f.alm.CrearTenant(t.Context(), otro); err != nil {
		t.Fatal(err)
	}
	asesorOtro := debeAsesor(t)
	if err := f.alm.CrearAsesor(t.Context(), otro.ID, dominio.Asesor{
		ID: asesorOtro, Rol: dominio.RolAdministrar, NombreVisible: "Otro A.",
		Email: "otro@ejemplo.local", WhatsApp: "+5492235550199",
		Oficios: []dominio.Oficio{dominio.OficioPintura}, Zonas: []dominio.Zona{dominio.ZonaCobo},
		CreadoEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	if err := f.alm.GuardarClave(t.Context(), otro.ID, ajena); err != nil {
		t.Fatal(err)
	}
	no := f.revocarClave(ipAdmin, cookie, csrf, ajena.ID)
	if no.Code != http.StatusNotFound || problemaSinTraza(t, no)["codigo"] != "no_encontrado" {
		t.Fatalf("clave ajena: %d %s", no.Code, no.Body.String())
	}
	hall, err := f.alm.BuscarClavePorHash(t.Context(), ajena.Hash)
	if err != nil || hall.Revocada {
		t.Fatalf("la clave ajena quedó revocada: %+v %v", hall, err)
	}
}

func claveWidgetJSON(nombre, origin string) string {
	b, _ := json.Marshal(map[string]any{"nombre": nombre, "origins": []string{origin}})
	return string(b)
}

func (f *fixSesion) pedirClaves(metodo, ip, cookie, csrf, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(metodo, "/v1/panel/claves-widget", strings.NewReader(body))
	r.RemoteAddr = ip + ":1234"
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
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

func (f *fixSesion) revocarClave(ip, cookie, csrf, id string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodDelete, "/v1/panel/claves-widget/"+id, nil)
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

func (f *fixSesion) widgetCon(clave string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/v1/widget/enlaces/"+f.enlace, nil)
	r.Header.Set("X-VC-Clave-Publica", clave)
	r.Header.Set("Origin", f.origen)
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}
