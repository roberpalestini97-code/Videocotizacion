// Package servidor arma el http.Server con tiempos límite, tope de cuerpo y
// encabezados, recuperación de pánicos y errores problem+json del catálogo
// (H5, R9, R31). Expone /salud, /listo y, si Opciones.Extra está puesto, las
// rutas de T04b contra contracts/openapi.yaml.
package servidor

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"videocotizacion/backend/internal/errores"
)

// Opciones del servidor.
type Opciones struct {
	Direccion          string
	LecturaEncabezados time.Duration
	Lectura            time.Duration
	Escritura          time.Duration
	Inactividad        time.Duration
	CuerpoMaxBytes     int64
	EncabezadosMax     int
	// Listo verifica dependencias; nil = siempre listo.
	Listo func(ctx context.Context) error
	Log   *slog.Logger
	// Extra registra rutas de negocio (T04b) detrás de los mismos intermediarios.
	Extra func(*http.ServeMux)
	// CORSLoopback responde el preflight del navegador solo para
	// http://localhost y http://127.0.0.1. Producción lo deja en false.
	CORSLoopback bool
}

// Nuevo crea el http.Server listo para ListenAndServe.
func Nuevo(o Opciones) *http.Server {
	return &http.Server{
		Addr:              o.Direccion,
		Handler:           Manejador(o, o.Extra),
		ReadHeaderTimeout: o.LecturaEncabezados,
		ReadTimeout:       o.Lectura,
		WriteTimeout:      o.Escritura,
		IdleTimeout:       o.Inactividad,
		MaxHeaderBytes:    o.EncabezadosMax,
		ErrorLog:          slog.NewLogLogger(registro(o).Handler(), slog.LevelWarn),
	}
}

// Manejador arma las rutas. extra permite a las pruebas (y luego a T04b)
// registrar rutas que pasan por los mismos intermediarios.
func Manejador(o Opciones, extra func(*http.ServeMux)) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /salud", func(w http.ResponseWriter, _ *http.Request) {
		escribirJSON(w, http.StatusOK, map[string]string{"estado": "ok"})
	})
	mux.HandleFunc("GET /listo", func(w http.ResponseWriter, r *http.Request) {
		if o.Listo != nil {
			if err := o.Listo(r.Context()); err != nil {
				EscribirError(w, r, registro(o), errores.Envolver(errores.ServicioNoDisponible, err))
				return
			}
		}
		escribirJSON(w, http.StatusOK, map[string]string{"estado": "listo"})
	})
	if extra != nil {
		extra(mux)
	}
	// Todo lo demás: el mismo 404 del catálogo (no se distingue método ni ruta).
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		EscribirError(w, r, registro(o), errores.Nuevo(errores.NoEncontrado))
	})
	return recuperar(registro(o), encabezadosSeguros(corsLoopback(o.CORSLoopback, limitarCuerpo(o.CuerpoMaxBytes, registro(o), mux))))
}

var reCORSLoopback = regexp.MustCompile(`^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$`)

// corsLoopback agrega CORS solo si el Origin es loopback. Un Origin público
// no recibe Access-Control-Allow-Origin.
func corsLoopback(activo bool, next http.Handler) http.Handler {
	if !activo {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if reCORSLoopback.MatchString(origin) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Add("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-VC-Clave-Publica, X-Desafio, Idempotency-Key, X-CSRF-Token")
			h.Set("Access-Control-Expose-Headers", "Retry-After")
			h.Set("Access-Control-Max-Age", "600")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func registro(o Opciones) *slog.Logger {
	if o.Log != nil {
		return o.Log
	}
	return slog.Default()
}

// limitarCuerpo corta con 413 si Content-Length supera el tope y, si no lo
// declara, limita la lectura con http.MaxBytesReader (G08, R9).
func limitarCuerpo(max int64, log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ContentLength > max {
			EscribirError(w, r, log, errores.Nuevo(errores.CuerpoDemasiadoGrande))
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, max)
		next.ServeHTTP(w, r)
	})
}

func encabezadosSeguros(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "no-store")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

// recuperar convierte un pánico en 500 error_interno sin traza al cliente.
func recuperar(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				log.Error("pánico en el manejador", "ruta", r.URL.Path)
				EscribirError(w, r, log, errores.Nuevo(errores.ErrorInterno))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// EscribirError responde application/problem+json con los textos del
// catálogo. La causa interna solo va al log, junto al id de traza.
func EscribirError(w http.ResponseWriter, r *http.Request, log *slog.Logger, err error) {
	var mbe *http.MaxBytesError
	if errors.As(err, &mbe) {
		err = errores.Envolver(errores.CuerpoDemasiadoGrande, err)
	}
	traza := errores.NuevoIDTraza()
	p := errores.ProblemaDe(err, traza)
	nivel := slog.LevelInfo
	if p.Status >= 500 && !errors.Is(err, context.Canceled) {
		// Un pedido que el cliente cortó (context.Canceled) no es una falla
		// del servicio: va como INFO para no ensuciar las alertas (H9 de T43).
		nivel = slog.LevelError
	}
	detalle := string(p.Codigo)
	var e *errores.Error
	if errors.As(err, &e) {
		detalle = e.Detalle()
	}
	log.Log(r.Context(), nivel, "error en pedido", "id_traza", traza, "codigo", p.Codigo, "estado", p.Status, "ruta", r.URL.Path, "detalle", detalle)
	if p.Status == http.StatusServiceUnavailable || p.Status == http.StatusTooManyRequests {
		if p.ReintentarEnS == 0 {
			// El ejemplo de cuota_agotada del contrato pide una hora.
			if p.Codigo == errores.CuotaAgotada {
				p.ReintentarEnS = 3600
			} else if p.Codigo == errores.IntentosExcedidos {
				// Provisorio: el contrato no fija la ventana del panel. Quince minutos.
				p.ReintentarEnS = 900
			} else {
				p.ReintentarEnS = 5
			}
		}
		w.Header().Set("Retry-After", strconv.Itoa(p.ReintentarEnS))
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(p)
}

func escribirJSON(w http.ResponseWriter, estado int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(estado)
	_ = json.NewEncoder(w).Encode(v)
}
