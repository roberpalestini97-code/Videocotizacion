package arranque

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen/pgprueba"
	"videocotizacion/backend/internal/config"
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
