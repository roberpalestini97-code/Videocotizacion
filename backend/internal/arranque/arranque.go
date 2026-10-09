// Package arranque cablea la aplicación a partir de la configuración: elige
// el almacén y los proveedores, arma el servidor y la retención programada.
// Es el único lugar que conoce adaptadores concretos (memoria, postgres,
// falsos). En producción se niega a usar almacén en memoria o proveedores
// falsos aunque la configuración se haya salteado (H4 de T20, doble chequeo).
package arranque

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/abuso"
	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/almacen/memoria"
	"videocotizacion/backend/internal/almacen/postgres"
	"videocotizacion/backend/internal/api"
	"videocotizacion/backend/internal/config"
	"videocotizacion/backend/internal/credenciales"
	"videocotizacion/backend/internal/migrador"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/falsos"
	"videocotizacion/backend/internal/reloj"
	"videocotizacion/backend/internal/retencion"
	"videocotizacion/backend/internal/salud"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/internal/servidor"
	"videocotizacion/backend/internal/sesiones"
	"videocotizacion/backend/migrations"
)

// ErrProduccionInsegura indica un cableado prohibido en producción.
var ErrProduccionInsegura = errors.New("cableado prohibido en producción")

// App es la aplicación armada.
type App struct {
	Config      config.Config
	Almacen     almacen.Completo
	Proveedores proveedores.Conjunto
	Reloj       reloj.Reloj
	Servidor    *http.Server
	Log         *slog.Logger
}

// Construir arma la App. Valida producción ANTES de abrir conexiones.
func Construir(ctx context.Context, cfg config.Config, log *slog.Logger) (*App, error) {
	prov, err := construirProveedores(cfg)
	if err != nil {
		return nil, err
	}
	if cfg.EsProduccion() {
		if f := prov.Falsos(); len(f) > 0 {
			sort.Strings(f)
			return nil, fmt.Errorf("%w: proveedores falsos %v", ErrProduccionInsegura, f)
		}
		if cfg.Almacen != config.AlmacenPostgres {
			return nil, fmt.Errorf("%w: almacén %q", ErrProduccionInsegura, cfg.Almacen)
		}
	}
	alm, err := AbrirAlmacen(ctx, cfg)
	if err != nil {
		return nil, err
	}
	app := &App{Config: cfg, Almacen: alm, Proveedores: prov, Reloj: reloj.Sistema{}, Log: log}
	rutas, err := construirRutas(cfg, app, log)
	if err != nil {
		alm.Cerrar()
		return nil, err
	}
	app.Servidor = servidor.Nuevo(servidor.Opciones{
		Direccion: cfg.Direccion, LecturaEncabezados: cfg.LecturaEncabezados, Lectura: cfg.Lectura,
		Escritura: cfg.Escritura, Inactividad: cfg.Inactividad, CuerpoMaxBytes: cfg.CuerpoMaxBytes,
		EncabezadosMax: cfg.EncabezadosMax, Log: log, Rutas: rutas,
		Listo: func(ctx context.Context) error {
			return salud.Listo(ctx, 2*time.Second, salud.Comprobacion{Nombre: "almacen", Probar: alm.Ping})
		},
	})
	return app, nil
}

// construirRutas arma el servicio de sesiones y la API de T04b parte 1.
func construirRutas(cfg config.Config, app *App, log *slog.Logger) (func(*http.ServeMux), error) {
	clave := cfg.CredencialesClave
	if clave.Vacio() {
		if cfg.EsProduccion() {
			return nil, fmt.Errorf("%w: falta CREDENCIALES_CLAVE_HMAC", ErrProduccionInsegura)
		}
		// Desarrollo/prueba: clave aleatoria por proceso (las credenciales
		// emitidas no sobreviven a un reinicio).
		v, err := credenciales.Aleatorio(32)
		if err != nil {
			return nil, err
		}
		clave = secreto.Nuevo(v)
		log.Warn("CREDENCIALES_CLAVE_HMAC vacía: se usa una clave aleatoria de este proceso (solo desarrollo)")
	}
	firmador, err := credenciales.NuevoFirmador(clave)
	if err != nil {
		return nil, err
	}
	srv, err := sesiones.Nuevo(sesiones.Opciones{
		Almacen: app.Almacen, Firmador: firmador, Reloj: app.Reloj,
		Mensajeria: app.Proveedores.Mensajeria, Extractor: app.Proveedores.Extractor,
		AvisoVersion: cfg.AvisoVersion, AvisoURL: cfg.AvisoURL,
	})
	if err != nil {
		return nil, err
	}
	o := api.Opciones{
		Autenticacion: app.Almacen, Sesiones: srv, Firmador: firmador, Reloj: app.Reloj, Log: log,
		Desafios: abuso.NuevosDesafios(app.Reloj, cfg.DesafioBits, cfg.DesafioVida, credenciales.Aleatorio),
		Tasas:    api.TasasPorDefecto(app.Reloj),
	}
	// Se valida acá para que un cableado incompleto falle al arrancar.
	if err := api.Registrar(http.NewServeMux(), o); err != nil {
		return nil, err
	}
	return func(mux *http.ServeMux) { _ = api.Registrar(mux, o) }, nil
}

// AbrirAlmacen abre el almacén configurado. Postgres verifica rol, RLS y
// versión del esquema al abrir.
func AbrirAlmacen(ctx context.Context, cfg config.Config) (almacen.Completo, error) {
	switch cfg.Almacen {
	case config.AlmacenMemoria:
		if cfg.EsProduccion() {
			return nil, fmt.Errorf("%w: almacén en memoria", ErrProduccionInsegura)
		}
		return memoria.Nuevo(), nil
	case config.AlmacenPostgres:
		ms, err := migrador.Leer(migrations.Archivos)
		if err != nil {
			return nil, err
		}
		return postgres.Abrir(ctx, cfg.DBURL, postgres.Opciones{
			ConexionesMax: cfg.DBConexMax, Timeout: cfg.DBTimeout,
			ExigirTLS: cfg.EsProduccion(), VersionEsquema: migrador.Ultima(ms),
		})
	default:
		return nil, fmt.Errorf("almacén %q no admitido", cfg.Almacen)
	}
}

func construirProveedores(cfg config.Config) (proveedores.Conjunto, error) {
	var c proveedores.Conjunto
	for _, p := range []struct {
		nombre, valor string
		falso         func()
	}{
		{"PROVEEDOR_STT", cfg.Proveedores.STT, func() { c.Transcriptor = &falsos.Transcriptor{Texto: ""} }},
		{"PROVEEDOR_LLM", cfg.Proveedores.LLM, func() { c.Extractor = &falsos.Extractor{} }},
		{"PROVEEDOR_TTS", cfg.Proveedores.TTS, func() { c.Sintetizador = &falsos.Sintetizador{} }},
		{"PROVEEDOR_WHATSAPP", cfg.Proveedores.WhatsApp, func() { c.Mensajeria = &falsos.Mensajeria{} }},
	} {
		switch p.valor {
		case config.ProveedorFalso:
			if cfg.EsProduccion() {
				return c, fmt.Errorf("%w: %s=falso", ErrProduccionInsegura, p.nombre)
			}
			p.falso()
		default:
			return c, fmt.Errorf("%s=%q: adaptador real no implementado todavía (T13)", p.nombre, p.valor)
		}
	}
	return c, nil
}

// Servir atiende pedidos en ln hasta que se cancele ctx; corre la retención
// programada si está configurada. Apaga ordenado y cierra el almacén.
func (a *App) Servir(ctx context.Context, ln net.Listener) error {
	defer a.Almacen.Cerrar()
	ctxRet, cancelarRet := context.WithCancel(ctx)
	defer cancelarRet()
	retFin := make(chan struct{})
	if a.Config.RetencionIntervalo > 0 {
		go func() {
			defer close(retFin)
			retencion.Programar(ctxRet, a.Config.RetencionIntervalo, a.Almacen, a.Reloj, a.Log)
		}()
	} else {
		close(retFin)
	}
	errSrv := make(chan error, 1)
	go func() { errSrv <- a.Servidor.Serve(ln) }()
	a.Log.Info("api escuchando", "direccion", ln.Addr().String(), "config", a.Config)
	var err error
	select {
	case err = <-errSrv:
	case <-ctx.Done():
		apagar, cancelar := context.WithTimeout(context.WithoutCancel(ctx), a.Config.Apagado)
		defer cancelar()
		err = a.Servidor.Shutdown(apagar)
		<-errSrv
	}
	cancelarRet()
	<-retFin
	if errors.Is(err, http.ErrServerClosed) {
		err = nil
	}
	return err
}

// Migrar aplica las migraciones con el rol dueño (`api migrar`, H3).
func Migrar(ctx context.Context, cfg config.Config, log *slog.Logger) error {
	ms, err := migrador.Leer(migrations.Archivos)
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, cfg.DBURLDueno.Revelar())
	if err != nil {
		return errors.New("migrar: no se pudo conectar con DB_URL_DUENO (revisar URL, red y credenciales)")
	}
	defer func() { _ = conn.Close(context.WithoutCancel(ctx)) }()
	res, err := migrador.Aplicar(ctx, conn, ms)
	if err != nil {
		return err
	}
	log.Info("migraciones al día", "aplicadas", res.Aplicadas, "ya_aplicadas", len(res.YaAplicadas))
	return nil
}

// RetencionUnaVez corre una pasada de borrado (`api retencion`, para cron).
func RetencionUnaVez(ctx context.Context, cfg config.Config, log *slog.Logger) error {
	alm, err := AbrirAlmacen(ctx, cfg)
	if err != nil {
		return err
	}
	defer alm.Cerrar()
	_, err = retencion.Ejecutar(ctx, alm, reloj.Sistema{}, log)
	return err
}
