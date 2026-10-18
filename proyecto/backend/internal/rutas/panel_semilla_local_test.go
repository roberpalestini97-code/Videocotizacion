package rutas

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/falsos"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/internal/semillalocal"
	"videocotizacion/backend/internal/servidor"
)

func nuevaFixtureSemillaLocal(t *testing.T) *fixSesion {
	t.Helper()
	t.Cleanup(func() { dominio.PermitirOriginLoopback(false) })
	a := memoria.Nuevo()
	t.Cleanup(a.Cerrar)
	const claveSrv = "clave-de-desarrollo-de-32-bytes-minimo"
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := semillalocal.Sembrar(t.Context(), a, claveSrv, log); err != nil {
		t.Fatal(err)
	}
	cot := cotizador.AbrirDesdeRutasHabituales(log)
	f := &fixSesion{alm: a, claveSrv: claveSrv, tenant: semillalocal.IDTenant, asesor: semillalocal.IDAsesor, enlace: semillalocal.EnlacePublico}
	f.h = servidor.Manejador(servidor.Opciones{CuerpoMaxBytes: 2048, Log: log}, func(mux *http.ServeMux) {
		f.hdl = Registrar(mux, a, secreto.Nuevo(claveSrv), log, proveedoresFalsos(), cot)
	})
	return f
}

// T44: las credenciales de semillalocal permiten abrir sesión de panel y listar cotizaciones (vacío al inicio).
func TestPanelSemillaLocalLoginListaVacia(t *testing.T) {
	f := nuevaFixtureSemillaLocal(t)
	cuando := time.Date(2026, 10, 12, 18, 0, 0, 0, time.UTC)
	const ip = "127.0.0.1"
	cookie, _ := entrarPanelRecuperacion(t, f, ip, cuando)
	rr := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?limite=20", ip, cookie)
	if rr.Code != http.StatusOK {
		t.Fatalf("listado: %d %s", rr.Code, rr.Body.String())
	}
	var lista struct {
		Items []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &lista); err != nil {
		t.Fatal(err)
	}
	if len(lista.Items) != 0 {
		t.Fatalf("se esperaba listado vacío, hay %d", len(lista.Items))
	}
}

// T44: una sesión creada para el asesor de la semilla aparece en Mis cotizaciones y tiene detalle.
func TestPanelSemillaLocalListaSesionTrasCrear(t *testing.T) {
	f := nuevaFixtureSemillaLocal(t)
	cuando := time.Date(2026, 10, 12, 18, 0, 0, 0, time.UTC)
	ses, err := dominio.NuevaSesion(semillalocal.IDAsesor, dominio.ModoAvatar3D, cuando, 45)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.CrearSesion(t.Context(), semillalocal.IDTenant, ses); err != nil {
		t.Fatal(err)
	}
	const ip = "127.0.0.1"
	cookie, _ := entrarPanelRecuperacion(t, f, ip, cuando.Add(time.Minute))
	lista := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones?limite=20", ip, cookie)
	if lista.Code != http.StatusOK {
		t.Fatalf("listado: %d %s", lista.Code, lista.Body.String())
	}
	ids := idsCotizacion(t, lista)
	if len(ids) != 1 || ids[0] != ses.ID {
		t.Fatalf("ids: %v sesión %s", ids, ses.ID)
	}
	det := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones/"+ses.ID, ip, cookie)
	if det.Code != http.StatusOK || !strings.Contains(det.Body.String(), ses.ID) {
		t.Fatalf("detalle: %d %s", det.Code, det.Body.String())
	}
}

func entrarPanelRecuperacion(t *testing.T, f *fixSesion, ip string, cuando time.Time) (cookie, csrf string) {
	t.Helper()
	f.relojPanel(cuando)
	rr := f.login(ip, loginJSON(semillalocal.EmailPanelLocal, semillalocal.ContrasenaPanelLocal))
	if rr.Code != http.StatusOK {
		t.Fatalf("login: %d %s", rr.Code, rr.Body.String())
	}
	previa := valorCookiePanel(t, rr)
	var paso struct {
		CSRF string `json:"csrf_token"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &paso); err != nil {
		t.Fatal(err)
	}
	totp := f.totp(ip, previa, paso.CSRF, totpJSON("codigo_recuperacion", semillalocal.CodigoRecuperacionPanelLocal))
	if totp.Code != http.StatusOK {
		t.Fatalf("recuperación: %d %s", totp.Code, totp.Body.String())
	}
	var cuerpo struct {
		CSRF string `json:"csrf_token"`
	}
	if err := json.Unmarshal(totp.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}
	return valorCookiePanel(t, totp), cuerpo.CSRF
}

func proveedoresFalsos() proveedores.Conjunto {
	return proveedores.Conjunto{
		Transcriptor: &falsos.Transcriptor{Texto: "turno de prueba"},
		Extractor:    falsos.NuevoGuion(),
		Sintetizador: &falsos.Sintetizador{},
		Mensajeria:   &falsos.Mensajeria{},
	}
}

// Demo pública: el código de recuperación de la semilla sirve para entrar más de una vez.
func TestPanelSemillaLocalRecuperacionReutilizable(t *testing.T) {
	f := nuevaFixtureSemillaLocal(t)
	cuando := time.Date(2026, 10, 18, 10, 0, 0, 0, time.UTC)
	const ip = "127.0.0.1"
	primera, _ := entrarPanelRecuperacion(t, f, ip, cuando)
	segunda, _ := entrarPanelRecuperacion(t, f, ip, cuando.Add(time.Minute))
	if primera == "" || segunda == "" || primera == segunda {
		t.Fatalf("se esperaban dos sesiones distintas: %q %q", primera, segunda)
	}
}
