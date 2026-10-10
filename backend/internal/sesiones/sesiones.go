// Package sesiones es el servicio de aplicación de las rutas públicas de
// sesión y cotización (T04b partes 1 y 2a): crea sesiones desde el enlace
// opaco, registra el consentimiento, reserva el cupo y emite el token de
// medios, cierra, lee sesión, presupuesto y derivación a WhatsApp, guarda el
// contacto del cliente y atiende ARCO. Habla solo con puertos (almacén,
// proveedores, reloj). El precio lo calcula Go (cotizador), nunca el LLM.
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
	// Parte 2a.
	MediosURL       string        // wss://host[:puerto] del WebSocket de medios
	VidaTokenMedios time.Duration // 5..60 s (TokenMedios.vence_en_s)
	EsperaCorta     time.Duration // Retry-After de simultaneas_agotadas (H4; 30 s)
}

// Servicio de sesiones.
type Servicio struct{ o Opciones }

// Errores de configuración.
var ErrOpciones = errors.New("sesiones: opciones incompletas")

var (
	reAviso     = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$`)
	reMediosURL = regexp.MustCompile(`^wss://[a-z0-9.-]+(:[0-9]{1,5})?$`)
)

// MediosURLPorDefecto: la del ejemplo del contrato (desarrollo; en producción
// la fija MEDIOS_WS_URL).
const MediosURLPorDefecto = "wss://api.videocotizacion.local"

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
	if o.Limites.DuracionMaximaS < dominio.MinimoReservaS || o.Limites.DuracionMaximaS > 3600 {
		return nil, fmt.Errorf("%w: duracion_maxima_s fuera de 60..3600", ErrOpciones)
	}
	if o.VidaToken <= 0 {
		// Como el ejemplo del contrato: 1 h, más que duracion_maxima_s, para
		// leer presupuesto y derivación al terminar.
		o.VidaToken = time.Hour
	}
	if o.MediosURL == "" {
		o.MediosURL = MediosURLPorDefecto
	}
	if !reMediosURL.MatchString(o.MediosURL) {
		return nil, fmt.Errorf("%w: URL del WebSocket de medios (wss://host[:puerto])", ErrOpciones)
	}
	if o.VidaTokenMedios == 0 {
		o.VidaTokenMedios = 30 * time.Second
	}
	if o.VidaTokenMedios < 5*time.Second || o.VidaTokenMedios > 60*time.Second {
		return nil, fmt.Errorf("%w: vida del token de medios fuera de 5..60 s", ErrOpciones)
	}
	if o.EsperaCorta <= 0 {
		o.EsperaCorta = 30 * time.Second
	}
	return &Servicio{o: o}, nil
}

// Opciones devuelve la configuración efectiva.
func (s *Servicio) Opciones() Opciones { return s.o }

// conEspera agrega el Retry-After calculado (H4, ADR 0005 §12) a los 429 de
// cupo: cuota hasta las 00:00 ART del día 1 del mes siguiente; simultáneas,
// la estimación corta.
func (s *Servicio) conEspera(err error, ahora time.Time) error {
	switch errores.CodigoDe(err) {
	case errores.CuotaAgotada:
		return errores.ConEspera(errores.CuotaAgotada, err, dominio.FinMesCuota(ahora).Sub(ahora))
	case errores.SimultaneasAgotadas:
		return errores.ConEspera(errores.SimultaneasAgotadas, err, s.o.EsperaCorta)
	}
	return err
}

// Creada es el resultado de CrearSesion (SesionCreada.schema.json).
type Creada struct {
	Sesion       dominio.Sesion
	Token        string
	TokenVenceEn time.Time
}

// CrearSesion crea una sesión del enlace opaco. No llama a ningún proveedor
// ni reserva cupo (R61): solo verifica que haya saldo ≥ 60 s y lugar
// (tenant y asesor; el global se aplica al reservar). limitarEnlace es el
// límite por enlace, que va con el enlace ya resuelto (paso 13 de la tabla).
func (s *Servicio) CrearSesion(ctx context.Context, t dominio.TenantID, idPublico string, modo dominio.ModoAvatar,
	limitarEnlace func() error) (Creada, error) {
	enlace, err := s.o.Almacen.LeerEnlace(ctx, t, idPublico)
	if err != nil {
		return Creada{}, err
	}
	if enlace.RevocadoEn != nil {
		return Creada{}, errores.Envolver(errores.NoEncontrado, errors.New("enlace revocado"))
	}
	if limitarEnlace != nil {
		if err := limitarEnlace(); err != nil {
			return Creada{}, err
		}
	}
	tenant, err := s.o.Almacen.LeerTenant(ctx, t)
	if err != nil {
		return Creada{}, err
	}
	ahora := s.o.Reloj.Ahora()
	cupo, err := s.o.Almacen.Cupo(ctx, t, enlace.AsesorID, dominio.MesCuota(ahora), ahora)
	if err != nil {
		return Creada{}, err
	}
	if err := cupo.Verificar(); err != nil {
		return Creada{}, s.conEspera(err, ahora)
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

// LeerSesion devuelve la sesión y, si existe, el id de su cotización.
func (s *Servicio) LeerSesion(ctx context.Context, t dominio.TenantID, id string) (dominio.Sesion, string, error) {
	ses, err := s.leer(ctx, t, id)
	if err != nil {
		return dominio.Sesion{}, "", err
	}
	cotID, err := s.cotizacionID(ctx, t, id)
	return ses, cotID, err
}

func (s *Servicio) cotizacionID(ctx context.Context, t dominio.TenantID, id string) (string, error) {
	c, err := s.o.Almacen.LeerCotizacionDeSesion(ctx, t, id)
	switch {
	case err == nil:
		return c.ID, nil
	case errores.Es(err, errores.NoEncontrado):
		return "", nil
	default:
		return "", err
	}
}

func (s *Servicio) leer(ctx context.Context, t dominio.TenantID, id string) (dominio.Sesion, error) {
	if !dominio.IDValido(id, dominio.PrefijoSesion) {
		return dominio.Sesion{}, errores.Envolver(errores.NoEncontrado, errors.New("id de sesión mal formado"))
	}
	return s.o.Almacen.LeerSesion(ctx, t, id)
}

// RegistrarConsentimiento registra el consentimiento previo a cámara y
// micrófono (R10, R12: solo-anexar). Solo desde "creada".
func (s *Servicio) RegistrarConsentimiento(ctx context.Context, t dominio.TenantID, id, avisoVersion string) (dominio.Consentimiento, error) {
	ses, err := s.leer(ctx, t, id)
	if err != nil {
		return dominio.Consentimiento{}, err
	}
	ahora := s.o.Reloj.Ahora()
	c, err := dominio.NuevoConsentimiento(ses, avisoVersion, ahora)
	if err != nil {
		return dominio.Consentimiento{}, err
	}
	if _, err := s.o.Almacen.RegistrarConsentimiento(ctx, t, c, ahora); err != nil {
		return dominio.Consentimiento{}, err
	}
	return c, nil
}

// Medios es la respuesta de emitirTokenMedios (TokenMedios.schema.json).
type Medios struct {
	Token   string
	WSURL   string
	VenceEn time.Time
	VidaS   int
	Reserva dominio.Reserva
}

// ProtocoloEventos es la versión (NO congelada) de los eventos del WebSocket.
const ProtocoloEventos = "vc-eventos.borrador.1"

// EmitirTokenMedios exige consentimiento (R10), reserva en forma atómica el
// cupo (R56/R57, H3; reconexión = misma reserva) y emite un token de medios
// corto y de un uso (R32). No toca proveedores (R61): eso lo hace el
// WebSocket después de sesion.autenticar (parte 2b).
func (s *Servicio) EmitirTokenMedios(ctx context.Context, t dominio.TenantID, id string) (Medios, error) {
	if _, err := s.leer(ctx, t, id); err != nil {
		return Medios{}, err
	}
	ahora := s.o.Reloj.Ahora()
	r, err := s.o.Almacen.ReservarCupo(ctx, t, dominio.PedidoReserva{SesionID: id, Ahora: ahora, SegundosMax: s.o.Limites.DuracionMaximaS})
	if err != nil {
		return Medios{}, s.conEspera(err, ahora)
	}
	if r.Vencida {
		// La llamada superó su reserva: el almacén la cobró completa y cerró la sesión.
		return Medios{}, errores.Envolver(errores.SesionCerrada, errors.New("la reserva de la sesión venció"))
	}
	valor, hash, _, err := credenciales.Nueva(s.o.Firmador, credenciales.Medios)
	if err != nil {
		return Medios{}, errores.Envolver(errores.ErrorInterno, err)
	}
	emitido := dominio.Instante(ahora)
	tok := dominio.TokenMedios{Hash: hash, SesionID: id, EmitidoEn: emitido, VenceEn: emitido.Add(s.o.VidaTokenMedios)}
	if err := s.o.Almacen.GuardarTokenMedios(ctx, t, tok); err != nil {
		return Medios{}, err
	}
	return Medios{
		Token: valor, WSURL: s.o.MediosURL + "/v1/sesiones/" + id + "/medios", VenceEn: tok.VenceEn,
		VidaS: int(s.o.VidaTokenMedios / time.Second), Reserva: r.Reserva,
	}, nil
}

// Cierre es la respuesta de cerrarSesion (CierreSesion.schema.json).
type Cierre struct {
	Sesion       dominio.Sesion
	CotizacionID string
	Derivacion   *Derivacion
}

// CerrarSesion cierra a pedido del cliente o del tenant. En la misma
// transacción libera el cupo (H2/H3). Con sin_consentimiento/sin_camara, o
// si hay presupuesto, devuelve la derivación a WhatsApp (R45).
func (s *Servicio) CerrarSesion(ctx context.Context, t dominio.TenantID, id string, motivo dominio.MotivoCierre) (Cierre, error) {
	if _, err := s.leer(ctx, t, id); err != nil {
		return Cierre{}, err
	}
	ses, err := s.o.Almacen.CerrarSesion(ctx, t, id, motivo, s.o.Reloj.Ahora())
	if err != nil {
		return Cierre{}, err
	}
	out := Cierre{Sesion: ses}
	if out.CotizacionID, err = s.cotizacionID(ctx, t, id); err != nil {
		return Cierre{}, err
	}
	if motivo == dominio.MotivoSinConsentimiento || motivo == dominio.MotivoSinCamara || out.CotizacionID != "" {
		d, err := s.derivar(ctx, t, ses)
		if err != nil {
			return Cierre{}, err
		}
		out.Derivacion = &d
	}
	return out, nil
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
	return s.derivar(ctx, t, ses)
}

func (s *Servicio) derivar(ctx context.Context, t dominio.TenantID, ses dominio.Sesion) (Derivacion, error) {
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
		d, err = s.o.Almacen.ObtenerDerivacion(ctx, t, dominio.Derivacion{SesionID: ses.ID, CodigoReferencia: codigo, GeneradaEn: s.o.Reloj.Ahora()})
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

// PedidoContacto son los datos de ContactoSolicitud ya validados por forma.
type PedidoContacto struct {
	Nombre, Telefono, Email, Preferencia string
	AvisoVersion                         string
}

// ContactoRegistrado es la respuesta de registrarContacto (sin repetir datos).
type ContactoRegistrado struct {
	SesionID      string
	RegistradoEn  time.Time
	AvisoVersion  string
	RetencionDias int
}

// RegistrarContacto guarda el contacto opcional del cliente (R68) con su
// consentimiento específico; vence con la sesión.
func (s *Servicio) RegistrarContacto(ctx context.Context, t dominio.TenantID, id string, p PedidoContacto) (ContactoRegistrado, error) {
	ses, err := s.leer(ctx, t, id)
	if err != nil {
		return ContactoRegistrado{}, err
	}
	tenant, err := s.o.Almacen.LeerTenant(ctx, t)
	if err != nil {
		return ContactoRegistrado{}, err
	}
	ahora := dominio.Instante(s.o.Reloj.Ahora())
	c := dominio.Contacto{SesionID: id, Nombre: p.Nombre, Telefono: p.Telefono, Email: p.Email, Preferencia: p.Preferencia,
		AvisoVersion: p.AvisoVersion, ConsentidoEn: ahora, BorrarDespuesDe: ses.BorrarDespuesDe}
	if err := s.o.Almacen.RegistrarContacto(ctx, t, c); err != nil {
		return ContactoRegistrado{}, err
	}
	return ContactoRegistrado{SesionID: id, RegistradoEn: ahora, AvisoVersion: p.AvisoVersion, RetencionDias: tenant.RetencionDias}, nil
}

// SolicitarArco registra una solicitud ARCO del titular (R22–R24) y, si es una
// supresión con los dos factores, borra la consulta (R23). Lo que devuelve no
// depende de que haya coincidencia (acuse genérico).
func (s *Servicio) SolicitarArco(ctx context.Context, t dominio.TenantID, p dominio.PedidoArco) (dominio.SolicitudArco, error) {
	id, err := dominio.NuevoIDSolicitudArco()
	if err != nil {
		return dominio.SolicitudArco{}, err
	}
	ahora := dominio.Instante(s.o.Reloj.Ahora())
	sol := dominio.SolicitudArco{ID: id, Tipo: p.Tipo, RecibidaEn: ahora, PlazoVenceEn: dominio.PlazoArco(p.Tipo, ahora)}
	return s.o.Almacen.AtenderArco(ctx, t, p, sol)
}

// Presupuestar emite el presupuesto de la sesión: el LLM (falso por ahora)
// solo EXTRAE datos; Go decodifica sin montos y calcula el precio con el
// tarifario. No tiene ruta HTTP en el contrato: lo llama el orquestador de la
// llamada (WebSocket, parte 2b) y llega al cliente por cotizacion.emitida y
// leerCotizacion.
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
