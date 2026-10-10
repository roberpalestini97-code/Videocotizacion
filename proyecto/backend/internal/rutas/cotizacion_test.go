package rutas

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
)

func TestLeerCotizacionYDerivacion(t *testing.T) {
	g := nuevaFixtureSesion(t)
	a := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))
	b := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))

	rr := g.cotizacion("", a.SesionID)
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_ausente" {
		t.Fatalf("cotización sin Bearer: %d %s", rr.Code, rr.Body)
	}
	rr = g.derivacion("", a.SesionID)
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_ausente" {
		t.Fatalf("derivación sin Bearer: %d %s", rr.Code, rr.Body)
	}

	rr = g.cotizacion(a.Token.Valor, a.SesionID)
	if rr.Code != http.StatusConflict || codigoDe(t, rr) != "cotizacion_no_emitida" {
		t.Fatalf("sin cotización: %d %s", rr.Code, rr.Body)
	}
	rr = g.cotizacion(a.Token.Valor, b.SesionID)
	if rr.Code != http.StatusNotFound || codigoDe(t, rr) != "no_encontrado" {
		t.Fatalf("token de otra sesión: %d %s", rr.Code, rr.Body)
	}

	revocada := time.Now().UTC()
	if err := g.alm.GuardarClave(t.Context(), g.tenant, dominio.ClaveAPI{
		ID: debeClave(t, false), Tipo: dominio.ClaveSecreta, Hash: claves.HMAC(g.claveSrv, "vc_sec_revocadacotiz"),
		Prefijo: "vc_sec_rcot", CreadaEn: revocada, RevocadaEn: &revocada,
	}); err != nil {
		t.Fatal(err)
	}
	rr = g.cotizacion("vc_sec_revocadacotiz", a.SesionID)
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_invalida" {
		t.Fatalf("secreta revocada: %d %s", rr.Code, rr.Body)
	}

	rr = g.derivacion(a.Token.Valor, a.SesionID)
	if rr.Code != http.StatusConflict || codigoDe(t, rr) != "estado_invalido" {
		t.Fatalf("derivación con sesión abierta: %d %s", rr.Code, rr.Body)
	}

	cot := cotizacionDePrueba(t, a.SesionID)
	if err := g.alm.GuardarCotizacion(t.Context(), g.tenant, cot); err != nil {
		t.Fatal(err)
	}
	rr = g.cotizacion(a.Token.Valor, a.SesionID)
	exigirCotizacion(t, rr, cot)
	rr = g.cotizacion(g.sec, a.SesionID)
	exigirCotizacion(t, rr, cot)

	rr = g.cerrar(a.Token.Valor, a.SesionID, "cliente_cerro")
	if rr.Code != http.StatusOK {
		t.Fatalf("cerrar: %d %s", rr.Code, rr.Body)
	}
	var cierre struct {
		CerradaEn string `json:"cerrada_en"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &cierre); err != nil {
		t.Fatal(err)
	}
	rr = g.derivacion(a.Token.Valor, a.SesionID)
	exigirDerivacion(t, rr, a.SesionID, cierre.CerradaEn)
	otra := g.derivacion(g.sec, a.SesionID)
	exigirDerivacion(t, otra, a.SesionID, cierre.CerradaEn)
}

func (f *fixSesion) cotizacion(auth, sesionID string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/v1/sesiones/"+sesionID+"/cotizacion", nil)
	if auth != "" {
		r.Header.Set("Authorization", "Bearer "+auth)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func (f *fixSesion) derivacion(auth, sesionID string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/v1/sesiones/"+sesionID+"/derivacion", nil)
	if auth != "" {
		r.Header.Set("Authorization", "Bearer "+auth)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func cotizacionDePrueba(t *testing.T, sesionID string) dominio.Cotizacion {
	t.Helper()
	id, err := dominio.NuevoIDCotizacion()
	if err != nil {
		t.Fatal(err)
	}
	const cantidad = 1250
	precio := dominio.Centavos(185000)
	importe, err := dominio.ImporteItem(cantidad, precio)
	if err != nil {
		t.Fatal(err)
	}
	emitida := time.Date(2026, 10, 8, 13, 20, 0, 0, time.UTC)
	return dominio.Cotizacion{
		ID: id, SesionID: sesionID, EmitidaEn: emitida, Moneda: dominio.MonedaARS,
		Oficio: dominio.OficioPintura, Zona: dominio.ZonaOtra, FueraDeZona: true,
		Items: []dominio.ItemCotizacion{{
			Tipo: dominio.ItemManoDeObra, CodigoTarea: "pintura_interior",
			Descripcion: "Pintura interior látex, dos manos", Unidad: dominio.UnidadM2,
			CantidadCentesimas: cantidad, PrecioUnitarioMinCentavos: precio, PrecioUnitarioMaxCentavos: precio,
			ImporteMinCentavos: importe, ImporteMaxCentavos: importe,
		}},
		TotalMinCentavos: importe, TotalMaxCentavos: importe,
		Tarifas:         dominio.Tarifas{Version: "2026.1", Estado: dominio.TarifasSinValidar},
		ValidezDias:     15,
		Leyenda:         "Presupuesto orientativo fuera de zona: el profesional confirma traslado y precio final.",
		BorrarDespuesDe: emitida.AddDate(0, 0, 15),
	}
}

func exigirCotizacion(t *testing.T, rr *httptest.ResponseRecorder, cot dominio.Cotizacion) {
	t.Helper()
	if rr.Code != http.StatusOK {
		t.Fatalf("cotización: %d %s", rr.Code, rr.Body)
	}
	if strings.Contains(rr.Body.String(), `\u`) {
		t.Fatalf("el JSON escapó caracteres: %s", rr.Body)
	}
	dec := json.NewDecoder(bytes.NewReader(rr.Body.Bytes()))
	dec.UseNumber()
	var m map[string]any
	if err := dec.Decode(&m); err != nil {
		t.Fatal(err)
	}
	entero(t, m["total_centavos"], int64(cot.TotalMinCentavos), "total")
	if m["moneda"] != "ARS" || m["fuera_de_zona"] != true || m["orientativa"] != true || m["cotizacion_id"] != cot.ID {
		t.Fatalf("cabecera: %+v", m)
	}
	items, _ := m["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("ítems: %+v", m["items"])
	}
	it, _ := items[0].(map[string]any)
	entero(t, it["precio_unitario_centavos"], int64(cot.Items[0].PrecioUnitarioMinCentavos), "precio")
	entero(t, it["importe_centavos"], int64(cot.Items[0].ImporteMinCentavos), "importe")
	entero(t, it["cantidad_centesimas"], cot.Items[0].CantidadCentesimas, "cantidad")
}

func entero(t *testing.T, v any, quiero int64, que string) {
	t.Helper()
	n, ok := v.(json.Number)
	if !ok || strings.ContainsAny(n.String(), ".eE") {
		t.Fatalf("%s no es un entero: %#v", que, v)
	}
	got, err := n.Int64()
	if err != nil || got != quiero {
		t.Fatalf("%s: %v, quería %d", que, v, quiero)
	}
}

func exigirDerivacion(t *testing.T, rr *httptest.ResponseRecorder, sesionID, cerradaEn string) {
	t.Helper()
	if rr.Code != http.StatusOK {
		t.Fatalf("derivación: %d %s", rr.Code, rr.Body)
	}
	var m map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	codigo, _ := m["codigo_referencia"].(string)
	texto, _ := m["texto_prellenado"].(string)
	wa, _ := m["url_wa_me"].(string)
	cuerpo := strings.TrimPrefix(sesionID, "ses_")
	quiero := "VC-" + cuerpo[:4] + "-" + cuerpo[4:10]
	if codigo != quiero || !regexp.MustCompile(`^VC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{6}$`).MatchString(codigo) {
		t.Fatalf("código: %s", codigo)
	}
	if texto != "Hola, quiero seguir con mi videocotización "+codigo || m["generada_en"] != cerradaEn {
		t.Fatalf("texto: %+v", m)
	}
	if !strings.HasPrefix(wa, "https://wa.me/5492235550000?text=") || !strings.Contains(wa, codigo) || strings.Contains(wa, "+") {
		t.Fatalf("url: %s", wa)
	}
	plano := rr.Body.String()
	for _, privado := range []string{"Juan P.", "juan@ejemplo.local", "+5492235550000"} {
		if strings.Contains(plano, privado) {
			t.Fatalf("la derivación incluye %q: %s", privado, plano)
		}
	}
}
