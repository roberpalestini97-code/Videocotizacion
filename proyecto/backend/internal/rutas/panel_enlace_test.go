package rutas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"videocotizacion/backend/internal/dominio"
)

func TestRotarEnlacePanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	var secreto [20]byte
	for i := range secreto {
		secreto[i] = byte(i + 1)
	}
	reloj := time.Date(2026, 10, 8, 19, 0, 0, 0, time.UTC)
	cif, err := dominio.CifrarSecretoTOTP(f.claveSrv, secreto[:])
	if err != nil {
		t.Fatal(err)
	}
	if err := f.a.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
		AsesorID: f.asesor, Cifrado: cif, CreadaEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	const ip = "192.0.2.120"
	viejo := f.enlace

	rr := f.rotarEnlace(ip, "", "x")
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "credencial_ausente" {
		t.Fatalf("sin cookie: %d %s", rr.Code, rr.Body.String())
	}
	f.relojPanel(reloj)
	previa, csrfPrevio := f.paso1(t, ip)
	rr = f.rotarEnlace(ip, previa, csrfPrevio)
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
		t.Fatalf("preliminar: %d %s", rr.Code, rr.Body.String())
	}

	cookie, csrf, _, _ := f.sesionTOTP(t, reloj, ip, secreto[:])
	rr = f.rotarEnlace(ip, cookie, csrf)
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "reautenticacion_requerida" {
		t.Fatalf("sin reautenticar: %d %s", rr.Code, rr.Body.String())
	}
	if w := f.widget(viejo); w.Code != http.StatusOK || nombreWidget(t, w) != "Juan P." {
		t.Fatalf("el viejo debía seguir: %d %s", w.Code, w.Body.String())
	}

	cuando := reloj.Add(3 * time.Minute)
	f.relojPanel(cuando)
	otorgada := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelOK, dominio.CodigoTOTP(secreto[:], cuando)))
	if otorgada.Code != http.StatusOK {
		t.Fatalf("reautenticar: %d %s", otorgada.Code, otorgada.Body.String())
	}
	distinto := f.rotarEnlace(ip, cookie, csrf+"x")
	if distinto.Code != http.StatusForbidden || problemaSinTraza(t, distinto)["codigo"] != "csrf_invalido" {
		t.Fatalf("csrf: %d %s", distinto.Code, distinto.Body.String())
	}
	if w := f.widget(viejo); w.Code != http.StatusOK {
		t.Fatalf("el csrf no debía rotar: %d %s", w.Code, w.Body.String())
	}

	f.relojPanel(cuando.Add(5 * time.Minute))
	vencida := f.rotarEnlace(ip, cookie, csrf)
	if vencida.Code != http.StatusUnauthorized || problemaSinTraza(t, vencida)["codigo"] != "reautenticacion_requerida" {
		t.Fatalf("a los cinco minutos: %d %s", vencida.Code, vencida.Body.String())
	}
	if w := f.widget(viejo); w.Code != http.StatusOK {
		t.Fatalf("el vencimiento no debía rotar: %d %s", w.Code, w.Body.String())
	}

	otro := reloj.Add(9 * time.Minute)
	f.relojPanel(otro)
	deNuevo := f.reautenticar(ip, cookie, csrf, reauthJSON(clavePanelOK, dominio.CodigoTOTP(secreto[:], otro)))
	if deNuevo.Code != http.StatusOK {
		t.Fatalf("segunda reautenticación: %d %s", deNuevo.Code, deNuevo.Body.String())
	}
	var ventana struct {
		Hasta string `json:"valida_hasta"`
	}
	if err := json.Unmarshal(deNuevo.Body.Bytes(), &ventana); err != nil {
		t.Fatal(err)
	}
	primero := f.rotarEnlace(ip, cookie, csrf)
	uno := enlaceCompartido(t, primero, viejo, otro)
	if w := f.widget(viejo); w.Code != http.StatusNotFound || problemaSinTraza(t, w)["codigo"] != "no_encontrado" {
		t.Fatalf("viejo: %d %s", w.Code, w.Body.String())
	}
	if w := f.widget(uno.ID); w.Code != http.StatusOK || nombreWidget(t, w) != "Juan P." {
		t.Fatalf("nuevo: %d %s", w.Code, w.Body.String())
	}

	f.relojPanel(otro.Add(time.Minute))
	segundo := f.rotarEnlace(ip, cookie, csrf)
	dos := enlaceCompartido(t, segundo, uno.ID, otro.Add(time.Minute))
	if w := f.widget(uno.ID); w.Code != http.StatusNotFound || problemaSinTraza(t, w)["codigo"] != "no_encontrado" {
		t.Fatalf("la primera rotación: %d %s", w.Code, w.Body.String())
	}
	if w := f.widget(dos.ID); w.Code != http.StatusOK || nombreWidget(t, w) != "Juan P." {
		t.Fatalf("la segunda: %d %s", w.Code, w.Body.String())
	}
	get := f.pedirPanel(http.MethodGet, ip, cookie, "")
	if get.Code != http.StatusOK {
		t.Fatalf("sesión: %d %s", get.Code, get.Body.String())
	}
	var sesion map[string]any
	if err := json.Unmarshal(get.Body.Bytes(), &sesion); err != nil {
		t.Fatal(err)
	}
	if sesion["reautenticado_hasta"] != ventana.Hasta {
		t.Fatalf("la ventana no debía consumirse: %+v", sesion)
	}
}

func enlaceCompartido(t *testing.T, rr *httptest.ResponseRecorder, anterior string, cuando time.Time) (cuerpo struct {
	ID     string `json:"id_publico"`
	URL    string `json:"url"`
	Texto  string `json:"texto_compartir"`
	Cuando string `json:"rotado_en"`
}) {
	t.Helper()
	if rr.Code != http.StatusOK || rr.Header().Get("Set-Cookie") != "" {
		t.Fatalf("rotar: %d cookie %q %s", rr.Code, rr.Header().Get("Set-Cookie"), rr.Body.String())
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}
	url := "https://cotizar.videocotizacion.local/c/" + cuerpo.ID
	if len(cuerpo.ID) != 22 || cuerpo.ID == anterior || cuerpo.URL != url || cuerpo.Texto != "Pedí tu presupuesto por videollamada: "+url || cuerpo.Cuando != dominio.Instante(cuando).Format(time.RFC3339) {
		t.Fatalf("enlace %+v", cuerpo)
	}
	return cuerpo
}

func nombreWidget(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()
	var cuerpo struct {
		Profesional struct {
			Nombre string `json:"nombre_visible"`
		} `json:"profesional"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}
	return cuerpo.Profesional.Nombre
}

func (f *fixSesion) rotarEnlace(ip, cookie, csrf string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/panel/enlace/rotacion", nil)
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

func (f *fixSesion) widget(id string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/v1/widget/enlaces/"+id, nil)
	r.Header.Set("X-VC-Clave-Publica", f.pub)
	r.Header.Set("Origin", f.origen)
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}
