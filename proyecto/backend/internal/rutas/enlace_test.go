package rutas

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/internal/servidor"
)

func TestLeerEnlacePublico(t *testing.T) {
	a := memoria.Nuevo()
	claveSrv := "clave-de-prueba-de-32-bytes-minimo"
	id, err := dominio.NuevoIDClavePublica()
	if err != nil {
		t.Fatal(err)
	}
	presentada := "vc_pub_abcdsecreto"
	ahora := time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC)
	tn := dominio.Tenant{ID: debeTenant(t), Nombre: "Rober", SimultaneasTope: 5, SegundosMesTope: 30000, RetencionDias: 90, CreadoEn: ahora}
	if err := a.CrearTenant(t.Context(), tn); err != nil {
		t.Fatal(err)
	}
	as := dominio.Asesor{
		ID: debeAsesor(t), Rol: dominio.RolAdministrar, NombreVisible: "Juan P.", Email: "juan@ejemplo.local",
		WhatsApp: "+5492235550000", Oficios: []dominio.Oficio{dominio.OficioPintura}, Zonas: []dominio.Zona{dominio.ZonaMarChiquita},
		CreadoEn: ahora,
	}
	if err := a.CrearAsesor(t.Context(), tn.ID, as); err != nil {
		t.Fatal(err)
	}
	if err := a.GuardarClave(t.Context(), tn.ID, dominio.ClaveAPI{
		ID: id, Tipo: dominio.ClavePublica, Hash: claves.HMAC(claveSrv, presentada), Prefijo: "vc_pub_abcd",
		Origenes: []string{"https://cotizar.videocotizacion.local"}, CreadaEn: ahora,
	}); err != nil {
		t.Fatal(err)
	}
	pub, err := dominio.NuevoIDPublico()
	if err != nil {
		t.Fatal(err)
	}
	if err := a.GuardarEnlace(t.Context(), tn.ID, dominio.Enlace{IDPublico: pub, AsesorID: as.ID, CreadoEn: ahora}); err != nil {
		t.Fatal(err)
	}
	h := servidor.Manejador(servidor.Opciones{CuerpoMaxBytes: 1024, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}, func(mux *http.ServeMux) {
		Registrar(mux, a, secreto.Nuevo(claveSrv), slog.New(slog.NewTextHandler(io.Discard, nil)), proveedores.Conjunto{}, nil)
	})
	pedir := func(clave, origin, id string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/v1/widget/enlaces/"+id, nil)
		if clave != "" {
			r.Header.Set("X-VC-Clave-Publica", clave)
		}
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		return rr
	}
	if rr := pedir("", "", pub); rr.Code != 401 {
		t.Fatalf("sin clave: %d", rr.Code)
	}
	if rr := pedir("vc_pub_no", "https://cotizar.videocotizacion.local", pub); rr.Code != 401 {
		t.Fatalf("clave ajena: %d", rr.Code)
	}
	if rr := pedir(presentada, "https://otro.ejemplo.local", pub); rr.Code != 403 {
		t.Fatalf("origin ajeno: %d %s", rr.Code, rr.Body)
	}
	rr := pedir(presentada, "https://cotizar.videocotizacion.local", pub)
	if rr.Code != 200 {
		t.Fatalf("ok: %d %s", rr.Code, rr.Body)
	}
	var cuerpo struct {
		ID          string `json:"id_publico"`
		Profesional struct {
			Nombre string `json:"nombre_visible"`
		} `json:"profesional"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}
	if cuerpo.ID != pub || cuerpo.Profesional.Nombre != "Juan P." {
		t.Fatalf("%+v", cuerpo)
	}
	if rr := pedir(presentada, "https://cotizar.videocotizacion.local", "no-es-un-id"); rr.Code != 404 {
		t.Fatalf("id malo: %d", rr.Code)
	}
	_ = errores.NoEncontrado
}

func TestAvisoYDesafio(t *testing.T) {
	a := memoria.Nuevo()
	claveSrv := "clave-de-prueba-de-32-bytes-minimo"
	ahora := time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC)
	tn := dominio.Tenant{ID: debeTenant(t), Nombre: "Rober", SimultaneasTope: 5, SegundosMesTope: 30000, RetencionDias: 90, CreadoEn: ahora}
	if err := a.CrearTenant(t.Context(), tn); err != nil {
		t.Fatal(err)
	}
	pubID, secID := debeClave(t, true), debeClave(t, false)
	pub, sec := "vc_pub_avisosecreto", "vc_sec_avisosecreto"
	origen := "https://cotizar.videocotizacion.local"
	if err := a.GuardarClave(t.Context(), tn.ID, dominio.ClaveAPI{
		ID: pubID, Tipo: dominio.ClavePublica, Hash: claves.HMAC(claveSrv, pub), Prefijo: "vc_pub_avis",
		Origenes: []string{origen}, CreadaEn: ahora,
	}); err != nil {
		t.Fatal(err)
	}
	if err := a.GuardarClave(t.Context(), tn.ID, dominio.ClaveAPI{
		ID: secID, Tipo: dominio.ClaveSecreta, Hash: claves.HMAC(claveSrv, sec), Prefijo: "vc_sec_avis", CreadaEn: ahora,
	}); err != nil {
		t.Fatal(err)
	}
	h := servidor.Manejador(servidor.Opciones{CuerpoMaxBytes: 1024, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}, func(mux *http.ServeMux) {
		Registrar(mux, a, secreto.Nuevo(claveSrv), slog.New(slog.NewTextHandler(io.Discard, nil)), proveedores.Conjunto{}, nil)
	})
	aviso := func(clave, origin string, bearer bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/v1/widget/avisos/privacidad", nil)
		if bearer {
			r.Header.Set("Authorization", "Bearer "+clave)
		} else if clave != "" {
			r.Header.Set("X-VC-Clave-Publica", clave)
		}
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		return rr
	}
	if rr := aviso(pub, origen, false); rr.Code != 200 || !json.Valid(rr.Body.Bytes()) {
		t.Fatalf("aviso público: %d %s", rr.Code, rr.Body)
	}
	if rr := aviso(sec, "", true); rr.Code != 200 {
		t.Fatalf("aviso secreto: %d %s", rr.Code, rr.Body)
	}
	if rr := aviso(sec, origen, true); rr.Code != 403 {
		t.Fatalf("secreto con Origin: %d", rr.Code)
	}
	r := httptest.NewRequest(http.MethodPost, "/v1/widget/desafios", nil)
	r.Header.Set("X-VC-Clave-Publica", pub)
	r.Header.Set("Origin", origen)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	if rr.Code != 201 {
		t.Fatalf("desafío: %d %s", rr.Code, rr.Body)
	}
	var cuerpo struct {
		Desafio    string `json:"desafio"`
		Mecanismo  string `json:"mecanismo"`
		Provisorio bool   `json:"provisorio"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}
	if len(cuerpo.Desafio) != 47 || cuerpo.Mecanismo != "prueba_de_trabajo_sha256" || !cuerpo.Provisorio {
		t.Fatalf("%+v", cuerpo)
	}
}

func debeClave(t *testing.T, publica bool) string {
	t.Helper()
	var id string
	var err error
	if publica {
		id, err = dominio.NuevoIDClavePublica()
	} else {
		id, err = dominio.NuevoIDClaveSecreta()
	}
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func debeTenant(t *testing.T) dominio.TenantID {
	t.Helper()
	id, err := dominio.NuevoTenantID()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func debeAsesor(t *testing.T) string {
	t.Helper()
	id, err := dominio.NuevoIDAsesor()
	if err != nil {
		t.Fatal(err)
	}
	return id
}
