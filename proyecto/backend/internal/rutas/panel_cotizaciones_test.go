package rutas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
)

func TestFiltrosCotizacionesPanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	reloj := time.Date(2026, 10, 8, 18, 0, 0, 0, time.UTC)
	var secreto [20]byte
	for i := range secreto {
		secreto[i] = byte(i + 3)
	}
	cif, err := dominio.CifrarSecretoTOTP(f.claveSrv, secreto[:])
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
		AsesorID: f.asesor, Cifrado: cif, CreadaEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	const ip = "192.0.2.150"
	f.relojPanel(reloj)
	previa, _ := f.paso1(t, ip)
	pre := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones", ip, previa)
	if pre.Code != http.StatusUnauthorized || problemaSinTraza(t, pre)["codigo"] != "sesion_vencida" {
		t.Fatalf("preliminar: %d %s", pre.Code, pre.Body.String())
	}

	cookie, _ := f.entrarPanel(t, reloj.Add(3*time.Minute), ip, "juan@ejemplo.local", clavePanelOK, secreto[:])
	oct8 := time.Date(2026, 10, 8, 15, 0, 0, 0, time.UTC)
	oct1 := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	pintura, err := dominio.NuevaSesion(f.asesor, dominio.ModoAvatar3D, oct8, 45)
	if err != nil {
		t.Fatal(err)
	}
	antigua, err := dominio.NuevaSesion(f.asesor, dominio.ModoAvatar3D, oct1, 45)
	if err != nil {
		t.Fatal(err)
	}
	laura := debeAsesor(t)
	if err := f.alm.CrearAsesor(t.Context(), f.tenant, dominio.Asesor{
		ID: laura, Rol: dominio.RolAsesorBase, NombreVisible: "Laura G.",
		Email: "laura-lista@ejemplo.local", WhatsApp: "+5492235550102",
		Oficios: []dominio.Oficio{dominio.OficioJardineria}, Zonas: []dominio.Zona{dominio.ZonaCobo},
		CreadoEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	ajena, err := dominio.NuevaSesion(laura, dominio.ModoAvatar3D, oct8, 45)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range []dominio.Sesion{pintura, antigua, ajena} {
		if err := f.alm.CrearSesion(t.Context(), f.tenant, s); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.alm.GuardarCotizacion(t.Context(), f.tenant, cotizacionDePrueba(t, pintura.ID)); err != nil {
		t.Fatal(err)
	}

	todas := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones", ip, cookie)
	if todas.Code != http.StatusOK || strings.Contains(todas.Body.String(), ajena.ID) || strings.Contains(todas.Body.String(), "siguiente_cursor") {
		t.Fatalf("sin query: %d %s", todas.Code, todas.Body.String())
	}
	ids := idsCotizacion(t, todas)
	if len(ids) != 2 || ids[0] != pintura.ID || ids[1] != antigua.ID {
		t.Fatalf("sin query: %v", ids)
	}

	solo := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?oficio=pintura", ip, cookie)
	if solo.Code != http.StatusOK {
		t.Fatalf("pintura: %d %s", solo.Code, solo.Body.String())
	}
	var conOficio struct {
		Items []struct {
			ID     string `json:"sesion_id"`
			Oficio string `json:"oficio"`
		} `json:"items"`
	}
	if err := json.Unmarshal(solo.Body.Bytes(), &conOficio); err != nil {
		t.Fatal(err)
	}
	if len(conOficio.Items) != 1 || conOficio.Items[0].ID != pintura.ID || conOficio.Items[0].Oficio != "pintura" {
		t.Fatalf("pintura: %+v", conOficio.Items)
	}
	jardin := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?oficio=jardineria", ip, cookie)
	if jardin.Code != http.StatusOK || len(idsCotizacion(t, jardin)) != 0 {
		t.Fatalf("jardinería: %d %s", jardin.Code, jardin.Body.String())
	}
	malo := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?oficio=no_existe", ip, cookie)
	if malo.Code != http.StatusUnprocessableEntity || problemaSinTraza(t, malo)["codigo"] != "validacion_fallida" {
		t.Fatalf("oficio inválido: %d %s", malo.Code, malo.Body.String())
	}

	dia := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?desde=2026-10-08&hasta=2026-10-08", ip, cookie)
	if dia.Code != http.StatusOK {
		t.Fatalf("fechas: %d %s", dia.Code, dia.Body.String())
	}
	if ids := idsCotizacion(t, dia); len(ids) != 1 || ids[0] != pintura.ID {
		t.Fatalf("el 8 de octubre: %v", ids)
	}
	cruzado := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?desde=2026-10-31&hasta=2026-10-01", ip, cookie)
	if cruzado.Code != http.StatusUnprocessableEntity || problemaSinTraza(t, cruzado)["codigo"] != "validacion_fallida" {
		t.Fatalf("desde posterior: %d %s", cruzado.Code, cruzado.Body.String())
	}
	fechaMala := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?desde=2026-10-32", ip, cookie)
	if fechaMala.Code != http.StatusUnprocessableEntity || problemaSinTraza(t, fechaMala)["codigo"] != "validacion_fallida" {
		t.Fatalf("fecha: %d %s", fechaMala.Code, fechaMala.Body.String())
	}

	pag := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?limite=1", ip, cookie)
	if pag.Code != http.StatusOK {
		t.Fatalf("limite: %d %s", pag.Code, pag.Body.String())
	}
	var pagina struct {
		Items []struct {
			ID string `json:"sesion_id"`
		} `json:"items"`
		Cursor string `json:"siguiente_cursor"`
	}
	if err := json.Unmarshal(pag.Body.Bytes(), &pagina); err != nil {
		t.Fatal(err)
	}
	if len(pagina.Items) != 1 || pagina.Items[0].ID != pintura.ID || pagina.Cursor == "" {
		t.Fatalf("primera página: %+v", pagina)
	}
	sig := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?limite=1&cursor="+pagina.Cursor, ip, cookie)
	if sig.Code != http.StatusOK || strings.Contains(sig.Body.String(), ajena.ID) {
		t.Fatalf("cursor: %d %s", sig.Code, sig.Body.String())
	}
	if ids := idsCotizacion(t, sig); len(ids) != 1 || ids[0] != antigua.ID {
		t.Fatalf("segunda página: %v", ids)
	}
	deOtro := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?cursor="+almacen.CodificarCursor(ajena.CreadaEn, ajena.ID), ip, cookie)
	if deOtro.Code != http.StatusUnprocessableEntity || problemaSinTraza(t, deOtro)["codigo"] != "validacion_fallida" {
		t.Fatalf("cursor ajeno: %d %s", deOtro.Code, deOtro.Body.String())
	}
}

func idsCotizacion(t *testing.T, rr *httptest.ResponseRecorder) []string {
	t.Helper()
	filas := filasCotizacion(t, rr)
	ids := make([]string, len(filas))
	for i, f := range filas {
		ids[i] = f.ID
	}
	return ids
}
