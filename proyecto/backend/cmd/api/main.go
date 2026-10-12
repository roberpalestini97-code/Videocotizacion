// Comando api de VideoCotización.
//
//	api servir     atiende HTTP (/salud, /listo; rutas de negocio en T04b)
//	api migrar     aplica las migraciones con el rol dueño (DB_URL_DUENO)
//	api retencion  corre una pasada del borrado programado
//
// La configuración sale de variables de entorno (ver internal/config). Sale
// con código 1 si la configuración o el arranque no son seguros y con 2 si el
// comando es inválido.
package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"videocotizacion/backend/internal/arranque"
	"videocotizacion/backend/internal/config"
)

const uso = "uso: api servir | api migrar | api retencion"

// nivelLog lee LOG_NIVEL (debug, info, warn, error). Vacío es info.
func nivelLog(getenv config.Getenv) slog.Level {
	switch strings.ToLower(strings.TrimSpace(getenv("LOG_NIVEL"))) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func main() {
	ctx, cancelar := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancelar()
	if err := config.CargarArchivoEnv(".env"); err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo leer .env")
		os.Exit(1)
	}
	os.Exit(ejecutar(ctx, os.Args[1:], os.Getenv, os.Stderr))
}

func ejecutar(ctx context.Context, args []string, getenv config.Getenv, salida io.Writer) int {
	log := slog.New(nuevoRegistro(salida, nivelLog(getenv), getenv("ENTORNO")))
	if len(args) != 1 {
		_, _ = fmt.Fprintln(salida, uso) // si falla stderr no hay a quién avisar
		return 2
	}
	cmd := config.Comando(args[0])
	switch cmd {
	case config.Servir, config.Migrar, config.Retencion:
	default:
		_, _ = fmt.Fprintln(salida, uso) // si falla stderr no hay a quién avisar
		return 2
	}
	cfg, err := config.Cargar(getenv, cmd)
	if err != nil {
		log.Error("no se puede arrancar", "comando", string(cmd), "error", err.Error())
		return 1
	}
	switch cmd {
	case config.Migrar:
		err = arranque.Migrar(ctx, cfg, log)
	case config.Retencion:
		err = arranque.RetencionUnaVez(ctx, cfg, log)
	default:
		err = servir(ctx, cfg, log)
	}
	if err != nil {
		log.Error("terminó con error", "comando", string(cmd), "error", err.Error())
		return 1
	}
	return 0
}

func servir(ctx context.Context, cfg config.Config, log *slog.Logger) error {
	app, err := arranque.Construir(ctx, cfg, log)
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", cfg.Direccion)
	if err != nil {
		app.Almacen.Cerrar()
		return fmt.Errorf("escuchar en %s: %w", cfg.Direccion, err)
	}
	return app.Servir(ctx, ln)
}
