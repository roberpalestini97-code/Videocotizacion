package rutas

import (
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

func TestTokenMediosYCierre(t *testing.T) {
	g := nuevaFixtureSesion(t)
	a := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))

	rr := g.medios("", a.SesionID)
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_ausente" {
		t.Fatalf("token sin Bearer: %d %s", rr.Code, rr.Body)
	}
	rr = g.cerrar("", a.SesionID, "cliente_cerro")
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_ausente" {
		t.Fatalf("cierre sin Bearer: %d %s", rr.Code, rr.Body)
	}

	antes := g.a.CantidadTokens(g.tenant)
	rr = g.medios(a.Token.Valor, a.SesionID)
	if rr.Code != http.StatusConflict || codigoDe(t, rr) != "consentimiento_requerido" {
		t.Fatalf("sin consentimiento: %d %s", rr.Code, rr.Body)
	}
	if strings.Contains(rr.Body.String(), "vc_med_") || g.a.CantidadTokens(g.tenant) != antes {
		t.Fatalf("se emitió un token: %d %s", g.a.CantidadTokens(g.tenant), rr.Body)
	}
	leida, err := g.a.LeerSesion(t.Context(), g.tenant, a.SesionID)
	if err != nil || leida.Estado != dominio.EstadoCreada {
		t.Fatalf("la sesión cambió: %v %+v", err, leida)
	}

	rr = g.medios(g.sec, a.SesionID)
	if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "alcance_insuficiente" {
		t.Fatalf("clave secreta: %d %s", rr.Code, rr.Body)
	}
	r := httptest.NewRequest(http.MethodPost, "/v1/sesiones/"+a.SesionID+"/token-medios", nil)
	r.Header.Set("X-VC-Clave-Publica", g.pub)
	rr = httptest.NewRecorder()
	g.h.ServeHTTP(rr, r)
	if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "alcance_insuficiente" {
		t.Fatalf("clave pública: %d %s", rr.Code, rr.Body)
	}
	revocada := time.Now().UTC()
	if err := g.a.GuardarClave(t.Context(), g.tenant, dominio.ClaveAPI{
		ID: debeClave(t, false), Tipo: dominio.ClaveSecreta, Hash: claves.HMAC(g.claveSrv, "vc_sec_revocadamedios"),
		Prefijo: "vc_sec_revo", CreadaEn: revocada, RevocadaEn: &revocada,
	}); err != nil {
		t.Fatal(err)
	}
	rr = g.medios("vc_sec_revocadamedios", a.SesionID)
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_invalida" {
		t.Fatalf("secreta revocada: %d %s", rr.Code, rr.Body)
	}
	if g.a.CantidadTokens(g.tenant) != antes {
		t.Fatal("una credencial rechazada guardó un token")
	}

	rr = g.consentir(a.Token.Valor, a.SesionID, consentimientoValido())
	if rr.Code != http.StatusCreated {
		t.Fatalf("consentir: %d %s", rr.Code, rr.Body)
	}
	rr = g.medios(a.Token.Valor, a.SesionID)
	tok := exigirTokenMedios(t, rr, a.SesionID)
	leida, err = g.a.LeerSesion(t.Context(), g.tenant, a.SesionID)
	if err != nil || leida.Estado != dominio.EstadoEnCurso {
		t.Fatalf("estado tras el token: %v %+v", err, leida)
	}
	hall, err := g.a.BuscarTokenPorHash(t.Context(), claves.HMAC(g.claveSrv, tok.Token))
	if err != nil || hall.SesionID != a.SesionID || hall.Revocado {
		t.Fatalf("hmac de medios: %v %+v", err, hall)
	}
	sum := sha256.Sum256([]byte(tok.Token))
	if _, err := g.a.BuscarTokenPorHash(t.Context(), sum[:]); !errores.Es(err, errores.NoEncontrado) {
		t.Fatalf("el valor en claro no tiene que persistirse: %v", err)
	}

	b := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))
	rr = g.cerrar(b.Token.Valor, b.SesionID, "completada")
	if rr.Code != http.StatusUnprocessableEntity || codigoDe(t, rr) != "validacion_fallida" {
		t.Fatalf("motivo completada: %d %s", rr.Code, rr.Body)
	}
	leida, err = g.a.LeerSesion(t.Context(), g.tenant, b.SesionID)
	if err != nil || leida.Estado != dominio.EstadoCreada {
		t.Fatalf("completada cambió la sesión: %v %+v", err, leida)
	}
	rr = g.cerrar(b.Token.Valor, b.SesionID, "sin_consentimiento")
	exigirCierre(t, rr, b.SesionID, "sin_consentimiento", 0)
	rr = g.cerrar(b.Token.Valor, b.SesionID, "sin_consentimiento")
	if rr.Code != http.StatusConflict || codigoDe(t, rr) != "sesion_cerrada" {
		t.Fatalf("segundo cierre: %d %s", rr.Code, rr.Body)
	}

	c := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))
	rr = g.consentir(c.Token.Valor, c.SesionID, consentimientoValido())
	if rr.Code != http.StatusCreated {
		t.Fatalf("consentir c: %d %s", rr.Code, rr.Body)
	}
	rr = g.cerrar(c.Token.Valor, c.SesionID, "sin_camara")
	if rr.Code != http.StatusConflict || codigoDe(t, rr) != "estado_invalido" {
		t.Fatalf("sin_camara ya consentida: %d %s", rr.Code, rr.Body)
	}
	rr = g.cerrar(g.sec, c.SesionID, "cliente_cerro")
	exigirCierre(t, rr, c.SesionID, "cliente_cerro", -1)
}

func TestCupoSimultaneas(t *testing.T) {
	g := nuevaFixtureSesionTope(t, 1)
	a := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))
	b := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))
	for _, s := range []respuestaCreada{a, b} {
		rr := g.consentir(s.Token.Valor, s.SesionID, consentimientoValido())
		if rr.Code != http.StatusCreated {
			t.Fatalf("consentir %s: %d %s", s.SesionID, rr.Code, rr.Body)
		}
	}
	rr := g.medios(a.Token.Valor, a.SesionID)
	primero := exigirTokenMedios(t, rr, a.SesionID)
	rr = g.medios(b.Token.Valor, b.SesionID)
	if rr.Code != http.StatusTooManyRequests || codigoDe(t, rr) != "cuota_agotada" || rr.Header().Get("Retry-After") == "" {
		t.Fatalf("segunda emisión: %d %s retry %q", rr.Code, rr.Body, rr.Header().Get("Retry-After"))
	}
	if rr.Header().Get("Retry-After") != "3600" {
		t.Fatalf("Retry-After: %s", rr.Header().Get("Retry-After"))
	}
	la, err1 := g.a.LeerSesion(t.Context(), g.tenant, a.SesionID)
	lb, err2 := g.a.LeerSesion(t.Context(), g.tenant, b.SesionID)
	if err1 != nil || err2 != nil || la.Estado != dominio.EstadoEnCurso || lb.Estado != dominio.EstadoConsentida {
		t.Fatalf("estados tras el 429: %v %v %s %s", err1, err2, la.Estado, lb.Estado)
	}

	rr = g.medios(a.Token.Valor, a.SesionID)
	reconexion := exigirTokenMedios(t, rr, a.SesionID)
	if reconexion.Token == primero.Token {
		t.Fatal("la reconexión repitió el token")
	}
	viejo, err := g.a.BuscarTokenPorHash(t.Context(), claves.HMAC(g.claveSrv, primero.Token))
	if err != nil || !viejo.Revocado {
		t.Fatalf("el token anterior sigue vigente: %v %+v", err, viejo)
	}
	rr = g.medios(b.Token.Valor, b.SesionID)
	if rr.Code != http.StatusTooManyRequests || codigoDe(t, rr) != "cuota_agotada" {
		t.Fatalf("la reconexión consumió otro cupo: %d %s", rr.Code, rr.Body)
	}

	rr = g.cerrar(a.Token.Valor, a.SesionID, "cliente_cerro")
	exigirCierre(t, rr, a.SesionID, "cliente_cerro", -1)
	rr = g.cerrar(a.Token.Valor, a.SesionID, "cliente_cerro")
	if rr.Code != http.StatusConflict || codigoDe(t, rr) != "sesion_cerrada" {
		t.Fatalf("segundo cierre: %d %s", rr.Code, rr.Body)
	}
	rr = g.medios(b.Token.Valor, b.SesionID)
	exigirTokenMedios(t, rr, b.SesionID)
	lb, err = g.a.LeerSesion(t.Context(), g.tenant, b.SesionID)
	if err != nil || lb.Estado != dominio.EstadoEnCurso {
		t.Fatalf("la segunda no entró: %v %+v", err, lb)
	}
}

func (f *fixSesion) medios(auth, sesionID string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/sesiones/"+sesionID+"/token-medios", nil)
	if auth != "" {
		r.Header.Set("Authorization", "Bearer "+auth)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func (f *fixSesion) cerrar(auth, sesionID, motivo string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/sesiones/"+sesionID+"/cierre", strings.NewReader(`{"motivo":"`+motivo+`"}`))
	r.Header.Set("Content-Type", "application/json")
	if auth != "" {
		r.Header.Set("Authorization", "Bearer "+auth)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

type tokenMedios struct {
	Token     string `json:"token"`
	WSURL     string `json:"ws_url"`
	VenceEn   string `json:"vence_en"`
	VenceEnS  int    `json:"vence_en_s"`
	UnSoloUso bool   `json:"un_solo_uso"`
	Protocolo string `json:"protocolo_eventos"`
}

func exigirTokenMedios(t *testing.T, rr *httptest.ResponseRecorder, sesionID string) tokenMedios {
	t.Helper()
	if rr.Code != http.StatusCreated {
		t.Fatalf("token de medios: %d %s", rr.Code, rr.Body)
	}
	var m tokenMedios
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^vc_med_[A-Za-z0-9_-]{43}$`).MatchString(m.Token) {
		t.Fatalf("token: %s", m.Token)
	}
	quiero := "wss://api.videocotizacion.local/v1/sesiones/" + sesionID + "/medios"
	vence, err := time.Parse(time.RFC3339, m.VenceEn)
	if err != nil || !strings.HasSuffix(m.VenceEn, "Z") || m.VenceEnS != 30 || !m.UnSoloUso || m.Protocolo != protocoloEventos || m.WSURL != quiero {
		t.Fatalf("cuerpo: %+v", m)
	}
	if falta := time.Until(vence); falta < 25*time.Second || falta > 35*time.Second {
		t.Fatalf("vence_en fuera de los 30 s: %s", m.VenceEn)
	}
	return m
}

func exigirCierre(t *testing.T, rr *httptest.ResponseRecorder, sesionID, motivo string, duracion int) {
	t.Helper()
	if rr.Code != http.StatusOK {
		t.Fatalf("cierre: %d %s", rr.Code, rr.Body)
	}
	var m map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	if m["sesion_id"] != sesionID || m["estado"] != "cerrada" || m["motivo_cierre"] != motivo {
		t.Fatalf("cierre: %+v", m)
	}
	if _, ok := m["cotizacion_id"]; ok {
		t.Fatalf("cotizacion_id vacío: %+v", m)
	}
	if _, ok := m["derivacion"]; ok {
		t.Fatalf("no hay que derivar a WhatsApp: %+v", m)
	}
	d, ok := m["duracion_s"].(float64)
	cerrada, _ := m["cerrada_en"].(string)
	if !ok || d < 0 || (duracion >= 0 && int(d) != duracion) || !strings.HasSuffix(cerrada, "Z") {
		t.Fatalf("duración: %+v", m)
	}
}
