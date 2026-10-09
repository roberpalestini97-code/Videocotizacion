// Package api atiende las rutas públicas de contracts/openapi.yaml
// (0.1.4-borrador) de T04b parte 1: emitirDesafio, crearSesion, leerSesion,
// leerCotizacion y leerDerivacion. Cada pedido pasa por el orden de
// evaluación de contracts/estado-de-congelamiento.md ("Tabla de decisión"):
//
//  1. tasa → 429 limite_de_tasa
//  2. credencial ausente → 401 credencial_ausente; desconocida, vencida o
//     revocada → 401 credencial_invalida
//  3. tipo de credencial no admitido por la operación → 403 alcance_insuficiente
//  4. clave secreta con Origin → 403 clave_secreta_desde_navegador (R2)
//  5. clave pública con Origin ausente, ajeno o comodín → 403 origen_no_permitido
//  6. X-Desafio inválido → 403 desafio_invalido
//  8. cuerpo inválido → 422 (400 si no es JSON, 415 si no es application/json)
//  10. recurso inexistente o ajeno → el mismo 404 no_encontrado
//  11. estado → 409; 12. cupo → 429
//
// El tenant NUNCA es entrada: sale de la credencial (R3).
package api

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"videocotizacion/backend/internal/abuso"
	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/credenciales"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/reloj"
	"videocotizacion/backend/internal/servidor"
	"videocotizacion/backend/internal/sesiones"
)

// Encabezados del contrato.
const (
	EncabezadoClavePublica = "X-VC-Clave-Publica"
	EncabezadoDesafio      = "X-Desafio"
)

// Tasas agrupa los limitadores (R58). Un nil desactiva ese eje.
type Tasas struct {
	PorIP          *abuso.Limitador // todas las rutas
	PorCredencial  *abuso.Limitador // todas las rutas con credencial
	CrearPorIP     *abuso.Limitador // crearSesion
	CrearPorClave  *abuso.Limitador // crearSesion
	CrearPorEnlace *abuso.Limitador // crearSesion (después de leer el cuerpo)
	DesafioPorIP   *abuso.Limitador // emitirDesafio
}

// TasasPorDefecto: valores provisorios (por instancia; ver hueco B4).
func TasasPorDefecto(r reloj.Reloj) Tasas {
	return Tasas{
		PorIP:          abuso.NuevoLimitador(r, 120, time.Minute),
		PorCredencial:  abuso.NuevoLimitador(r, 600, time.Minute),
		CrearPorIP:     abuso.NuevoLimitador(r, 10, time.Minute),
		CrearPorClave:  abuso.NuevoLimitador(r, 120, time.Minute),
		CrearPorEnlace: abuso.NuevoLimitador(r, 10, time.Minute),
		DesafioPorIP:   abuso.NuevoLimitador(r, 20, time.Minute),
	}
}

// Opciones de la API.
type Opciones struct {
	Autenticacion almacen.Autenticacion
	Sesiones      *sesiones.Servicio
	Firmador      credenciales.Firmador
	Desafios      *abuso.Desafios
	Reloj         reloj.Reloj
	Tasas         Tasas
	Log           *slog.Logger
}

// Credencial es la identidad ya verificada del pedido.
type Credencial struct {
	Tipo     credenciales.Tipo
	Tenant   dominio.TenantID
	ClaveID  string // claves secreta y pública
	SesionID string // token de sesión
	Origin   string // clave pública: el Origin verificado
	clave    dominio.ClaveAPI
}

// operacion describe lo que el middleware necesita saber de cada ruta.
type operacion struct {
	nombre  string
	tipos   []credenciales.Tipo
	desafio bool // con clave pública exige X-Desafio (crearSesion)
	tasas   []*abuso.Limitador
	atender func(w http.ResponseWriter, r *http.Request, c Credencial) error
}

type api struct{ o Opciones }

func (a *api) log() *slog.Logger {
	if a.o.Log != nil {
		return a.o.Log
	}
	return slog.Default()
}

func (a *api) envolver(op operacion) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := a.evaluar(w, r, op); err != nil {
			servidor.EscribirError(w, r, a.log(), err)
		}
	}
}

func ipDe(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func tasaExcedida(espera time.Duration) error {
	return errores.Envolver(errores.LimiteDeTasa, errors.New("límite de tasa: reintentar en "+espera.Round(time.Second).String()))
}

func permitir(l *abuso.Limitador, clave string) error {
	if l == nil {
		return nil
	}
	if ok, espera := l.Permitir(clave); !ok {
		return tasaExcedida(espera)
	}
	return nil
}

// evaluar aplica la tabla de decisión hasta el paso 6 y llama a la operación.
func (a *api) evaluar(w http.ResponseWriter, r *http.Request, op operacion) error {
	// 1. Tasa (antes de tocar la base).
	ip := ipDe(r)
	if err := permitir(a.o.Tasas.PorIP, ip); err != nil {
		return err
	}
	for _, l := range op.tasas {
		if err := permitir(l, op.nombre+"|"+ip); err != nil {
			return err
		}
	}
	valor, viaPublica, err := leerCredencial(r)
	if err != nil {
		return err
	}
	huella := string(a.o.Firmador.Hash(valor))
	if err := permitir(a.o.Tasas.PorCredencial, huella); err != nil {
		return err
	}
	if op.desafio && viaPublica {
		if err := permitir(a.o.Tasas.CrearPorClave, huella); err != nil {
			return err
		}
	}
	// 2. Credencial.
	c, err := a.autenticar(r.Context(), valor, viaPublica)
	if err != nil {
		return err
	}
	// 3. Tipo admitido.
	admitido := false
	for _, t := range op.tipos {
		admitido = admitido || t == c.Tipo
	}
	if !admitido {
		return errores.Envolver(errores.AlcanceInsuficiente, errors.New("credencial "+string(c.Tipo)+" en "+op.nombre))
	}
	origins := r.Header.Values("Origin")
	switch c.Tipo {
	case credenciales.Secreta:
		// 4. Nunca desde un navegador (R2).
		if len(origins) > 0 {
			return errores.Nuevo(errores.ClaveSecretaDesdeNavegador)
		}
	case credenciales.Publica:
		// 5. Origin exacto de la lista de la clave (R55).
		if len(origins) != 1 || !c.clave.AdmiteOrigin(origins[0]) {
			return errores.Nuevo(errores.OrigenNoPermitido)
		}
		c.Origin = origins[0]
		// 6. Desafío de un uso ligado a clave + Origin (R53).
		if op.desafio {
			if err := a.o.Desafios.Consumir(r.Header.Get(EncabezadoDesafio), c.ClaveID, c.Origin); err != nil {
				return errores.Envolver(errores.DesafioInvalido, err)
			}
		}
	}
	return op.atender(w, r, c)
}

// leerCredencial toma la credencial de Authorization (secreta o token de
// sesión) o de X-VC-Clave-Publica. Las dos a la vez, o una en el lugar del
// otro, es credencial_invalida (falla cerrado).
func leerCredencial(r *http.Request) (valor string, viaPublica bool, err error) {
	authz := r.Header.Values("Authorization")
	pub := r.Header.Values(EncabezadoClavePublica)
	switch {
	case len(authz) == 0 && len(pub) == 0:
		return "", false, errores.Nuevo(errores.CredencialAusente)
	case len(authz)+len(pub) > 1:
		return "", false, errores.Envolver(errores.CredencialInvalida, errors.New("más de una credencial"))
	case len(pub) == 1:
		return pub[0], true, nil
	}
	v, ok := strings.CutPrefix(authz[0], "Bearer ")
	if !ok || v == "" {
		return "", false, errores.Envolver(errores.CredencialInvalida, errors.New("Authorization sin Bearer"))
	}
	return v, false, nil
}

// autenticar busca la credencial por su HMAC. Desconocida, vencida,
// revocada o en el encabezado equivocado: credencial_invalida.
func (a *api) autenticar(ctx context.Context, valor string, viaPublica bool) (Credencial, error) {
	invalida := func(motivo string) (Credencial, error) {
		return Credencial{}, errores.Envolver(errores.CredencialInvalida, errors.New(motivo))
	}
	tipo, ok := credenciales.Reconocer(valor)
	if !ok {
		return invalida("formato de credencial")
	}
	if (tipo == credenciales.Publica) != viaPublica {
		return invalida("credencial en el encabezado equivocado")
	}
	hash := a.o.Firmador.Hash(valor)
	switch tipo {
	case credenciales.Sesion:
		t, tok, err := a.o.Autenticacion.BuscarTokenSesion(ctx, hash)
		if errores.Es(err, errores.NoEncontrado) {
			return invalida("token desconocido")
		}
		if err != nil {
			return Credencial{}, err
		}
		if !tok.Vigente(a.o.Reloj.Ahora()) {
			return invalida("token vencido o revocado")
		}
		return Credencial{Tipo: tipo, Tenant: t, SesionID: tok.SesionID}, nil
	default:
		t, c, err := a.o.Autenticacion.BuscarClaveAPI(ctx, hash)
		if errores.Es(err, errores.NoEncontrado) {
			return invalida("clave desconocida")
		}
		if err != nil {
			return Credencial{}, err
		}
		if string(c.Tipo) != string(tipo) || c.RevocadaEn != nil {
			return invalida("clave revocada o de otro tipo")
		}
		return Credencial{Tipo: tipo, Tenant: t, ClaveID: c.ID, clave: c}, nil
	}
}
