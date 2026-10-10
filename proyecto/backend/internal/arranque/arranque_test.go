package arranque

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/almacen/pgprueba"
	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/config"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/falsos"
	"videocotizacion/backend/internal/secreto"
)

func cfgDesarrollo() config.Config {
	return config.Config{
		Entorno: config.Desarrollo, Direccion: "127.0.0.1:0", Almacen: config.AlmacenMemoria,
		Proveedores:        config.Proveedores{STT: "falso", LLM: "falso", TTS: "falso", WhatsApp: "falso"},
		LecturaEncabezados: time.Second, Lectura: time.Second, Escritura: time.Second, Inactividad: time.Second,
		Apagado: 2 * time.Second, CuerpoMaxBytes: 1024, EncabezadosMax: 8 << 10, DBTimeout: 5 * time.Second,
		RetencionIntervalo: 10 * time.Millisecond,
	}
}

func silencioso() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// H4: aunque alguien arme la Config a mano (salteando config.Cargar),
// producción no se cablea con memoria ni con falsos.
func TestProduccionNoSeCableaConMemoriaNiFalsos(t *testing.T) {
	c := cfgDesarrollo()
	c.Entorno = config.Produccion
	if _, err := Construir(context.Background(), c, silencioso()); !errors.Is(err, ErrProduccionInsegura) {
		t.Fatalf("producción con falsos: %v", err)
	}
	c.Proveedores = config.Proveedores{STT: "real-x", LLM: "real-x", TTS: "real-x", WhatsApp: "real-x"}
	if _, err := Construir(context.Background(), c, silencioso()); err == nil || !strings.Contains(err.Error(), "no implementado") {
		t.Fatalf("proveedor real inexistente: %v", err)
	}
	if _, err := AbrirAlmacen(context.Background(), c); !errors.Is(err, ErrProduccionInsegura) {
		t.Fatalf("producción con memoria: %v", err)
	}
}

func TestServirSaludListoYApagado(t *testing.T) {
	var log bytes.Buffer
	app, err := Construir(context.Background(), cfgDesarrollo(), slog.New(slog.NewJSONHandler(&log, nil)))
	if err != nil {
		t.Fatal(err)
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancelar := context.WithCancel(context.Background())
	fin := make(chan error, 1)
	go func() { fin <- app.Servir(ctx, ln) }()
	base := "http://" + ln.Addr().String()
	for _, ruta := range []string{"/salud", "/listo"} {
		r, err := http.Get(base + ruta)
		if err != nil {
			t.Fatal(err)
		}
		_ = r.Body.Close()
		if r.StatusCode != 200 {
			t.Fatalf("%s = %d", ruta, r.StatusCode)
		}
	}
	time.Sleep(30 * time.Millisecond) // deja correr la retención programada
	cancelar()
	select {
	case err := <-fin:
		if err != nil {
			t.Fatalf("apagado: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("el servidor no se apagó")
	}
	if !strings.Contains(log.String(), "retención ejecutada") {
		t.Fatal("la retención programada no corrió")
	}
	if err := app.Almacen.Ping(context.Background()); err == nil {
		t.Fatal("al apagar se debe cerrar el almacén")
	}
}

// H3: con PostgreSQL real, la API arranca con vc_api y NO con el dueño.
func TestArranqueConPostgres(t *testing.T) {
	base := pgprueba.Preparar(t)
	c := cfgDesarrollo()
	c.Almacen, c.DBURL, c.DBConexMax = config.AlmacenPostgres, base.URLAPI, 4
	app, err := Construir(context.Background(), c, silencioso())
	if err != nil {
		t.Fatal(err)
	}
	if err := app.Almacen.Ping(context.Background()); err != nil {
		t.Fatal(err)
	}
	app.Almacen.Cerrar()
	c.DBURL = base.URLDueno
	if _, err := Construir(context.Background(), c, silencioso()); err == nil || !strings.Contains(err.Error(), "arranque inseguro") {
		t.Fatalf("la API con el rol dueño debía negarse a arrancar: %v", err)
	}
	c.DBURLDueno = base.URLDueno
	if err := Migrar(context.Background(), c, silencioso()); err != nil {
		t.Fatalf("migrar (idempotente): %v", err)
	}
	c.DBURL = base.URLAPI
	if err := RetencionUnaVez(context.Background(), c, silencioso()); err != nil {
		t.Fatalf("retención: %v", err)
	}
	c.DBURLDueno = secreto.Nuevo("postgres://vc_dueno:clave-que-no-debe-verse@127.0.0.1:1/x")
	if err := Migrar(context.Background(), c, silencioso()); err == nil || strings.Contains(err.Error(), "clave-que-no-debe-verse") {
		t.Fatalf("migrar sin base no debe filtrar la clave: %v", err)
	}
}

// TestCostoCeroSinDesafio es el tramo de R67 que corre con los falsos
// cableados: un POST sin desafío no incrementa STT, LLM, TTS ni mensajería.
func TestCostoCeroSinDesafio(t *testing.T) {
	const (
		claveSrv = "clave-de-prueba-de-32-bytes-minimo"
		pub      = "vc_pub_abusocero"
		origen   = "https://cotizar.videocotizacion.local"
	)
	c := cfgDesarrollo()
	c.RetencionIntervalo = 0
	c.ClaveHMAC = secreto.Nuevo(claveSrv)
	app, err := Construir(context.Background(), c, silencioso())
	if err != nil {
		t.Fatal(err)
	}
	mem, ok := app.Almacen.(*memoria.Almacen)
	if !ok {
		t.Fatal("el desarrollo no usó el almacén de memoria")
	}
	sembrarClavePublica(t, mem, claveSrv, pub, origen)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancelar := context.WithCancel(context.Background())
	fin := make(chan error, 1)
	go func() { fin <- app.Servir(ctx, ln) }()

	req, err := http.NewRequest(http.MethodPost, "http://"+ln.Addr().String()+"/v1/sesiones", strings.NewReader(`{"enlace":"aaaaaaaaaaaaaaaaaaaaaa","modo_avatar":"3d"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-VC-Clave-Publica", pub)
	req.Header.Set("Origin", origen)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var problema struct {
		Codigo string `json:"codigo"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&problema); err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusForbidden || problema.Codigo != "desafio_invalido" {
		t.Fatalf("sin desafío: %d %s", resp.StatusCode, problema.Codigo)
	}
	stt, llm, tts, wa := llamadasDe(t, app.Proveedores)
	if stt != 0 || llm != 0 || tts != 0 || wa != 0 {
		t.Fatalf("costo: stt %d llm %d tts %d whatsapp %d", stt, llm, tts, wa)
	}

	cancelar()
	select {
	case err := <-fin:
		if err != nil {
			t.Fatalf("apagado: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("el servidor no se apagó")
	}
}

func sembrarClavePublica(t *testing.T, a *memoria.Almacen, claveSrv, pub, origen string) {
	t.Helper()
	ahora := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	idTenant, err := dominio.NuevoTenantID()
	if err != nil {
		t.Fatal(err)
	}
	tn := dominio.Tenant{
		ID: idTenant, Nombre: "Abuso", SimultaneasTope: 5, SegundosMesTope: 30000,
		RetencionDias: 45, CreadoEn: ahora,
	}
	if err := a.CrearTenant(t.Context(), tn); err != nil {
		t.Fatal(err)
	}
	idClave, err := dominio.NuevoIDClavePublica()
	if err != nil {
		t.Fatal(err)
	}
	if err := a.GuardarClave(t.Context(), tn.ID, dominio.ClaveAPI{
		ID: idClave, Tipo: dominio.ClavePublica, Hash: claves.HMAC(claveSrv, pub),
		Prefijo: "vc_pub_abus", Origenes: []string{origen}, CreadaEn: ahora,
	}); err != nil {
		t.Fatal(err)
	}
}

func llamadasDe(t *testing.T, c proveedores.Conjunto) (stt, llm, tts, wa int64) {
	t.Helper()
	tr, ok1 := c.Transcriptor.(*falsos.Transcriptor)
	ex, ok2 := c.Extractor.(*falsos.Extractor)
	si, ok3 := c.Sintetizador.(*falsos.Sintetizador)
	me, ok4 := c.Mensajeria.(*falsos.Mensajeria)
	if !ok1 || !ok2 || !ok3 || !ok4 {
		t.Fatal("los proveedores de desarrollo no son los falsos")
	}
	return tr.Llamadas(), ex.Llamadas(), si.Llamadas(), me.Llamadas()
}
