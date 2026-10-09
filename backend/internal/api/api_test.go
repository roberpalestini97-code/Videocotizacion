package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/abuso"
	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/almacen/pgprueba"
	"videocotizacion/backend/internal/almacen/postgres"
	"videocotizacion/backend/internal/api"
	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/credenciales"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/migrador"
	"videocotizacion/backend/internal/proveedores/falsos"
	"videocotizacion/backend/internal/reloj"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/internal/servidor"
	"videocotizacion/backend/internal/sesiones"
	"videocotizacion/backend/migrations"
)

var t0 = time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC)

const ipPrueba = "192.0.2.1"

func raizRepo(t testing.TB) string {
	t.Helper()
	r, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func leerArchivo(t testing.TB, partes ...string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(append([]string{raizRepo(t)}, partes...)...))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// entorno arma la API real (middleware + servicio) sobre un almacén, con
// proveedores falsos y reloj falso.
type entorno struct {
	t     *testing.T
	alm   almacen.Completo
	reloj *reloj.Falso
	firm  credenciales.Firmador
	ext   *falsos.Extractor
	men   *falsos.Mensajeria
	stt   *falsos.Transcriptor
	tts   *falsos.Sintetizador
	srv   *sesiones.Servicio
	des   *abuso.Desafios
	tasas api.Tasas
}

func nuevoEntorno(t *testing.T, alm almacen.Completo) *entorno {
	t.Helper()
	firm, err := credenciales.NuevoFirmador(secreto.Nuevo(strings.Repeat("k", 32)))
	if err != nil {
		t.Fatal(err)
	}
	// El tarifario real dice version "0.1.0" y el contrato exige AAAA.N
	// (hueco B2 de T04b1-huecos-del-contrato.md): la prueba usa "2026.1".
	crudo := bytes.Replace(leerArchivo(t, "tarifas", "tarifas-2026.json"), []byte(`"version": "0.1.0"`), []byte(`"version": "2026.1"`), 1)
	tar, err := cotizador.CargarTarifario(bytes.NewReader(crudo))
	if err != nil {
		t.Fatal(err)
	}
	cot, err := cotizador.Nuevo(tar, cotizador.Opciones{ValidezDias: 15})
	if err != nil {
		t.Fatal(err)
	}
	_, stt, ext, tts, men := falsos.Conjunto()
	ext.JSON = string(leerArchivo(t, "conductas", "ejemplos", "02-fachada-altura-emitir.json"))
	r := reloj.NuevoFalso(t0)
	srv, err := sesiones.Nuevo(sesiones.Opciones{
		Almacen: alm, Firmador: firm, Reloj: r, Mensajeria: men, Extractor: ext, Cotizador: cot,
		AvisoVersion: "2026-10-08.1", AvisoURL: "https://cotizar.videocotizacion.local/privacidad/2026-10-08.1",
	})
	if err != nil {
		t.Fatal(err)
	}
	return &entorno{
		t: t, alm: alm, reloj: r, firm: firm, ext: ext, men: men, stt: stt, tts: tts, srv: srv,
		des: abuso.NuevosDesafios(r, 8, time.Minute, credenciales.Aleatorio), tasas: api.TasasPorDefecto(r),
	}
}

func (e *entorno) manejador() http.Handler {
	o := api.Opciones{Autenticacion: e.alm, Sesiones: e.srv, Firmador: e.firm, Desafios: e.des, Reloj: e.reloj,
		Tasas: e.tasas, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	if err := api.Registrar(http.NewServeMux(), o); err != nil {
		e.t.Fatal(err)
	}
	return servidor.Manejador(servidor.Opciones{CuerpoMaxBytes: 64 << 10, Log: o.Log}, func(m *http.ServeMux) { _ = api.Registrar(m, o) })
}

func (e *entorno) llamadasAProveedores() int64 {
	return e.ext.Llamadas() + e.men.Llamadas() + e.stt.Llamadas() + e.tts.Llamadas()
}

func (e *entorno) sinError(err error, que string) {
	e.t.Helper()
	if err != nil {
		e.t.Fatalf("%s: %v", que, err)
	}
}

// tenantFx es un tenant con asesor, enlaces y claves.
type tenantFx struct {
	tn                               dominio.Tenant
	as                               dominio.Asesor
	enlace, enlaceRevocado           string
	secreta, publica                 string
	secretaRevocada, publicaRevocada string
	idPublica                        string
	origin                           string
}

func (e *entorno) clave(tn dominio.TenantID, tipo dominio.TipoClave, revocada bool, origenes ...string) (string, string) {
	e.t.Helper()
	tc := credenciales.Secreta
	if tipo == dominio.ClavePublica {
		tc = credenciales.Publica
	}
	valor, hash, prefijo, err := credenciales.Nueva(e.firm, tc)
	e.sinError(err, "credencial")
	id, err := dominio.NuevoIDClave(tipo)
	e.sinError(err, "id de clave")
	e.sinError(e.alm.CrearClaveAPI(context.Background(), tn, dominio.ClaveAPI{ID: id, Tipo: tipo, Hash: hash, Prefijo: prefijo,
		Origenes: origenes, CreadaEn: e.reloj.Ahora()}), "crear clave")
	if revocada {
		e.sinError(e.alm.RevocarClaveAPI(context.Background(), tn, id, e.reloj.Ahora()), "revocar clave")
	}
	return valor, id
}

func idPublico(t *testing.T) string {
	v, err := credenciales.Aleatorio(16)
	if err != nil {
		t.Fatal(err)
	}
	return v[:22]
}

func (e *entorno) tenant(nombre string, segundosMes, simultaneas int) tenantFx {
	e.t.Helper()
	ctx := context.Background()
	id, err := dominio.NuevoTenantID()
	e.sinError(err, "tenant id")
	tn := dominio.Tenant{ID: id, Nombre: "Tenant " + nombre, SimultaneasTope: simultaneas, SegundosMesTope: segundosMes, RetencionDias: 90, CreadoEn: e.reloj.Ahora()}
	e.sinError(e.alm.CrearTenant(ctx, tn), "crear tenant")
	asID, _ := dominio.NuevoIDAsesor()
	as := dominio.Asesor{ID: asID, Rol: dominio.RolAsesorBase, NombreVisible: "Juan P.", Email: "juan@ejemplo.com",
		WhatsApp: "+5492235550102", Oficios: []dominio.Oficio{dominio.OficioPintura}, Zonas: []dominio.Zona{dominio.ZonaCobo}, CreadoEn: e.reloj.Ahora()}
	e.sinError(e.alm.CrearAsesor(ctx, id, as), "crear asesor")
	fx := tenantFx{tn: tn, as: as, enlace: idPublico(e.t), enlaceRevocado: idPublico(e.t),
		origin: "https://cotizar.tenant-" + strings.ToLower(nombre) + ".com"}
	e.sinError(e.alm.CrearEnlace(ctx, id, dominio.Enlace{IDPublico: fx.enlace, AsesorID: as.ID, CreadoEn: e.reloj.Ahora()}), "enlace")
	rev := e.reloj.Ahora()
	e.sinError(e.alm.CrearEnlace(ctx, id, dominio.Enlace{IDPublico: fx.enlaceRevocado, AsesorID: as.ID, CreadoEn: rev, RevocadoEn: &rev}), "enlace revocado")
	fx.secreta, _ = e.clave(id, dominio.ClaveSecreta, false)
	fx.secretaRevocada, _ = e.clave(id, dominio.ClaveSecreta, true)
	fx.publica, fx.idPublica = e.clave(id, dominio.ClavePublica, false, fx.origin)
	fx.publicaRevocada, _ = e.clave(id, dominio.ClavePublica, true, fx.origin)
	return fx
}

// sesion crea una sesión en el estado pedido y devuelve su id y su token.
// "en_curso" se representa con "consentida" (en_curso lo fija
// emitirTokenMedios, que es de la parte 2): para estas rutas es lo mismo.
func (e *entorno) sesion(fx tenantFx, estado string, emitida bool) (string, string) {
	e.t.Helper()
	ctx := context.Background()
	ahora := e.reloj.Ahora()
	s, err := dominio.NuevaSesion(fx.as.ID, dominio.ModoAvatar3D, ahora, 90)
	e.sinError(err, "sesión")
	valor, hash, _, err := credenciales.Nueva(e.firm, credenciales.Sesion)
	e.sinError(err, "token")
	e.sinError(e.alm.CrearSesionConToken(ctx, fx.tn.ID, s, dominio.TokenSesion{Hash: hash, SesionID: s.ID, EmitidoEn: ahora, VenceEn: ahora.Add(time.Hour)}), "crear sesión")
	if estado == "creada" {
		return s.ID, valor
	}
	c, err := dominio.NuevoConsentimiento(s, "2026-10-08.1", ahora)
	e.sinError(err, "consentimiento")
	_, err = e.alm.RegistrarConsentimiento(ctx, fx.tn.ID, c, ahora)
	e.sinError(err, "consentir")
	if emitida {
		_, err = e.srv.Presupuestar(ctx, fx.tn.ID, s.ID, "quiero pintar la fachada")
		e.sinError(err, "presupuestar")
	}
	if estado == "cerrada" {
		_, err = e.alm.CerrarSesion(ctx, fx.tn.ID, s.ID, dominio.MotivoCompletada, ahora.Add(7*time.Minute))
		e.sinError(err, "cerrar")
	}
	return s.ID, valor
}

// ---- vectores del contrato contra el servidor real ----

type vector struct {
	ID          string `json:"id"`
	Categoria   string `json:"categoria"`
	Descripcion string `json:"descripcion"`
	Operacion   string `json:"operacion"`
	Solicitud   struct {
		Credencial *struct {
			Tipo, Tenant, Sujeto, Estado string
		} `json:"credencial"`
		Origin  string `json:"origin"`
		Desafio string `json:"desafio"`
		Tasa    string `json:"tasa"`
		Recurso *struct {
			Tenant            string `json:"tenant"`
			Existe            bool   `json:"existe"`
			Sujeto            string `json:"sujeto"`
			Estado            string `json:"estado"`
			CotizacionEmitida *bool  `json:"cotizacion_emitida"`
			Revocado          bool   `json:"revocado"`
		} `json:"recurso"`
		Cupo *struct {
			Cuota       string `json:"cuota"`
			Simultaneas string `json:"simultaneas"`
		} `json:"cupo"`
		Cuerpo json.RawMessage `json:"cuerpo"`
	} `json:"solicitud"`
	Esperado struct {
		Status        int    `json:"status"`
		Codigo        string `json:"codigo"`
		CostoCero     bool   `json:"costo_cero"`
		GrupoIdentico string `json:"grupo_identico"`
	} `json:"esperado"`
}

// Operaciones de la parte 1 (las demás se prueban en la parte 2).
var rutas = map[string]struct{ metodo, ruta string }{
	"emitirDesafio":  {"POST", "/v1/widget/desafios"},
	"crearSesion":    {"POST", "/v1/sesiones"},
	"leerSesion":     {"GET", "/v1/sesiones/%s"},
	"leerCotizacion": {"GET", "/v1/sesiones/%s/cotizacion"},
	"leerDerivacion": {"GET", "/v1/sesiones/%s/derivacion"},
}

func leerVectores(t *testing.T) []vector {
	t.Helper()
	archivos, err := filepath.Glob(filepath.Join(raizRepo(t), "contracts", "pruebas", "vectores", "*.json"))
	if err != nil || len(archivos) == 0 {
		t.Fatalf("vectores: %v %v", archivos, err)
	}
	var out []vector
	for _, a := range archivos {
		var vs []vector
		b, _ := os.ReadFile(a)
		if err := json.Unmarshal(b, &vs); err != nil {
			t.Fatalf("%s: %v", a, err)
		}
		for _, v := range vs {
			if _, ok := rutas[v.Operacion]; ok {
				out = append(out, v)
			}
		}
	}
	return out
}

type respuesta struct {
	ID        string          `json:"id"`
	Operacion string          `json:"operacion"`
	Status    int             `json:"status"`
	Cuerpo    json.RawMessage `json:"cuerpo"`
}

var reEnlace = regexp.MustCompile(`^[A-Za-z0-9_-]{22}$`)

// correrVector traduce el escenario abstracto del vector a un pedido HTTP
// real con datos creados en el almacén.
func correrVector(t *testing.T, alm almacen.Completo, v vector) (*httptest.ResponseRecorder, int64, *entorno) {
	e := nuevoEntorno(t, alm)
	s := v.Solicitud
	segundos, simultaneas := 30000, 5
	if s.Cupo != nil && s.Cupo.Cuota == "agotada" {
		segundos = 0
	}
	if s.Cupo != nil && s.Cupo.Simultaneas == "agotadas" {
		simultaneas = 1
	}
	fx := map[string]tenantFx{"A": e.tenant("A", segundos, simultaneas), "B": e.tenant("B", 30000, 5)}
	if simultaneas == 1 {
		e.sesion(fx["A"], "consentida", false) // ocupa el único lugar
	}
	if s.Tasa == "excedida" {
		agotado := abuso.NuevoLimitador(e.reloj, 1, time.Hour)
		agotado.Permitir(ipPrueba) // gasta la única ficha de esa IP
		e.tasas.PorIP = agotado
	}
	cred := s.Credencial
	if cred == nil {
		cred = &struct{ Tipo, Tenant, Sujeto, Estado string }{Tipo: "ninguna", Tenant: "A"}
	}
	if cred.Tenant == "" {
		cred.Tenant = "A"
	}
	// Recurso.
	rec := s.Recurso
	ruta := rutas[v.Operacion]
	path := ruta.ruta
	var recID, recToken string
	if strings.Contains(path, "%s") {
		if rec != nil && rec.Existe {
			estado, emitida := "cerrada", true
			if rec.Estado != "" {
				estado = rec.Estado
			}
			if rec.CotizacionEmitida != nil {
				emitida = *rec.CotizacionEmitida
			}
			recID, recToken = e.sesion(fx[rec.Tenant], estado, emitida)
		} else {
			recID, _ = dominio.NuevoIDSesion()
		}
		path = fmt.Sprintf(path, recID)
	}
	// Cuerpo (crearSesion): el enlace del vector se reemplaza por uno real.
	var cuerpo []byte
	if ruta.metodo == "POST" && v.Operacion == "crearSesion" {
		enlace := fx["A"].enlace
		if rec != nil {
			switch {
			case rec.Revocado:
				enlace = fx[rec.Tenant].enlaceRevocado
			case !rec.Existe:
				enlace = idPublico(t)
			default:
				enlace = fx[rec.Tenant].enlace
			}
		}
		cuerpo = []byte(`{"enlace":"` + enlace + `","modo_avatar":"3d"}`)
		if len(s.Cuerpo) > 0 {
			cuerpo = s.Cuerpo
			var obj map[string]any
			if json.Unmarshal(s.Cuerpo, &obj) == nil && obj != nil {
				if en, ok := obj["enlace"].(string); ok && reEnlace.MatchString(en) {
					obj["enlace"] = enlace
					cuerpo, _ = json.Marshal(obj)
				}
			}
		}
	}
	var body io.Reader
	if cuerpo != nil {
		body = bytes.NewReader(cuerpo)
	}
	req := httptest.NewRequest(ruta.metodo, path, body)
	req.RemoteAddr = ipPrueba + ":40000"
	if cuerpo != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	ct := fx[cred.Tenant]
	revocada := cred.Estado == "revocada"
	switch cred.Tipo {
	case "publica":
		valor := ct.publica
		if revocada {
			valor = ct.publicaRevocada
		}
		req.Header.Set(api.EncabezadoClavePublica, valor)
	case "secreta":
		valor := ct.secreta
		if revocada {
			valor = ct.secretaRevocada
		}
		req.Header.Set("Authorization", "Bearer "+valor)
	case "sesion":
		tok := recToken
		id := recID
		if rec == nil || !rec.Existe || rec.Tenant != cred.Tenant || rec.Sujeto != cred.Sujeto {
			id, tok = e.sesion(ct, "cerrada", true)
		}
		if revocada {
			e.sinError(e.alm.RevocarTokensDeSesion(context.Background(), ct.tn.ID, id, e.reloj.Ahora()), "revocar token")
		}
		req.Header.Set("Authorization", "Bearer "+tok)
	case "ninguna":
	default:
		t.Fatalf("%s: tipo de credencial %q no soportado por el arnés", v.ID, cred.Tipo)
	}
	origin := ""
	switch s.Origin {
	case "permitido":
		origin = ct.origin
	case "ajeno":
		origin = "https://ajeno.ejemplo.com"
	case "comodin":
		origin = "*"
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if cred.Tipo == "publica" && v.Operacion == "crearSesion" {
		emitir := func(clave, org string) string {
			d, err := e.des.Emitir(clave, org)
			e.sinError(err, "emitir desafío")
			return abuso.Resolver(d.Desafio, d.Dificultad)
		}
		switch s.Desafio {
		case "valido":
			req.Header.Set(api.EncabezadoDesafio, emitir(ct.idPublica, origin))
		case "vencido":
			h := emitir(ct.idPublica, origin)
			e.reloj.Avanzar(2 * time.Minute)
			req.Header.Set(api.EncabezadoDesafio, h)
		case "reusado":
			h := emitir(ct.idPublica, origin)
			e.sinError(e.des.Consumir(h, ct.idPublica, origin), "primer uso")
			req.Header.Set(api.EncabezadoDesafio, h)
		case "otro_origin":
			req.Header.Set(api.EncabezadoDesafio, emitir(ct.idPublica, "https://otro.ejemplo.com"))
		case "otra_clave":
			req.Header.Set(api.EncabezadoDesafio, emitir("cpw_00000000000000000000000000", origin))
		}
	}
	antes := e.llamadasAProveedores()
	rr := httptest.NewRecorder()
	e.manejador().ServeHTTP(rr, req)
	return rr, e.llamadasAProveedores() - antes, e
}

func correrVectores(t *testing.T, alm almacen.Completo) {
	vs := leerVectores(t)
	if len(vs) < 100 {
		t.Fatalf("se esperaban al menos 100 vectores de la parte 1, hay %d", len(vs))
	}
	var exitos []respuesta
	grupos := map[string][]string{}
	porOperacion := map[string]int{}
	for _, v := range vs {
		rr, costo, _ := correrVector(t, alm, v)
		porOperacion[v.Operacion]++
		var p struct {
			Codigo  string `json:"codigo"`
			IDTraza string `json:"id_traza"`
		}
		_ = json.Unmarshal(rr.Body.Bytes(), &p)
		if rr.Code != v.Esperado.Status || p.Codigo != v.Esperado.Codigo {
			t.Errorf("%s [%s] %s: obtuve %d %q, el vector espera %d %q (%s)", v.ID, v.Categoria, v.Descripcion,
				rr.Code, p.Codigo, v.Esperado.Status, v.Esperado.Codigo, strings.TrimSpace(rr.Body.String()))
			continue
		}
		if v.Esperado.CostoCero && costo != 0 {
			t.Errorf("%s: costo_cero pero hubo %d llamadas a proveedores", v.ID, costo)
		}
		if rr.Code < 300 {
			exitos = append(exitos, respuesta{ID: v.ID, Operacion: v.Operacion, Status: rr.Code, Cuerpo: rr.Body.Bytes()})
		} else {
			if ct := rr.Header().Get("Content-Type"); ct != "application/problem+json" {
				t.Errorf("%s: Content-Type %q", v.ID, ct)
			}
			if (rr.Code == 429 || rr.Code == 503) && rr.Header().Get("Retry-After") == "" {
				t.Errorf("%s: %d sin Retry-After", v.ID, rr.Code)
			}
		}
		if g := v.Esperado.GrupoIdentico; g != "" {
			grupos[g] = append(grupos[g], strings.Replace(rr.Body.String(), p.IDTraza, "tr_X", 1))
		}
	}
	for g, cuerpos := range grupos {
		for _, c := range cuerpos[1:] {
			if c != cuerpos[0] {
				t.Errorf("grupo %s: respuestas distintas (R64):\n%s\n%s", g, cuerpos[0], c)
			}
		}
	}
	t.Logf("vectores corridos contra el servidor: %d %v; éxitos a validar con el contrato: %d", len(vs), porOperacion, len(exitos))
	validarContraContrato(t, exitos)
}

// validarContraContrato valida los cuerpos reales con ajv (esquemas del
// OpenAPI) y las reglas de negocio de ejecutar.mjs. Necesita node y
// contracts/verificacion/node_modules; si faltan, se omite (declarado).
func validarContraContrato(t *testing.T, rs []respuesta) {
	t.Helper()
	contratos := filepath.Join(raizRepo(t), "contracts")
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node no está instalado: no se validan los cuerpos contra los esquemas")
	}
	if _, err := os.Stat(filepath.Join(contratos, "verificacion", "node_modules", "ajv")); err != nil {
		t.Skip("falta contracts/verificacion/node_modules: no se validan los cuerpos contra los esquemas")
	}
	entrada, _ := json.Marshal(rs)
	cmd := exec.Command(node, "testdata/validar.mjs", contratos)
	cmd.Stdin = bytes.NewReader(entrada)
	salida, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("validación contra el contrato:\n%s", salida)
	}
	t.Logf("%s", strings.TrimSpace(string(salida)))
}

func TestVectoresMemoria(t *testing.T) {
	a := memoria.Nuevo()
	defer a.Cerrar()
	correrVectores(t, a)
}

func abrirPostgres(t *testing.T) *postgres.Almacen {
	t.Helper()
	base := pgprueba.Preparar(t)
	ms, err := migrador.Leer(migrations.Archivos)
	if err != nil {
		t.Fatal(err)
	}
	a, err := postgres.Abrir(context.Background(), base.URLAPI, postgres.Opciones{ConexionesMax: 8, VersionEsquema: migrador.Ultima(ms)})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(a.Cerrar)
	return a
}

func TestVectoresPostgres(t *testing.T) {
	correrVectores(t, abrirPostgres(t))
}

// ---- pruebas puntuales ----

func pedir(t *testing.T, h http.Handler, metodo, ruta string, cuerpo string, enc map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var body io.Reader
	if cuerpo != "" {
		body = strings.NewReader(cuerpo)
	}
	req := httptest.NewRequest(metodo, ruta, body)
	req.RemoteAddr = ipPrueba + ":40000"
	if cuerpo != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range enc {
		req.Header.Set(k, v)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func codigoDe(rr *httptest.ResponseRecorder) string {
	var p struct {
		Codigo string `json:"codigo"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &p)
	return p.Codigo
}

// Flujo del widget: desafío → crearSesion con clave pública → leer sesión
// con el token; el desafío es de un solo uso y la prueba de trabajo cuenta.
func TestFlujoWidgetYDesafio(t *testing.T) {
	e := nuevoEntorno(t, memoria.Nuevo())
	a := e.tenant("A", 30000, 5)
	h := e.manejador()
	enc := map[string]string{api.EncabezadoClavePublica: a.publica, "Origin": a.origin}
	rr := pedir(t, h, "POST", "/v1/widget/desafios", "", enc)
	if rr.Code != 201 {
		t.Fatalf("emitirDesafio: %d %s", rr.Code, rr.Body)
	}
	var d struct {
		Desafio    string `json:"desafio"`
		Dificultad int    `json:"dificultad_bits"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &d)
	resuelto := abuso.Resolver(d.Desafio, d.Dificultad)
	cuerpo := `{"enlace":"` + a.enlace + `","modo_avatar":"clips","idioma":"es-AR","referencia_externa":"pedido-42"}`
	// Prueba de trabajo insuficiente: el desafío se consume igual.
	var malo string
	for n := 0; ; n++ {
		malo = fmt.Sprintf("%s.%016x", d.Desafio, n)
		if abuso.CerosIniciales(d.Desafio, malo[len(d.Desafio)+1:]) < d.Dificultad {
			break
		}
	}
	enc[api.EncabezadoDesafio] = malo
	if rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, enc); rr.Code != 403 || codigoDe(rr) != "desafio_invalido" {
		t.Fatalf("trabajo insuficiente: %d %s", rr.Code, rr.Body)
	}
	enc[api.EncabezadoDesafio] = resuelto
	if rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, enc); rr.Code != 403 || codigoDe(rr) != "desafio_invalido" {
		t.Fatalf("el desafío ya se consumió con el intento fallido: %d %s", rr.Code, rr.Body)
	}
	rr = pedir(t, h, "POST", "/v1/widget/desafios", "", map[string]string{api.EncabezadoClavePublica: a.publica, "Origin": a.origin})
	_ = json.Unmarshal(rr.Body.Bytes(), &d)
	enc[api.EncabezadoDesafio] = abuso.Resolver(d.Desafio, d.Dificultad)
	rr = pedir(t, h, "POST", "/v1/sesiones", cuerpo, enc)
	if rr.Code != 201 {
		t.Fatalf("crearSesion: %d %s", rr.Code, rr.Body)
	}
	var creada struct {
		SesionID string `json:"sesion_id"`
		Token    struct {
			Valor string `json:"valor"`
		} `json:"token_sesion"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &creada)
	if rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, enc); rr.Code != 403 || codigoDe(rr) != "desafio_invalido" {
		t.Fatalf("desafío reusado: %d %s", rr.Code, rr.Body)
	}
	// El token lee su sesión (con Origin del widget) y no otra.
	tok := map[string]string{"Authorization": "Bearer " + creada.Token.Valor, "Origin": a.origin}
	if rr := pedir(t, h, "GET", "/v1/sesiones/"+creada.SesionID, "", tok); rr.Code != 200 || !strings.Contains(rr.Body.String(), `"estado":"creada"`) {
		t.Fatalf("leer sesión con token: %d %s", rr.Code, rr.Body)
	}
	otra, _ := e.sesion(a, "cerrada", true)
	if rr := pedir(t, h, "GET", "/v1/sesiones/"+otra, "", tok); rr.Code != 404 {
		t.Fatalf("token sobre otra sesión del mismo tenant: %d", rr.Code)
	}
	if rr := pedir(t, h, "GET", "/v1/sesiones/"+creada.SesionID+"/cotizacion", "", tok); rr.Code != 409 || codigoDe(rr) != "cotizacion_no_emitida" {
		t.Fatalf("cotización antes de emitir: %d %s", rr.Code, rr.Body)
	}
	// El token vence (1 h) → credencial_invalida.
	e.reloj.Avanzar(time.Hour)
	if rr := pedir(t, h, "GET", "/v1/sesiones/"+creada.SesionID, "", tok); rr.Code != 401 || codigoDe(rr) != "credencial_invalida" {
		t.Fatalf("token vencido: %d %s", rr.Code, rr.Body)
	}
	if n := e.llamadasAProveedores(); n != 1 { // solo el Presupuestar de la sesión "otra"
		t.Fatalf("crearSesion no debe llamar a proveedores: %d llamadas", n)
	}
}

// Detalles de la autenticación y del cuerpo que los vectores no cubren.
func TestAutenticacionYCuerpo(t *testing.T) {
	e := nuevoEntorno(t, memoria.Nuevo())
	e.tasas = api.Tasas{} // acá no se prueba la tasa
	a := e.tenant("A", 30000, 5)
	h := e.manejador()
	sec := map[string]string{"Authorization": "Bearer " + a.secreta}
	valido := `{"enlace":"` + a.enlace + `","modo_avatar":"3d"}`
	casos := []struct {
		nombre, cuerpo string
		enc            map[string]string
		status         int
		codigo         string
	}{
		{"dos credenciales", valido, map[string]string{"Authorization": "Bearer " + a.secreta, api.EncabezadoClavePublica: a.publica}, 401, "credencial_invalida"},
		{"pública en Authorization", valido, map[string]string{"Authorization": "Bearer " + a.publica}, 401, "credencial_invalida"},
		{"secreta en el encabezado público", valido, map[string]string{api.EncabezadoClavePublica: a.secreta, "Origin": a.origin}, 401, "credencial_invalida"},
		{"sin Bearer", valido, map[string]string{"Authorization": a.secreta}, 401, "credencial_invalida"},
		{"formato desconocido", valido, map[string]string{"Authorization": "Bearer vc_sec_corta"}, 401, "credencial_invalida"},
		{"clave bien formada pero inexistente", valido, map[string]string{"Authorization": "Bearer vc_sec_" + strings.Repeat("A", 43)}, 401, "credencial_invalida"},
		{"tenant_id en el cuerpo", `{"enlace":"` + a.enlace + `","modo_avatar":"3d","tenant_id":"x"}`, sec, 422, "validacion_fallida"},
		{"campo con otra mayúscula", `{"Enlace":"` + a.enlace + `","modo_avatar":"3d"}`, sec, 422, "validacion_fallida"},
		{"modo inválido", `{"enlace":"` + a.enlace + `","modo_avatar":"vr"}`, sec, 422, "validacion_fallida"},
		{"enlace número", `{"enlace":5,"modo_avatar":"3d"}`, sec, 422, "validacion_fallida"},
		{"arreglo", `[]`, sec, 422, "validacion_fallida"},
		{"JSON roto", `{"enlace":`, sec, 400, "solicitud_invalida"},
		{"dos objetos", valido + valido, sec, 400, "solicitud_invalida"},
		{"secreta con Origin y cuerpo inválido: primero el Origin", `{`, map[string]string{"Authorization": "Bearer " + a.secreta, "Origin": a.origin}, 403, "clave_secreta_desde_navegador"},
	}
	for _, c := range casos {
		rr := pedir(t, h, "POST", "/v1/sesiones", c.cuerpo, c.enc)
		if rr.Code != c.status || codigoDe(rr) != c.codigo {
			t.Errorf("%s: %d %s, quería %d %s", c.nombre, rr.Code, codigoDe(rr), c.status, c.codigo)
		}
	}
	req := httptest.NewRequest("POST", "/v1/sesiones", strings.NewReader(valido))
	req.Header.Set("Authorization", "Bearer "+a.secreta)
	req.Header.Set("Content-Type", "text/plain")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 415 || codigoDe(rr) != "tipo_de_contenido_no_soportado" {
		t.Errorf("Content-Type: %d %s", rr.Code, rr.Body)
	}
	if rr := pedir(t, h, "POST", "/v1/sesiones", `{"enlace":"`+strings.Repeat("a", 70<<10)+`"}`, sec); rr.Code != 413 {
		t.Errorf("cuerpo grande: %d", rr.Code)
	}
	// Con clave secreta se crea sin desafío y la respuesta no trae token de medios.
	rr = pedir(t, h, "POST", "/v1/sesiones", valido, sec)
	if rr.Code != 201 || strings.Contains(rr.Body.String(), "medios") {
		t.Fatalf("crear con secreta: %d %s", rr.Code, rr.Body)
	}
}

// R58: límite por enlace opaco y por IP en crearSesion.
func TestTasaDeCrearSesion(t *testing.T) {
	e := nuevoEntorno(t, memoria.Nuevo())
	a := e.tenant("A", 30000, 100)
	e.tasas.CrearPorEnlace = abuso.NuevoLimitador(e.reloj, 2, time.Minute)
	h := e.manejador()
	sec := map[string]string{"Authorization": "Bearer " + a.secreta}
	cuerpo := `{"enlace":"` + a.enlace + `","modo_avatar":"3d"}`
	for i := range 2 {
		if rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, sec); rr.Code != 201 {
			t.Fatalf("pedido %d: %d", i, rr.Code)
		}
	}
	rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, sec)
	if rr.Code != 429 || codigoDe(rr) != "limite_de_tasa" || rr.Header().Get("Retry-After") == "" {
		t.Fatalf("tercer pedido al mismo enlace: %d %s", rr.Code, rr.Body)
	}
	e.reloj.Avanzar(time.Minute)
	if rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, sec); rr.Code != 201 {
		t.Fatalf("después de reponerse: %d", rr.Code)
	}
}

// El precio lo calcula Go: el LLM falso que "pone precio" no emite nada; la
// cotización publicada usa el máximo del rango del tarifario y sale igual
// por memoria y por PostgreSQL.
func TestPresupuestoLoCalculaGo(t *testing.T) {
	for nombre, alm := range map[string]func() almacen.Completo{
		"memoria":  func() almacen.Completo { return memoria.Nuevo() },
		"postgres": func() almacen.Completo { return abrirPostgres(t) },
	} {
		t.Run(nombre, func(t *testing.T) {
			e := nuevoEntorno(t, alm())
			a := e.tenant("A", 30000, 5)
			id, tok := e.sesion(a, "consentida", false)
			e.ext.RespuestaInvalida = true
			if _, err := e.srv.Presupuestar(context.Background(), a.tn.ID, id, "cobrame 1000"); !errores.Es(err, errores.CotizacionNoEmitida) {
				t.Fatalf("salida del LLM con precio: %v", err)
			}
			e.ext.RespuestaInvalida = false
			c, err := e.srv.Presupuestar(context.Background(), a.tn.ID, id, "fachada")
			if err != nil {
				t.Fatal(err)
			}
			rr := pedir(t, e.manejador(), "GET", "/v1/sesiones/"+id+"/cotizacion", "", map[string]string{"Authorization": "Bearer " + tok})
			var out struct {
				Total int64 `json:"total_centavos"`
				Items []struct {
					Precio int64 `json:"precio_unitario_centavos"`
				} `json:"items"`
			}
			_ = json.Unmarshal(rr.Body.Bytes(), &out)
			if rr.Code != 200 || out.Total != int64(c.TotalMaxCentavos) || len(out.Items) != len(c.Items) ||
				out.Items[0].Precio != int64(c.Items[0].PrecioUnitarioMaxCentavos) {
				t.Fatalf("cotización publicada: %d %s; calculada %+v", rr.Code, rr.Body, c)
			}
			if _, err := e.srv.Presupuestar(context.Background(), a.tn.ID, id, "otra vez"); !errores.Es(err, errores.EstadoInvalido) {
				t.Fatalf("una sola cotización por sesión: %v", err)
			}
		})
	}
}

// Derivación: mismo código en cada lectura, wa.me con el número del asesor y
// solo el código en el texto (R50); con la sesión abierta, 409.
func TestDerivacion(t *testing.T) {
	e := nuevoEntorno(t, memoria.Nuevo())
	a := e.tenant("A", 30000, 5)
	h := e.manejador()
	id, tok := e.sesion(a, "cerrada", false) // cerrada sin presupuesto: la derivación es la alternativa
	enc := map[string]string{"Authorization": "Bearer " + tok}
	r1 := pedir(t, h, "GET", "/v1/sesiones/"+id+"/derivacion", "", enc)
	e.reloj.Avanzar(time.Minute)
	r2 := pedir(t, h, "GET", "/v1/sesiones/"+id+"/derivacion", "", map[string]string{"Authorization": "Bearer " + a.secreta})
	if r1.Code != 200 || r1.Body.String() != r2.Body.String() {
		t.Fatalf("derivación: %d %s / %s", r1.Code, r1.Body, r2.Body)
	}
	var d struct {
		Codigo string `json:"codigo_referencia"`
		URL    string `json:"url_wa_me"`
	}
	_ = json.Unmarshal(r1.Body.Bytes(), &d)
	if !strings.HasPrefix(d.URL, "https://wa.me/5492235550102?text=") || !strings.HasSuffix(d.URL, d.Codigo) ||
		strings.Contains(d.URL, "juan") || !dominio.CodigoReferenciaValido(d.Codigo) {
		t.Fatalf("url %q código %q", d.URL, d.Codigo)
	}
	abierta, tokAbierta := e.sesion(a, "consentida", false)
	if rr := pedir(t, h, "GET", "/v1/sesiones/"+abierta+"/derivacion", "", map[string]string{"Authorization": "Bearer " + tokAbierta}); rr.Code != 409 || codigoDe(rr) != "estado_invalido" {
		t.Fatalf("derivación con la sesión abierta: %d %s", rr.Code, rr.Body)
	}
	// Códigos distintos en sesiones distintas.
	otra, _ := e.sesion(a, "cerrada", false)
	r3 := pedir(t, h, "GET", "/v1/sesiones/"+otra+"/derivacion", "", map[string]string{"Authorization": "Bearer " + a.secreta})
	var d3 struct {
		Codigo string `json:"codigo_referencia"`
	}
	_ = json.Unmarshal(r3.Body.Bytes(), &d3)
	if d3.Codigo == d.Codigo {
		t.Fatal("dos sesiones con el mismo código de referencia")
	}
}

// R1: la base guarda el HMAC, nunca la credencial en claro.
func TestCredencialesNoSeGuardanEnClaro(t *testing.T) {
	base := pgprueba.Preparar(t)
	ms, _ := migrador.Leer(migrations.Archivos)
	alm, err := postgres.Abrir(context.Background(), base.URLAPI, postgres.Opciones{VersionEsquema: migrador.Ultima(ms)})
	if err != nil {
		t.Fatal(err)
	}
	defer alm.Cerrar()
	e := nuevoEntorno(t, alm)
	a := e.tenant("A", 30000, 5)
	_, tok := e.sesion(a, "creada", false)
	pg, err := pgx.Connect(context.Background(), base.URLDueno.Revelar())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = pg.Close(context.Background()) }()
	var volcado string
	// El dueño puede leer estas dos tablas (política de solo lectura de las
	// funciones de autenticación).
	if err := pg.QueryRow(context.Background(), `SELECT
		(SELECT string_agg(row_to_json(c)::text || encode(c.hash, 'escape'), '') FROM vc.claves_api c) ||
		(SELECT string_agg(row_to_json(t)::text || encode(t.hash, 'escape'), '') FROM vc.tokens_sesion t)`).Scan(&volcado); err != nil {
		t.Fatal(err)
	}
	for _, v := range []string{a.secreta, a.publica, tok} {
		if strings.Contains(volcado, v) || strings.Contains(volcado, v[7:]) {
			t.Fatalf("la credencial %s… aparece en la base", v[:11])
		}
	}
	if !strings.Contains(volcado, a.secreta[:11]) {
		t.Fatalf("se esperaba el prefijo visible de la clave")
	}
}

func TestRegistrarExigeOpciones(t *testing.T) {
	if err := api.Registrar(http.NewServeMux(), api.Opciones{}); err == nil {
		t.Fatal("opciones vacías debían fallar")
	}
	keys := make([]string, 0, len(rutas))
	for k := range rutas {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) != 5 {
		t.Fatal(keys)
	}
}

// R56: tope duro mensual en segundos. Con el consumo EN el tope ya no se crea
// (>=), un segundo antes sí, y al cambiar el mes (hora de Argentina) se repone.
func TestCuotaMensualConTopeDuro(t *testing.T) {
	for nombre, alm := range map[string]func() almacen.Completo{
		"memoria":  func() almacen.Completo { return memoria.Nuevo() },
		"postgres": func() almacen.Completo { return abrirPostgres(t) },
	} {
		t.Run(nombre, func(t *testing.T) {
			e := nuevoEntorno(t, alm())
			e.tasas = api.Tasas{}
			a := e.tenant("A", 600, 100)
			h := e.manejador()
			sec := map[string]string{"Authorization": "Bearer " + a.secreta}
			cuerpo := `{"enlace":"` + a.enlace + `","modo_avatar":"3d"}`
			id, _ := e.sesion(a, "consentida", false)
			cerrar := func(seg int) {
				ses, err := e.alm.LeerSesion(context.Background(), a.tn.ID, id)
				e.sinError(err, "leer")
				_, err = e.alm.CerrarSesion(context.Background(), a.tn.ID, id, dominio.MotivoCompletada, ses.ConsentidaEn.Add(time.Duration(seg)*time.Second))
				e.sinError(err, "cerrar")
			}
			cerrar(599)
			if rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, sec); rr.Code != 201 {
				t.Fatalf("599 s de 600: %d %s", rr.Code, rr.Body)
			}
			id2, _ := e.sesion(a, "consentida", false)
			ses2, _ := e.alm.LeerSesion(context.Background(), a.tn.ID, id2)
			_, err := e.alm.CerrarSesion(context.Background(), a.tn.ID, id2, dominio.MotivoCompletada, ses2.ConsentidaEn.Add(time.Second))
			e.sinError(err, "cerrar 2")
			rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, sec)
			if rr.Code != 429 || codigoDe(rr) != "cuota_agotada" || rr.Header().Get("Retry-After") == "" {
				t.Fatalf("600 s de 600: %d %s", rr.Code, rr.Body)
			}
			// 1.º de noviembre 00:00 en Argentina (UTC−3) = 03:00 UTC.
			e.reloj.Fijar(time.Date(2026, 11, 1, 2, 59, 0, 0, time.UTC))
			if rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, sec); rr.Code != 429 {
				t.Fatalf("31 de octubre 23:59 ART sigue en octubre: %d", rr.Code)
			}
			e.reloj.Fijar(time.Date(2026, 11, 1, 3, 0, 0, 0, time.UTC))
			if rr := pedir(t, h, "POST", "/v1/sesiones", cuerpo, sec); rr.Code != 201 {
				t.Fatalf("1.º de noviembre ART: %d %s", rr.Code, rr.Body)
			}
		})
	}
}
