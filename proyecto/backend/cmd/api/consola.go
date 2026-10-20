package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"time"

	"videocotizacion/backend/internal/config"
)

// nuevoRegistro elige el formato. En producción queda JSON (una línea por
// evento, para juntar después). En desarrollo y prueba, la ventana del
// backend muestra cada dato en su línea: el JSON de una sola línea se parte
// y esconde el motivo del turno.
func nuevoRegistro(w io.Writer, nivel slog.Level, entorno string) slog.Handler {
	if config.Entorno(entorno) == config.Produccion {
		return slog.NewJSONHandler(w, &slog.HandlerOptions{Level: nivel})
	}
	return &consola{mu: &sync.Mutex{}, w: w, nivel: nivel}
}

// consola escribe el registro para leerlo en la terminal de desarrollo.
// No inventa datos: imprime el mensaje y cada atributo que el llamador ya
// pasó. Los secretos siguen redactados por su LogValue.
type consola struct {
	mu      *sync.Mutex // compartido con los handlers derivados (WithAttrs, WithGroup): escriben en el mismo w
	w       io.Writer
	nivel   slog.Level
	grupo   string
	previos []slog.Attr
}

func (c *consola) Enabled(_ context.Context, nivel slog.Level) bool {
	return nivel >= c.nivel
}

func (c *consola) Handle(_ context.Context, r slog.Record) error {
	var b []byte
	b = fmt.Appendf(b, "%s %-5s %s\n", r.Time.In(time.Local).Format("15:04:05"), etiqueta(r.Level), r.Message)
	for _, a := range c.previos {
		b = escribirAttr(b, c.grupo, a)
	}
	r.Attrs(func(a slog.Attr) bool {
		b = escribirAttr(b, c.grupo, a)
		return true
	})
	c.mu.Lock()
	defer c.mu.Unlock()
	_, err := c.w.Write(b)
	return err
}

func (c *consola) WithAttrs(attrs []slog.Attr) slog.Handler {
	n := *c
	n.previos = append(append([]slog.Attr{}, c.previos...), attrs...)
	return &n
}

func (c *consola) WithGroup(nombre string) slog.Handler {
	if nombre == "" {
		return c
	}
	n := *c
	n.grupo = c.grupo + nombre + "."
	return &n
}

func etiqueta(n slog.Level) string {
	switch {
	case n >= slog.LevelError:
		return "ERROR"
	case n >= slog.LevelWarn:
		return "WARN"
	case n >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
}

func escribirAttr(b []byte, pref string, a slog.Attr) []byte {
	a.Value = a.Value.Resolve()
	if a.Key == "" && a.Value.Kind() != slog.KindGroup {
		return b
	}
	if a.Value.Kind() == slog.KindGroup {
		p := pref
		if a.Key != "" {
			p += a.Key + "."
		}
		for _, sub := range a.Value.Group() {
			b = escribirAttr(b, p, sub)
		}
		return b
	}
	return fmt.Appendf(b, "         %s%s=%v\n", pref, a.Key, a.Value.Any())
}
