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

func TestExportarMiCuenta(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	laura := debeAsesor(t)
	reloj := time.Date(2026, 10, 8, 21, 0, 0, 0, time.UTC)
	if err := f.a.CrearAsesor(t.Context(), f.tenant, dominio.Asesor{
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
		if err := f.a.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
			AsesorID: par.id, Cifrado: cif, CreadaEn: reloj,
		}); err != nil {
			t.Fatal(err)
		}
	}
	const ipAdmin, ipLaura = "192.0.2.141", "192.0.2.140"
	const telAjeno = "+5492235557777"
	const nombreAjeno = "Cliente Ajeno"

	rr := f.pedirExportacion(ipAdmin, "", "")
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "credencial_ausente" {
		t.Fatalf("sin cookie: %d %s", rr.Code, rr.Body.String())
	}
	f.relojPanel(reloj)
	previa, _ := f.paso1(t, ipAdmin)
	rr = f.pedirExportacion(ipAdmin, previa, "csrf-preliminar")
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "sesion_vencida" {
		t.Fatalf("preliminar: %d %s", rr.Code, rr.Body.String())
	}
	if n := f.cantidadLecturas(t, f.asesor); n != 0 {
		t.Fatalf("la preliminar escribió %d lecturas", n)
	}

	cookie, csrf := f.entrarPanel(t, reloj.Add(3*time.Minute), ipAdmin, "juan@ejemplo.local", clavePanelOK, secretoAdmin[:])
	rr = f.pedirExportacion(ipAdmin, cookie, csrf)
	if rr.Code != http.StatusUnauthorized || problemaSinTraza(t, rr)["codigo"] != "reautenticacion_requerida" {
		t.Fatalf("sin reautenticar: %d %s", rr.Code, rr.Body.String())
	}
	if n := f.cantidadLecturas(t, f.asesor); n != 0 {
		t.Fatalf("sin ventana escribió %d lecturas", n)
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
	distinto := f.pedirExportacion(ipAdmin, cookie, csrf+"x")
	if distinto.Code != http.StatusForbidden || problemaSinTraza(t, distinto)["codigo"] != "csrf_invalido" {
		t.Fatalf("csrf: %d %s", distinto.Code, distinto.Body.String())
	}
	if n := f.cantidadLecturas(t, f.asesor); n != 0 {
		t.Fatalf("el csrf escribió %d lecturas", n)
	}
	sin := f.pedirExportacion(ipAdmin, cookie, csrf)
	if sin.Code != http.StatusConflict || problemaSinTraza(t, sin)["codigo"] != "estado_invalido" {
		t.Fatalf("sin consentimiento: %d %s", sin.Code, sin.Body.String())
	}
	if n := f.cantidadLecturas(t, f.asesor); n != 0 {
		t.Fatalf("sin consentimiento escribió %d lecturas", n)
	}

	aceptado := time.Date(2026, 10, 1, 14, 20, 0, 0, time.UTC)
	if err := f.a.GuardarConsentimientoAsesor(t.Context(), f.tenant, dominio.ConsentimientoAsesor{
		AsesorID: f.asesor, Version: "2026-10-08.1", AceptadoEn: aceptado,
	}); err != nil {
		t.Fatal(err)
	}
	pedro := debeAsesor(t)
	if err := f.a.CrearAsesor(t.Context(), f.tenant, dominio.Asesor{
		ID: pedro, Rol: dominio.RolAsesorBase, NombreVisible: "Pedro A.",
		Email: "pedro@ejemplo.local", WhatsApp: "+5492235550198",
		Oficios: []dominio.Oficio{dominio.OficioPintura}, Zonas: []dominio.Zona{dominio.ZonaCobo},
		CreadoEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	suya, err := dominio.NuevaSesion(pedro, dominio.ModoAvatar3D, reloj, 45)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.a.CrearSesion(t.Context(), f.tenant, suya); err != nil {
		t.Fatal(err)
	}
	if _, err := f.a.RegistrarContacto(t.Context(), f.tenant, dominio.Contacto{
		SesionID: suya.ID, Nombre: nombreAjeno, Telefono: telAjeno, Email: "ajeno@cliente.local",
		AvisoVersion: "2026-10-08.1",
	}, reloj); err != nil {
		t.Fatal(err)
	}

	ok := f.pedirExportacion(ipAdmin, cookie, csrf)
	if ok.Code != http.StatusOK || ok.Header().Get("Set-Cookie") != "" {
		t.Fatalf("exportar: %d cookie %q %s", ok.Code, ok.Header().Get("Set-Cookie"), ok.Body.String())
	}
	cuerpo := ok.Body.String()
	for _, secreto := range []string{telAjeno, nombreAjeno, "ajeno@cliente.local", suya.ID, clavePanelOK, "vc_pub_sesionsecreto", "vc_sec_sesionsecreto"} {
		if strings.Contains(cuerpo, secreto) {
			t.Fatalf("la exportación incluye %q", secreto)
		}
	}
	var exp struct {
		Version string `json:"formato_version"`
		Cuando  string `json:"generada_en"`
		Perfil  struct {
			Consentimiento struct {
				Version string `json:"version"`
				Cuando  string `json:"aceptado_en"`
			} `json:"consentimiento_asesor"`
		} `json:"perfil"`
		Lecturas []struct {
			Accion  string `json:"accion"`
			Recurso string `json:"recurso_id"`
			Asesor  string `json:"asesor_id"`
		} `json:"lecturas"`
		Consumo struct {
			Ambito    string `json:"ambito"`
			Periodo   string `json:"periodo"`
			Usados    int    `json:"segundos_usados"`
			Tope      int    `json:"segundos_tope"`
			EnCurso   int    `json:"simultaneas_en_curso"`
			SimTope   int    `json:"simultaneas_tope"`
			Alerta    string `json:"alerta"`
			Diario    []any  `json:"diario"`
			Actualizo string `json:"actualizado_en"`
		} `json:"consumo"`
	}
	if err := json.Unmarshal(ok.Body.Bytes(), &exp); err != nil {
		t.Fatal(err)
	}
	if exp.Version != "1" || exp.Cuando != cuando.Format(time.RFC3339) || exp.Perfil.Consentimiento.Version != "2026-10-08.1" || exp.Perfil.Consentimiento.Cuando != aceptado.Format(time.RFC3339) {
		t.Fatalf("cabecera: %+v", exp)
	}
	if exp.Consumo.Ambito != "asesor" || exp.Consumo.Periodo != "2026-10" || exp.Consumo.Usados != 0 || exp.Consumo.Tope != 30000 || exp.Consumo.EnCurso != 0 || exp.Consumo.SimTope != 5 || exp.Consumo.Alerta != "ninguna" || len(exp.Consumo.Diario) != 0 || exp.Consumo.Actualizo != exp.Cuando {
		t.Fatalf("consumo: %+v", exp.Consumo)
	}
	var propia string
	for _, l := range exp.Lecturas {
		if l.Accion == "exportar_mi_cuenta" && l.Asesor == f.asesor && l.Recurso == f.asesor {
			propia = l.Accion
		}
	}
	if propia == "" || len(exp.Lecturas) != 1 {
		t.Fatalf("lecturas: %+v", exp.Lecturas)
	}
	perfil := f.pedirRuta(http.MethodGet, "/v1/panel/perfil", ipAdmin, cookie)
	if perfil.Code != http.StatusOK || !strings.Contains(perfil.Body.String(), `"version":"2026-10-08.1"`) {
		t.Fatalf("perfil: %d %s", perfil.Code, perfil.Body.String())
	}
	get := f.pedirPanel(http.MethodGet, ipAdmin, cookie, "")
	var sesion map[string]any
	if err := json.Unmarshal(get.Body.Bytes(), &sesion); err != nil {
		t.Fatal(err)
	}
	if get.Code != http.StatusOK || sesion["reautenticado_hasta"] != ventana.Hasta {
		t.Fatalf("la ventana no debía consumirse: %d %+v", get.Code, sesion)
	}

	cookieLaura, csrfLaura := f.entrarPanel(t, reloj.Add(9*time.Minute), ipLaura, "laura@ejemplo.local", claveLaura, secretoLaura[:])
	cuandoLaura := reloj.Add(12 * time.Minute)
	f.relojPanel(cuandoLaura)
	reLaura := f.reautenticar(ipLaura, cookieLaura, csrfLaura, reauthJSON(claveLaura, dominio.CodigoTOTP(secretoLaura[:], cuandoLaura)))
	if reLaura.Code != http.StatusOK {
		t.Fatalf("reautenticar laura: %d %s", reLaura.Code, reLaura.Body.String())
	}
	if err := f.a.GuardarConsentimientoAsesor(t.Context(), f.tenant, dominio.ConsentimientoAsesor{
		AsesorID: laura, Version: "2026-10-08.1", AceptadoEn: aceptado,
	}); err != nil {
		t.Fatal(err)
	}
	suyaExport := f.pedirExportacion(ipLaura, cookieLaura, csrfLaura)
	if suyaExport.Code != http.StatusOK || strings.Contains(suyaExport.Body.String(), telAjeno) || strings.Contains(suyaExport.Body.String(), f.asesor) {
		t.Fatalf("asesor: %d %s", suyaExport.Code, suyaExport.Body.String())
	}
}

func (f *fixSesion) pedirExportacion(ip, cookie, csrf string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/panel/mi-cuenta/exportacion", nil)
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

func (f *fixSesion) cantidadLecturas(t *testing.T, asesor string) int {
	t.Helper()
	lista, err := f.a.ListarLecturasDelAsesor(t.Context(), f.tenant, asesor)
	if err != nil {
		t.Fatal(err)
	}
	return len(lista)
}
