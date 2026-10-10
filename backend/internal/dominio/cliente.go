package dominio

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"videocotizacion/backend/internal/errores"
)

// PrefijoSolicitudArco (IdSolicitudArco.schema.json).
const PrefijoSolicitudArco = "arc_"

// NuevoIDSolicitudArco genera "arc_" + 26 Crockford (128 bits).
func NuevoIDSolicitudArco() (string, error) { return nuevoID(PrefijoSolicitudArco) }

// TokenMedios es el token del WebSocket de medios (TokenMedios.schema.json,
// R32): corto, de un uso, ligado a la sesión. Solo se guarda el HMAC.
type TokenMedios struct {
	Hash      []byte
	SesionID  string
	EmitidoEn time.Time
	VenceEn   time.Time
}

// Validar aplica las reglas de vc.tokens_medios (vida 5..60 s).
func (t TokenMedios) Validar() error {
	var errs []error
	if len(t.Hash) != 32 {
		errs = append(errs, invalido("/hash", "32 bytes"))
	}
	if !IDValido(t.SesionID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato"))
	}
	if vida := t.VenceEn.Sub(t.EmitidoEn); t.EmitidoEn.IsZero() || vida < 5*time.Second || vida > 60*time.Second {
		errs = append(errs, invalido("/vence_en", "entre 5 y 60 s después de la emisión"))
	}
	return unir(errs)
}

// Preferencias de contacto (ContactoSolicitud.preferencia).
var preferencias = map[string]bool{"whatsapp": true, "llamada": true, "email": true}

// FinalidadContacto es la única finalidad admitida (R68: sin publicidad).
const FinalidadContacto = "que_el_profesional_te_contacte"

// reEmail: forma simple y conservadora (sin espacios ni < >, una @, dominio
// con punto). El contrato usa format: email de ajv; esta regla es más estricta
// en caracteres, no más laxa.
var reEmail = regexp.MustCompile(`^[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$`)

// EmailValido aplica Email.schema.json (≤254).
func EmailValido(e string) bool { return len(e) <= 254 && reEmail.MatchString(e) }

// TelefonoValido aplica Telefono.schema.json (E.164).
func TelefonoValido(t string) bool { return reTelefono.MatchString(t) }

// Contacto del cliente final (R68). Datos personales: solo los ve el asesor de
// esa consulta (parte 2b) y caen con la sesión (retención, ARCO).
type Contacto struct {
	SesionID        string
	Nombre          string
	Telefono        string // "" si no lo dejó
	Email           string // "" si no lo dejó
	Preferencia     string // "" si no eligió
	AvisoVersion    string
	ConsentidoEn    time.Time
	BorrarDespuesDe time.Time
}

// Validar aplica ContactoSolicitud (al menos teléfono o email).
func (c Contacto) Validar() error {
	var errs []error
	if !IDValido(c.SesionID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato"))
	}
	if !textoValido(c.Nombre, 1, 80) {
		errs = append(errs, invalido("/nombre", "largo o caracteres inválidos"))
	}
	if c.Telefono == "" && c.Email == "" {
		errs = append(errs, invalido("/telefono", "hace falta teléfono o email"))
	}
	if c.Telefono != "" && !TelefonoValido(c.Telefono) {
		errs = append(errs, invalido("/telefono", "formato E.164"))
	}
	if c.Email != "" && !EmailValido(c.Email) {
		errs = append(errs, invalido("/email", "formato"))
	}
	if c.Preferencia != "" && !preferencias[c.Preferencia] {
		errs = append(errs, invalido("/preferencia", "valor no permitido"))
	}
	if !reVersionAviso.MatchString(c.AvisoVersion) {
		errs = append(errs, invalido("/consentimiento/aviso_version", "formato AAAA-MM-DD.n"))
	}
	if c.ConsentidoEn.IsZero() || !c.BorrarDespuesDe.After(c.ConsentidoEn) {
		errs = append(errs, invalido("/borrar_despues_de", "posterior al consentimiento"))
	}
	return unir(errs)
}

// AdmiteContacto: el contacto se deja con la llamada en curso o al terminar
// (tabla de decisión 0.1.5); antes, estado_invalido.
func (s Sesion) AdmiteContacto() error {
	if s.Estado == EstadoCreada || s.Estado == EstadoConsentida {
		return errores.Envolver(errores.EstadoInvalido, fmt.Errorf("contacto con la sesión %s", s.Estado))
	}
	return nil
}

// TipoArco (SolicitudArco.tipo).
type TipoArco string

// Tipos ARCO del contrato.
const (
	ArcoAcceso        TipoArco = "acceso"
	ArcoRectificacion TipoArco = "rectificacion"
	ArcoSupresion     TipoArco = "supresion"
)

// Valido informa si el tipo es del contrato.
func (t TipoArco) Valido() bool {
	return t == ArcoAcceso || t == ArcoRectificacion || t == ArcoSupresion
}

// PedidoArco es lo que manda el tenant en nombre del titular (R24: código de
// referencia + teléfono o email del contacto). No se guarda tal cual.
type PedidoArco struct {
	Tipo             TipoArco
	CodigoReferencia string
	Telefono, Email  string
	Detalle          string
}

// Coincide compara el segundo factor con el contacto de la consulta.
func (p PedidoArco) Coincide(c Contacto) bool {
	return (p.Telefono != "" && p.Telefono == c.Telefono) ||
		(p.Email != "" && c.Email != "" && strings.EqualFold(p.Email, c.Email))
}

// Resultados de una solicitud ARCO.
const (
	ArcoPendiente       = "pendiente"        // acceso o rectificación con coincidencia: la atiende el tenant
	ArcoSuprimida       = "suprimida"        // supresión con coincidencia: consulta y contacto borrados
	ArcoSinCoincidencia = "sin_coincidencia" // no hubo dos factores: no se hizo nada
)

// SolicitudArco guardada ANONIMIZADA (R23): sin teléfono, email ni código; el
// detalle solo si es una rectificación con coincidencia.
type SolicitudArco struct {
	ID           string
	Tipo         TipoArco
	RecibidaEn   time.Time
	PlazoVenceEn time.Time
	SesionID     string // "" salvo acceso/rectificación con coincidencia
	Detalle      string
	Resultado    string
}

// ResolverArco decide qué se guarda de la solicitud (anonimizada, R23).
func ResolverArco(s SolicitudArco, p PedidoArco, coincide bool, sesionID string) SolicitudArco {
	s.Tipo, s.SesionID, s.Detalle = p.Tipo, "", ""
	switch {
	case !coincide:
		s.Resultado = ArcoSinCoincidencia
	case p.Tipo == ArcoSupresion:
		s.Resultado = ArcoSuprimida
	default:
		s.Resultado, s.SesionID = ArcoPendiente, sesionID
		if p.Tipo == ArcoRectificacion {
			s.Detalle = p.Detalle
		}
	}
	return s
}

// PlazoArco: provisorio, A VALIDAR CON ABOGADO. Acceso: 10 días corridos;
// rectificación y supresión: 5 días hábiles (lunes a viernes en hora
// argentina, sin feriados).
func PlazoArco(t TipoArco, recibida time.Time) time.Time {
	if t == ArcoAcceso {
		return recibida.AddDate(0, 0, 10)
	}
	d := recibida
	for habiles := 0; habiles < 5; {
		d = d.AddDate(0, 0, 1)
		if wd := d.In(ZonaCuota).Weekday(); wd != time.Saturday && wd != time.Sunday {
			habiles++
		}
	}
	return d
}

// MensajeArco es el acuse genérico e idéntico haya o no coincidencia (R24).
const MensajeArco = "Recibimos la solicitud. Si los datos coinciden con una consulta, se responde dentro del plazo indicado, sin cargo."

// DetalleValido aplica SolicitudArco.detalle.
func DetalleValido(d string) bool { return utf8.ValidString(d) && textoValido(d, 1, 1000) }
