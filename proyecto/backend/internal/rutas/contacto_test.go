package rutas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

func TestRegistrarContacto(t *testing.T) {
	g := nuevaFixtureSesion(t)
	a := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))
	b := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))

	rr := g.contacto("", a.SesionID, contactoValido())
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_ausente" {
		t.Fatalf("sin Bearer: %d %s", rr.Code, rr.Body)
	}
	rr = g.contacto(a.Token.Valor, b.SesionID, contactoValido())
	if rr.Code != http.StatusNotFound || codigoDe(t, rr) != "no_encontrado" {
		t.Fatalf("token de otra sesión: %d %s", rr.Code, rr.Body)
	}
	rr = g.contacto(g.sec, a.SesionID, contactoValido())
	if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "alcance_insuficiente" {
		t.Fatalf("clave secreta: %d %s", rr.Code, rr.Body)
	}
	r := httptest.NewRequest(http.MethodPost, "/v1/sesiones/"+a.SesionID+"/contacto", strings.NewReader(contactoValido()))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-VC-Clave-Publica", g.pub)
	r.Header.Set("Origin", g.origen)
	rr = httptest.NewRecorder()
	g.h.ServeHTTP(rr, r)
	if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "alcance_insuficiente" {
		t.Fatalf("clave pública: %d %s", rr.Code, rr.Body)
	}
	revocada := time.Now().UTC()
	if err := g.a.GuardarClave(t.Context(), g.tenant, dominio.ClaveAPI{
		ID: debeClave(t, false), Tipo: dominio.ClaveSecreta, Hash: claves.HMAC(g.claveSrv, "vc_sec_revocadacontac"),
		Prefijo: "vc_sec_rcon", CreadaEn: revocada, RevocadaEn: &revocada,
	}); err != nil {
		t.Fatal(err)
	}
	rr = g.contacto("vc_sec_revocadacontac", a.SesionID, contactoValido())
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_invalida" {
		t.Fatalf("secreta revocada: %d %s", rr.Code, rr.Body)
	}

	rr = g.contacto(a.Token.Valor, a.SesionID, contactoSinAceptar())
	if rr.Code != http.StatusUnprocessableEntity || codigoDe(t, rr) != "validacion_fallida" {
		t.Fatalf("sin aceptar: %d %s", rr.Code, rr.Body)
	}
	if _, err := g.a.LeerContacto(t.Context(), g.tenant, a.SesionID); !errores.Es(err, errores.NoEncontrado) {
		t.Fatal("se guardó un contacto sin consentimiento")
	}
	rr = g.contacto(a.Token.Valor, a.SesionID, contactoAvisoViejo())
	if rr.Code != http.StatusUnprocessableEntity || codigoDe(t, rr) != "validacion_fallida" {
		t.Fatalf("aviso viejo: %d %s", rr.Code, rr.Body)
	}
	rr = g.contacto(a.Token.Valor, a.SesionID, contactoFinalidad())
	if rr.Code != http.StatusUnprocessableEntity || codigoDe(t, rr) != "validacion_fallida" {
		t.Fatalf("finalidad: %d %s", rr.Code, rr.Body)
	}
	rr = g.contacto(a.Token.Valor, a.SesionID, contactoSinMedio())
	if rr.Code != http.StatusUnprocessableEntity || codigoDe(t, rr) != "validacion_fallida" {
		t.Fatalf("sin teléfono ni email: %d %s", rr.Code, rr.Body)
	}
	if _, err := g.a.LeerContacto(t.Context(), g.tenant, a.SesionID); !errores.Es(err, errores.NoEncontrado) {
		t.Fatal("un 422 guardó el contacto")
	}

	rr = g.contacto(a.Token.Valor, a.SesionID, contactoValido())
	if rr.Code != http.StatusCreated {
		t.Fatalf("crear: %d %s", rr.Code, rr.Body)
	}
	if strings.Contains(rr.Body.String(), "+5492235551000") || strings.Contains(rr.Body.String(), "Marta") {
		t.Fatalf("la respuesta repite datos personales: %s", rr.Body)
	}
	var m map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	reg, _ := m["registrado_en"].(string)
	if m["sesion_id"] != a.SesionID || m["aviso_version"] != versionAviso || m["retencion_dias"] != float64(45) || !strings.HasSuffix(reg, "Z") {
		t.Fatalf("cuerpo: %+v", m)
	}
	if _, ok := m["telefono"]; ok {
		t.Fatal("el JSON trae teléfono")
	}
	guardado, err := g.a.LeerContacto(t.Context(), g.tenant, a.SesionID)
	if err != nil || guardado.Telefono != "+5492235551000" || guardado.Nombre != "Marta" {
		t.Fatalf("guardado: %v %+v", err, guardado)
	}

	rr = g.contacto(a.Token.Valor, a.SesionID, contactoOtroTelefono())
	if rr.Code != http.StatusConflict || codigoDe(t, rr) != "contacto_ya_registrado" {
		t.Fatalf("repetir: %d %s", rr.Code, rr.Body)
	}
	otraVez, err := g.a.LeerContacto(t.Context(), g.tenant, a.SesionID)
	if err != nil || otraVez.Telefono != guardado.Telefono || !otraVez.RegistradoEn.Equal(guardado.RegistradoEn) {
		t.Fatalf("el segundo pisó el primero: %+v", otraVez)
	}

	rr = g.cerrar(b.Token.Valor, b.SesionID, "cliente_cerro")
	if rr.Code != http.StatusOK {
		t.Fatalf("cerrar: %d %s", rr.Code, rr.Body)
	}
	rr = g.contacto(b.Token.Valor, b.SesionID, contactoValido())
	if rr.Code != http.StatusCreated {
		t.Fatalf("contacto con sesión cerrada: %d %s", rr.Code, rr.Body)
	}
}

func (f *fixSesion) contacto(auth, sesionID, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/sesiones/"+sesionID+"/contacto", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if auth != "" {
		r.Header.Set("Authorization", "Bearer "+auth)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func contactoValido() string {
	return `{"nombre":"Marta","telefono":"+5492235551000","consentimiento":{"aviso_version":"` + versionAviso + `","acepta_ser_contactado":true,"finalidad":"que_el_profesional_te_contacte"}}`
}

func contactoOtroTelefono() string {
	return `{"nombre":"Otra","telefono":"+5492235551999","consentimiento":{"aviso_version":"` + versionAviso + `","acepta_ser_contactado":true,"finalidad":"que_el_profesional_te_contacte"}}`
}

func contactoSinAceptar() string {
	return `{"nombre":"Marta","telefono":"+5492235551000","consentimiento":{"aviso_version":"` + versionAviso + `","acepta_ser_contactado":false,"finalidad":"que_el_profesional_te_contacte"}}`
}

func contactoAvisoViejo() string {
	return `{"nombre":"Marta","telefono":"+5492235551000","consentimiento":{"aviso_version":"2026-10-01.2","acepta_ser_contactado":true,"finalidad":"que_el_profesional_te_contacte"}}`
}

func contactoFinalidad() string {
	return `{"nombre":"Marta","telefono":"+5492235551000","consentimiento":{"aviso_version":"` + versionAviso + `","acepta_ser_contactado":true,"finalidad":"publicidad"}}`
}

func contactoSinMedio() string {
	return `{"nombre":"Marta","consentimiento":{"aviso_version":"` + versionAviso + `","acepta_ser_contactado":true,"finalidad":"que_el_profesional_te_contacte"}}`
}
