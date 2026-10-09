// Package sesiones es el servicio de aplicación de las rutas públicas de
// sesión y cotización (T04b parte 1): crea sesiones desde el enlace opaco,
// lee sesión, presupuesto y derivación a WhatsApp, y emite el presupuesto a
// partir de la salida del LLM. Habla solo con puertos (almacén, proveedores,
// reloj). El precio lo calcula Go (cotizador), nunca el LLM (R14/R15).
package sesiones

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/credenciales"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/reloj"
)

// Limites de la sesión (LimitesSesion.schema.json). Valores provisorios (P8).
type Limites struct {
	SinVozS               int
	DuracionMaximaS       int
	CaracteresMaxPorTurno int
	TurnosLLMMax          int
	Fotograma             ReglaFotograma
}

// ReglaFotograma (ReglaFotograma.schema.json; BRIEF decisión 3).
type ReglaFotograma struct {
	LadoMaxPx      int
	BytesMax       int
	IntervaloMinMs int
	MaxPorSesion   int
}

// LimitesPorDefecto: provisorios (P8); son los del ejemplo de SesionCreada
// del contrato.
var LimitesPorDefecto = Limites{
	SinVozS: 20, DuracionMaximaS: 900, CaracteresMaxPorTurno: 500, TurnosLLMMax: 60,
	Fotograma: ReglaFotograma{LadoMaxPx: 1024, BytesMax: 131072, IntervaloMinMs: 3000, MaxPorSesion: 400},
}

// Opciones del servicio.
type Opciones struct {
	Almacen      almacen.Completo
	Firmador     credenciales.Firmador
	Reloj        reloj.Reloj
	Mensajeria   proveedores.Mensajeria
	Extractor    proveedores.Extractor
	Cotizador    *cotizador.Cotizador // nil: Presupuestar responde error_interno
	AvisoVersion string               // VersionAviso.schema.json
	AvisoURL     string               // https
	Limites      Limites
	VidaToken    time.Duration // vigencia del token vc_ses_
	// ZonaMes define el inicio del mes para la cuota (Argentina, UTC−3).
	ZonaMes *time.Location
}

// Servicio de sesiones.
type Servicio struct{ o Opciones }

// Errores de configuración.
var ErrOpciones = errors.New("sesiones: opciones incompletas")

var reAviso = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$`)

// Nuevo valida las opciones.
func Nuevo(o Opciones) (*Servicio, error) {
	if o.Almacen == nil || o.Reloj == nil || o.Mensajeria == nil || o.Extractor == nil {
		return nil, ErrOpciones
	}
	if !reAviso.MatchString(o.AvisoVersion) || len(o.AvisoURL) < 9 || o.AvisoURL[:8] != "https://" {
		return nil, fmt.Errorf("%w: aviso de privacidad", ErrOpciones)
	}
	if o.Limites == (Limites{}) {
		o.Limites = LimitesPorDefecto
	}
	if o.VidaToken <= 0 {
		// Como el ejemplo del contrato: 1 h, más que duracion_maxima_s, para
		// leer presupuesto y derivación al terminar.
		o.VidaToken = time.Hour
	}
	if o.ZonaMes == nil {
		o.ZonaMes = time.FixedZone("ART", -3*3600)
	}
	return &Servicio{o: o}, nil
}

// Opciones devuelve la configuración efectiva.
func (s *Servicio) Opciones() Opciones { return s.o }

// Creada es el resultado de CrearSesion (SesionCreada.schema.json).
type Creada struct {
	Sesion       dominio.Sesion
	Token        string
	TokenVenceEn time.Time
}

// CrearSesion crea una sesión del enlace opaco. No llama a ningún proveedor
// ni reserva cupo (R61): solo verifica que haya cupo (R56/R57).
func (s *Servicio) CrearSesion(ctx context.Context, t dominio.TenantID, idPublico string, modo dominio.ModoAvatar) (Creada, error) {
	enlace, err := s.o.Almacen.LeerEnlace(ctx, t, idPublico)
	if err != nil {
		return Creada{}, err
	}
	if enlace.RevocadoEn != nil {
		return Creada{}, errores.Envolver(errores.NoEncontrado, errors.New("enlace revocado"))
	}
	tenant, err := s.o.Almacen.LeerTenant(ctx, t)
	if err != nil {
		return Creada{}, err
	}
	ahora := s.o.Reloj.Ahora()
	if err := s.verificarCupo(ctx, tenant, ahora); err != nil {
		return Creada{}, err
	}
	ses, err := dominio.NuevaSesion(enlace.AsesorID, modo, ahora, tenant.RetencionDias)
	if err != nil {
		return Creada{}, err
	}
	valor, hash, _, err := credenciales.Nueva(s.o.Firmador, credenciales.Sesion)
	if err != nil {
		return Creada{}, errores.Envolver(errores.ErrorInterno, err)
	}
	tok := dominio.TokenSesion{Hash: hash, SesionID: ses.ID, EmitidoEn: ses.CreadaEn, VenceEn: ses.CreadaEn.Add(s.o.VidaToken)}
	if err := s.o.Almacen.CrearSesionConToken(ctx, t, ses, tok); err != nil {
		return Creada{}, err
	}
	return Creada{Sesion: ses, Token: valor, TokenVenceEn: tok.VenceEn}, nil
}

// verificarCupo aplica los topes duros del tenant (R56/R57): primero la
// cuota mensual, después las simultáneas (orden de la tabla de decisión).
func (s *Servicio) verificarCupo(ctx context.Context, tenant dominio.Tenant, ahora time.Time) error {
	local := ahora.In(s.o.ZonaMes)
	inicioMes := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, s.o.ZonaMes)
	c, err := s.o.Almacen.Consumo(ctx, tenant.ID, inicioMes, ahora.Add(-s.o.VidaToken))
	if err != nil {
		return err
	}
	if c.SegundosMes >= int64(tenant.SegundosMesTope) {
		return errores.Envolver(errores.CuotaAgotada, fmt.Errorf("consumo %d s de %d", c.SegundosMes, tenant.SegundosMesTope))
	}
	if c.Activas >= tenant.SimultaneasTope {
		return errores.Envolver(errores.SimultaneasAgotadas, fmt.Errorf("%d activas de %d", c.Activas, tenant.SimultaneasTope))
	}
	return nil
}

// LeerSesion devuelve la sesión y, si existe, el id de su cotización.
func (s *Servicio) LeerSesion(ctx context.Context, t dominio.TenantID, id string) (dominio.Sesion, string, error) {
	ses, err := s.leer(ctx, t, id)
	if err != nil {
		return dominio.Sesion{}, "", err
	}
	c, err := s.o.Almacen.LeerCotizacionDeSesion(ctx, t, id)
	switch {
	case err == nil:
		return ses, c.ID, nil
	case errores.Es(err, errores.NoEncontrado):
		return ses, "", nil
	default:
		return dominio.Sesion{}, "", err
	}
}

func (s *Servicio) leer(ctx context.Context, t dominio.TenantID, id string) (dominio.Sesion, error) {
	if !dominio.IDValido(id, dominio.PrefijoSesion) {
		return dominio.Sesion{}, errores.Envolver(errores.NoEncontrado, errors.New("id de sesión mal formado"))
	}
	return s.o.Almacen.LeerSesion(ctx, t, id)
}

// LeerCotizacion: sesión inexistente → 404; sin presupuesto → 409
// cotizacion_no_emitida.
func (s *Servicio) LeerCotizacion(ctx context.Context, t dominio.TenantID, id string) (dominio.Cotizacion, error) {
	if _, err := s.leer(ctx, t, id); err != nil {
		return dominio.Cotizacion{}, err
	}
	c, err := s.o.Almacen.LeerCotizacionDeSesion(ctx, t, id)
	if errores.Es(err, errores.NoEncontrado) {
		return dominio.Cotizacion{}, errores.Envolver(errores.CotizacionNoEmitida, err)
	}
	return c, err
}

// Derivacion es la respuesta de leerDerivacion (DerivacionWhatsApp.schema.json).
type Derivacion struct {
	CodigoReferencia string
	URL              string
	Texto            string
	GeneradaEn       time.Time
}

// TextoDerivacion arma el texto prellenado: SOLO el código de referencia,
// sin datos personales (R50).
func TextoDerivacion(codigo string) string {
	return "Hola, quiero seguir con mi videocotización " + codigo
}

var reWaMe = regexp.MustCompile(`^https://wa\.me/[1-9][0-9]{7,14}\?text=[A-Za-z0-9%._~-]+$`)

// LeerDerivacion: disponible solo con la sesión cerrada (409 estado_invalido
// si no). El código se genera la primera vez y después se reusa.
func (s *Servicio) LeerDerivacion(ctx context.Context, t dominio.TenantID, id string) (Derivacion, error) {
	ses, err := s.leer(ctx, t, id)
	if err != nil {
		return Derivacion{}, err
	}
	if ses.Estado != dominio.EstadoCerrada {
		return Derivacion{}, errores.Envolver(errores.EstadoInvalido, fmt.Errorf("derivación con la sesión %s", ses.Estado))
	}
	asesor, err := s.o.Almacen.LeerAsesor(ctx, t, ses.AsesorID)
	if err != nil {
		return Derivacion{}, err
	}
	var d dominio.Derivacion
	for intento := 0; ; intento++ {
		codigo, err := dominio.NuevoCodigoReferencia()
		if err != nil {
			return Derivacion{}, err
		}
		d, err = s.o.Almacen.ObtenerDerivacion(ctx, t, dominio.Derivacion{SesionID: id, CodigoReferencia: codigo, GeneradaEn: s.o.Reloj.Ahora()})
		if err == nil {
			break
		}
		// Código repetido en el tenant (1 en 2^50): se reintenta con otro.
		if !errores.Es(err, errores.EstadoInvalido) || intento >= 3 {
			return Derivacion{}, err
		}
	}
	texto := TextoDerivacion(d.CodigoReferencia)
	url, err := s.o.Mensajeria.EnlaceDerivacion(ctx, asesor.WhatsApp, texto)
	if err != nil {
		// leerDerivacion no documenta 503: la falla de la mensajería es interna.
		return Derivacion{}, errores.Envolver(errores.ErrorInterno, err)
	}
	if !reWaMe.MatchString(url) {
		return Derivacion{}, errores.Envolver(errores.ErrorInterno, errors.New("la mensajería devolvió una URL fuera del contrato"))
	}
	return Derivacion{CodigoReferencia: d.CodigoReferencia, URL: url, Texto: texto, GeneradaEn: d.GeneradaEn}, nil
}

// Presupuestar emite el presupuesto de la sesión: el LLM (falso por ahora)
// solo EXTRAE datos; Go decodifica sin montos y calcula el precio con el
// tarifario. Lo llamará el orquestador de la llamada (T04b parte 2).
func (s *Servicio) Presupuestar(ctx context.Context, t dominio.TenantID, id, transcripcion string) (dominio.Cotizacion, error) {
	if s.o.Cotizador == nil {
		return dominio.Cotizacion{}, errores.Envolver(errores.ErrorInterno, errors.New("sin cotizador configurado"))
	}
	ses, err := s.leer(ctx, t, id)
	if err != nil {
		return dominio.Cotizacion{}, err
	}
	switch ses.Estado {
	case dominio.EstadoConsentida, dominio.EstadoEnCurso:
	case dominio.EstadoCerrada:
		return dominio.Cotizacion{}, errores.Envolver(errores.SesionCerrada, errors.New("presupuestar sesión cerrada"))
	default:
		return dominio.Cotizacion{}, errores.Envolver(errores.ConsentimientoRequerido, errors.New("presupuestar sin consentimiento"))
	}
	r, err := s.o.Extractor.Extraer(ctx, proveedores.PedidoExtraccion{Transcripcion: transcripcion})
	if err != nil {
		return dominio.Cotizacion{}, errores.Envolver(errores.ProveedorNoDisponible, err)
	}
	salida, err := cotizador.DecodificarSalidaLLM(r.JSON)
	if err != nil {
		// Incluye una salida con "precio" o "monto": el LLM no pone precios.
		return dominio.Cotizacion{}, errores.Envolver(errores.CotizacionNoEmitida, err)
	}
	pedido, err := salida.Pedido()
	if err != nil {
		return dominio.Cotizacion{}, errores.Envolver(errores.CotizacionNoEmitida, err)
	}
	c, err := s.o.Cotizador.Cotizar(ses, pedido, s.o.Reloj.Ahora())
	if err != nil {
		return dominio.Cotizacion{}, err
	}
	if err := s.o.Almacen.GuardarCotizacion(ctx, t, c); err != nil {
		return dominio.Cotizacion{}, err
	}
	return c, nil
}
