package rutas

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/desafio"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/internal/servidor"
)

// Estas pruebas usan el almacén de memoria y httptest. No llaman proveedores.
func TestCrearSesion(t *testing.T) {
	if desafio.DificultadBits != 16 {
		t.Fatal("la dificultad de emisión tiene que seguir en 16")
	}
	f := nuevaFixtureSesion(t)
	body := f.cuerpo("3d")

	t.Run("sin credencial", func(t *testing.T) {
		rr := f.pedir("", "", "", "", body, false)
		if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_ausente" {
			t.Fatalf("sin credencial: %d %s", rr.Code, rr.Body)
		}
	})

	t.Run("publica sin desafio", func(t *testing.T) {
		g := nuevaFixtureSesion(t)
		rr := g.pedir(g.pub, g.origen, "", "", g.cuerpo("3d"), false)
		if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "desafio_invalido" {
			t.Fatalf("sin desafío: %d %s", rr.Code, rr.Body)
		}
		if n := g.cantidad(t); n != 0 {
			t.Fatalf("se crearon %d sesiones", n)
		}
	})

	t.Run("publica con desafio", func(t *testing.T) {
		g := nuevaFixtureSesion(t)
		enc := g.desafioResuelto(t)
		rr := g.pedir(g.pub, g.origen, enc, "", g.cuerpo("3d"), false)
		c := exigirCreada(t, g, rr)
		if n := g.cantidad(t); n != 1 {
			t.Fatalf("sesiones: %d", n)
		}
		otra := g.pedir(g.pub, g.origen, enc, "", g.cuerpo("3d"), false)
		if otra.Code != http.StatusForbidden || codigoDe(t, otra) != "desafio_invalido" {
			t.Fatalf("reuso: %d %s", otra.Code, otra.Body)
		}
		if n := g.cantidad(t); n != 1 {
			t.Fatalf("el reuso creó otra sesión: %d (la primera fue %s)", n, c.SesionID)
		}
	})

	t.Run("secreta sin origin", func(t *testing.T) {
		g := nuevaFixtureSesion(t)
		rr := g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true)
		exigirCreada(t, g, rr)
	})

	t.Run("secreta con origin", func(t *testing.T) {
		g := nuevaFixtureSesion(t)
		rr := g.pedir(g.sec, g.origen, "", "", g.cuerpo("3d"), true)
		if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "clave_secreta_desde_navegador" {
			t.Fatalf("secreta con Origin: %d %s", rr.Code, rr.Body)
		}
		if n := g.cantidad(t); n != 0 {
			t.Fatalf("se crearon %d sesiones", n)
		}
	})

	t.Run("enlace inexistente", func(t *testing.T) {
		g := nuevaFixtureSesion(t)
		rr := g.pedir(g.sec, "", "", "", `{"enlace":"AAAAAAAAAAAAAAAAAAAAAA","modo_avatar":"3d"}`, true)
		if rr.Code != http.StatusNotFound || codigoDe(t, rr) != "no_encontrado" {
			t.Fatalf("enlace: %d %s", rr.Code, rr.Body)
		}
		if n := g.cantidad(t); n != 0 {
			t.Fatalf("se crearon %d sesiones", n)
		}
	})

	t.Run("idempotencia", func(t *testing.T) {
		g := nuevaFixtureSesion(t)
		pedido := g.cuerpo("3d")
		const idem = "b1946ac92492d2347c62"
		rr := g.pedir(g.sec, "", "", idem, pedido, true)
		primera := exigirCreada(t, g, rr)
		rr = g.pedir(g.sec, "", "", idem, pedido, true)
		segunda := exigirCreada(t, g, rr)
		if primera.SesionID != segunda.SesionID || primera.Token.Valor != segunda.Token.Valor {
			t.Fatalf("el reintento no devolvió la misma sesión: %s vs %s", primera.SesionID, segunda.SesionID)
		}
		if n := g.cantidad(t); n != 1 {
			t.Fatalf("la idempotencia creó %d sesiones", n)
		}
		otro := g.pedir(g.sec, "", "", idem, g.cuerpoConIdioma(), true)
		if otro.Code != http.StatusUnprocessableEntity || codigoDe(t, otro) != "validacion_fallida" {
			t.Fatalf("misma clave y otro pedido: %d %s", otro.Code, otro.Body)
		}
		if n := g.cantidad(t); n != 1 {
			t.Fatalf("el conflicto creó %d sesiones", n)
		}
	})
}

type fixSesion struct {
	a                                          *memoria.Almacen
	h                                          http.Handler
	hdl                                        *enlace
	claveSrv, pub, sec, origen, enlace, asesor string
	tenant                                     dominio.TenantID
}

func nuevaFixtureSesion(t *testing.T) *fixSesion {
	t.Helper()
	return nuevaFixtureSesionTope(t, 5)
}

func nuevaFixtureSesionTope(t *testing.T, tope int) *fixSesion {
	t.Helper()
	return nuevaFixtureSesionTopeProv(t, tope, proveedores.Conjunto{}, nil)
}

func cotizadorDePrueba(t *testing.T) *cotizador.Cotizador {
	t.Helper()
	c := cotizador.AbrirDesdeRutasHabituales(nil)
	if c == nil {
		t.Fatal("no se pudo abrir tarifas-2026.json (mismas rutas que arranque/Docker)")
	}
	return c
}

func nuevaFixtureSesionTopeProv(t *testing.T, tope int, prov proveedores.Conjunto, cot *cotizador.Cotizador) *fixSesion {
	t.Helper()
	a := memoria.Nuevo()
	t.Cleanup(a.Cerrar)
	claveSrv := "clave-de-prueba-de-32-bytes-minimo"
	ahora := time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC)
	tn := dominio.Tenant{
		ID: debeTenant(t), Nombre: "Rober", SimultaneasTope: tope, SegundosMesTope: 30000,
		RetencionDias: 45, CreadoEn: ahora,
	}
	if err := a.CrearTenant(t.Context(), tn); err != nil {
		t.Fatal(err)
	}
	asID := debeAsesor(t)
	as := dominio.Asesor{
		ID: asID, Rol: dominio.RolAdministrar, NombreVisible: "Juan P.", Email: "juan@ejemplo.local",
		WhatsApp: "+5492235550000", Oficios: []dominio.Oficio{dominio.OficioPintura},
		Zonas: []dominio.Zona{dominio.ZonaMarChiquita}, CreadoEn: ahora,
	}
	if err := a.CrearAsesor(t.Context(), tn.ID, as); err != nil {
		t.Fatal(err)
	}
	pubID, secID := debeClave(t, true), debeClave(t, false)
	pub, sec := "vc_pub_sesionsecreto", "vc_sec_sesionsecreto"
	origen := "https://cotizar.videocotizacion.local"
	if err := a.GuardarClave(t.Context(), tn.ID, dominio.ClaveAPI{
		ID: pubID, Tipo: dominio.ClavePublica, Hash: claves.HMAC(claveSrv, pub), Prefijo: "vc_pub_sesi",
		Origenes: []string{origen}, CreadaEn: ahora,
	}); err != nil {
		t.Fatal(err)
	}
	if err := a.GuardarClave(t.Context(), tn.ID, dominio.ClaveAPI{
		ID: secID, Tipo: dominio.ClaveSecreta, Hash: claves.HMAC(claveSrv, sec), Prefijo: "vc_sec_sesi",
		CreadaEn: ahora,
	}); err != nil {
		t.Fatal(err)
	}
	enlaceID, err := dominio.NuevoIDPublico()
	if err != nil {
		t.Fatal(err)
	}
	if err := a.GuardarEnlace(t.Context(), tn.ID, dominio.Enlace{IDPublico: enlaceID, AsesorID: asID, CreadoEn: ahora}); err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	f := &fixSesion{a: a, claveSrv: claveSrv, pub: pub, sec: sec, origen: origen, enlace: enlaceID, asesor: asID, tenant: tn.ID}
	f.h = servidor.Manejador(servidor.Opciones{CuerpoMaxBytes: 2048, Log: log}, func(mux *http.ServeMux) {
		f.hdl = Registrar(mux, a, secreto.Nuevo(claveSrv), log, prov, cot)
	})
	return f
}

func (f *fixSesion) cuerpo(modo string) string {
	return `{"enlace":"` + f.enlace + `","modo_avatar":"` + modo + `"}`
}

func (f *fixSesion) cuerpoConIdioma() string {
	return `{"enlace":"` + f.enlace + `","modo_avatar":"3d","idioma":"es-AR"}`
}

func (f *fixSesion) pedir(clave, origin, desafioHdr, idem, body string, secreta bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/sesiones", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if secreta {
		if clave != "" {
			r.Header.Set("Authorization", "Bearer "+clave)
		}
	} else if clave != "" {
		r.Header.Set("X-VC-Clave-Publica", clave)
	}
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if desafioHdr != "" {
		r.Header.Set("X-Desafio", desafioHdr)
	}
	if idem != "" {
		r.Header.Set("Idempotency-Key", idem)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func (f *fixSesion) cantidad(t *testing.T) int {
	t.Helper()
	lista, _, err := f.a.ListarSesionesDeAsesor(t.Context(), f.tenant, f.asesor, almacen.Pagina{Limite: 100})
	if err != nil {
		t.Fatal(err)
	}
	return len(lista)
}

// desafioResuelto emite un desafío y baja SOLO ese registro a 8 bits, bajo el
// candado del libro. DificultadBits de emisión sigue en 16.
func (f *fixSesion) desafioResuelto(t *testing.T) string {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/v1/widget/desafios", nil)
	r.Header.Set("X-VC-Clave-Publica", f.pub)
	r.Header.Set("Origin", f.origen)
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	if rr.Code != http.StatusCreated {
		t.Fatalf("emitir desafío: %d %s", rr.Code, rr.Body)
	}
	var c struct {
		Desafio string `json:"desafio"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &c); err != nil {
		t.Fatal(err)
	}
	if !f.hdl.libro.FijarDificultad(c.Desafio, 8) {
		t.Fatal("no está el desafío para bajar la dificultad")
	}
	return resolverNonce(t, c.Desafio, 8)
}

func codigoDe(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()
	var p struct {
		Codigo string `json:"codigo"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &p); err != nil {
		t.Fatalf("cuerpo %s: %v", rr.Body, err)
	}
	return p.Codigo
}

type respuestaCreada struct {
	SesionID string `json:"sesion_id"`
	Estado   string `json:"estado"`
	Token    struct {
		Valor   string `json:"valor"`
		VenceEn string `json:"vence_en"`
	} `json:"token_sesion"`
	Consentimiento struct {
		Requerido bool   `json:"requerido"`
		Version   string `json:"aviso_version"`
		URL       string `json:"aviso_url"`
	} `json:"consentimiento"`
	Limites struct {
		SinVoz     int `json:"sin_voz_s"`
		Duracion   int `json:"duracion_maxima_s"`
		Caracteres int `json:"caracteres_max_por_turno"`
		Turnos     int `json:"turnos_llm_max"`
		Fotograma  struct {
			Formato   string `json:"formato"`
			Lado      int    `json:"lado_max_px"`
			Bytes     int    `json:"bytes_max"`
			Intervalo int    `json:"intervalo_min_ms"`
			Max       int    `json:"max_por_sesion"`
		} `json:"fotograma"`
	} `json:"limites"`
	CreadaEn string `json:"creada_en"`
}

func exigirCreada(t *testing.T, f *fixSesion, rr *httptest.ResponseRecorder) respuestaCreada {
	t.Helper()
	if rr.Code != http.StatusCreated {
		t.Fatalf("crear: %d %s", rr.Code, rr.Body)
	}
	var c respuestaCreada
	if err := json.Unmarshal(rr.Body.Bytes(), &c); err != nil {
		t.Fatal(err)
	}
	if c.Estado != "creada" || !strings.HasPrefix(c.SesionID, "ses_") {
		t.Fatalf("sesión: %+v", c)
	}
	if !regexp.MustCompile(`^vc_ses_[A-Za-z0-9_-]{43}$`).MatchString(c.Token.Valor) {
		t.Fatalf("token: %s", c.Token.Valor)
	}
	creada, err1 := time.Parse(time.RFC3339, c.CreadaEn)
	vence, err2 := time.Parse(time.RFC3339, c.Token.VenceEn)
	if err1 != nil || err2 != nil || vence.Sub(creada) != 3600*time.Second || !strings.HasSuffix(c.CreadaEn, "Z") {
		t.Fatalf("fechas: %s %s", c.CreadaEn, c.Token.VenceEn)
	}
	if !c.Consentimiento.Requerido || c.Consentimiento.Version != versionAviso || c.Consentimiento.URL != urlAviso {
		t.Fatalf("consentimiento: %+v", c.Consentimiento)
	}
	if c.Limites.SinVoz != 20 || c.Limites.Duracion != 900 || c.Limites.Caracteres != 500 || c.Limites.Turnos != 60 ||
		c.Limites.Fotograma.Formato != "image/jpeg" || c.Limites.Fotograma.Lado != 1024 ||
		c.Limites.Fotograma.Bytes != 131072 || c.Limites.Fotograma.Intervalo != 3000 || c.Limites.Fotograma.Max != 400 {
		t.Fatalf("límites: %+v", c.Limites)
	}
	hall, err := f.a.BuscarTokenPorHash(t.Context(), claves.HMAC(f.claveSrv, c.Token.Valor))
	if err != nil || hall.SesionID != c.SesionID || hall.Revocado {
		t.Fatalf("hmac guardado: %v %+v", err, hall)
	}
	sum := sha256.Sum256([]byte(c.Token.Valor))
	if _, err := f.a.BuscarTokenPorHash(t.Context(), sum[:]); !errores.Es(err, errores.NoEncontrado) {
		t.Fatalf("el valor del token no tiene que persistirse: %v", err)
	}
	leida, err := f.a.LeerSesion(t.Context(), f.tenant, c.SesionID)
	if err != nil {
		t.Fatal(err)
	}
	if leida.Estado != dominio.EstadoCreada || leida.ModoAvatar != dominio.ModoAvatar3D {
		t.Fatalf("sesión guardada: %+v", leida)
	}
	if !leida.BorrarDespuesDe.Equal(leida.CreadaEn.AddDate(0, 0, 45)) {
		t.Fatalf("retención: %v desde %v", leida.BorrarDespuesDe, leida.CreadaEn)
	}
	return c
}

func TestLeerSesionYConsentimiento(t *testing.T) {
	g := nuevaFixtureSesion(t)
	a := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))
	b := exigirCreada(t, g, g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true))

	rr := g.leer(g.sec, a.SesionID)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET secreta: %d %s", rr.Code, rr.Body)
	}
	exigirLectura(t, rr.Body.Bytes(), a.SesionID, "creada", false)

	rr = g.leer(a.Token.Valor, a.SesionID)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET token: %d %s", rr.Code, rr.Body)
	}
	exigirLectura(t, rr.Body.Bytes(), a.SesionID, "creada", false)

	rr = g.leer(a.Token.Valor, b.SesionID)
	if rr.Code != http.StatusNotFound || codigoDe(t, rr) != "no_encontrado" {
		t.Fatalf("token de otra sesión: %d %s", rr.Code, rr.Body)
	}

	rr = g.leer("", a.SesionID)
	if rr.Code != http.StatusUnauthorized || codigoDe(t, rr) != "credencial_ausente" {
		t.Fatalf("sin credencial: %d %s", rr.Code, rr.Body)
	}

	okBody := consentimientoValido()
	rr = g.consentir(a.Token.Valor, a.SesionID, okBody)
	if rr.Code != http.StatusCreated {
		t.Fatalf("consentimiento: %d %s", rr.Code, rr.Body)
	}
	var reg struct {
		ID       string `json:"consentimiento_id"`
		SesionID string `json:"sesion_id"`
		Aviso    string `json:"aviso_version"`
		Cuando   string `json:"registrado_en"`
		Estado   string `json:"estado_sesion"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &reg); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(reg.ID, "cns_") || reg.SesionID != a.SesionID || reg.Aviso != versionAviso ||
		reg.Estado != "consentida" || !strings.HasSuffix(reg.Cuando, "Z") {
		t.Fatalf("registrado: %+v", reg)
	}
	rr = g.leer(g.sec, a.SesionID)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET tras consentir: %d %s", rr.Code, rr.Body)
	}
	exigirLectura(t, rr.Body.Bytes(), a.SesionID, "consentida", true)
	guardado, err := g.a.LeerConsentimiento(t.Context(), g.tenant, a.SesionID)
	if err != nil || guardado.ID != reg.ID {
		t.Fatalf("consentimiento guardado: %v %+v", err, guardado)
	}

	rr = g.consentir(a.Token.Valor, a.SesionID, okBody)
	if rr.Code != http.StatusConflict || codigoDe(t, rr) != "estado_invalido" {
		t.Fatalf("repetir consentimiento: %d %s", rr.Code, rr.Body)
	}
	otraVez, err := g.a.LeerConsentimiento(t.Context(), g.tenant, a.SesionID)
	if err != nil || otraVez.ID != guardado.ID || !otraVez.RegistradoEn.Equal(guardado.RegistradoEn) {
		t.Fatalf("el segundo consentimiento pisó el primero: %+v", otraVez)
	}

	rr = g.consentir(g.sec, b.SesionID, okBody)
	if rr.Code != http.StatusForbidden || codigoDe(t, rr) != "alcance_insuficiente" {
		t.Fatalf("consentimiento con secreta: %d %s", rr.Code, rr.Body)
	}
	rr = g.leer(g.sec, b.SesionID)
	exigirLectura(t, rr.Body.Bytes(), b.SesionID, "creada", false)

	rr = g.consentir(b.Token.Valor, b.SesionID, consentimientoFlagFalso())
	if rr.Code != http.StatusUnprocessableEntity || codigoDe(t, rr) != "validacion_fallida" {
		t.Fatalf("flag en false: %d %s", rr.Code, rr.Body)
	}
	rr = g.consentir(b.Token.Valor, b.SesionID, consentimientoAvisoViejo())
	if rr.Code != http.StatusUnprocessableEntity || codigoDe(t, rr) != "validacion_fallida" {
		t.Fatalf("aviso viejo: %d %s", rr.Code, rr.Body)
	}
	rr = g.leer(g.sec, b.SesionID)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET final: %d %s", rr.Code, rr.Body)
	}
	exigirLectura(t, rr.Body.Bytes(), b.SesionID, "creada", false)
}

func (f *fixSesion) leer(auth, sesionID string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/v1/sesiones/"+sesionID, nil)
	if auth != "" {
		r.Header.Set("Authorization", "Bearer "+auth)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func (f *fixSesion) consentir(auth, sesionID, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/v1/sesiones/"+sesionID+"/consentimiento", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if auth != "" {
		r.Header.Set("Authorization", "Bearer "+auth)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, r)
	return rr
}

func consentimientoValido() string {
	return `{"aviso_version":"` + versionAviso + `","acepta_camara_y_microfono":true,"acepta_tratamiento":true,"declara_mayor_de_18":true,"informado_asistente_automatico":true}`
}

func consentimientoFlagFalso() string {
	return `{"aviso_version":"` + versionAviso + `","acepta_camara_y_microfono":false,"acepta_tratamiento":true,"declara_mayor_de_18":true,"informado_asistente_automatico":true}`
}

func consentimientoAvisoViejo() string {
	return `{"aviso_version":"2026-10-01.2","acepta_camara_y_microfono":true,"acepta_tratamiento":true,"declara_mayor_de_18":true,"informado_asistente_automatico":true}`
}

func exigirLectura(t *testing.T, raw []byte, sesionID, estado string, consentida bool) {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if m["sesion_id"] != sesionID || m["estado"] != estado || m["modo_avatar"] != "3d" || m["duracion_s"] != float64(0) {
		t.Fatalf("lectura: %s", raw)
	}
	if _, ok := m["creada_en"].(string); !ok || !strings.HasSuffix(m["creada_en"].(string), "Z") {
		t.Fatalf("creada_en: %v", m["creada_en"])
	}
	_, tieneConsentida := m["consentida_en"]
	if tieneConsentida != consentida {
		t.Fatalf("consentida_en presente=%v, quería %v (%s)", tieneConsentida, consentida, raw)
	}
	if _, ok := m["cerrada_en"]; ok {
		t.Fatalf("cerrada_en no corresponde: %s", raw)
	}
	if _, ok := m["motivo_cierre"]; ok {
		t.Fatalf("motivo_cierre no corresponde: %s", raw)
	}
	if _, ok := m["cotizacion_id"]; ok {
		t.Fatalf("cotizacion_id no corresponde: %s", raw)
	}
	for _, v := range m {
		if v == nil {
			t.Fatalf("null en la lectura: %s", raw)
		}
	}
}

func resolverNonce(t *testing.T, desafioID string, bits int) string {
	t.Helper()
	for i := uint64(0); i < 1<<20; i++ {
		nonce := fmt.Sprintf("%016x", i)
		enc := desafioID + "." + nonce
		if cerosSHA256(enc) >= bits {
			return enc
		}
	}
	t.Fatal("no encontré nonce")
	return ""
}

func cerosSHA256(s string) int {
	sum := sha256.Sum256([]byte(s))
	n := 0
	for _, b := range sum {
		if b == 0 {
			n += 8
			continue
		}
		for m := byte(0x80); m > 0; m >>= 1 {
			if b&m != 0 {
				return n
			}
			n++
		}
	}
	return n
}
