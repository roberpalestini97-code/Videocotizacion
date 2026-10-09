package dominio

import (
	"fmt"
	"regexp"
	"slices"
	"time"

	"videocotizacion/backend/internal/errores"
)

// Prefijos de ids de claves de API (IdClaveWidget.schema.json para la
// pública; la secreta queda fuera del contrato, supuesto S5).
const (
	PrefijoClaveSecreta = "cse_"
	PrefijoClaveWidget  = "cpw_"
)

// NuevoIDClave genera el id de una clave según su tipo.
func NuevoIDClave(t TipoClave) (string, error) {
	if t == ClavePublica {
		return nuevoID(PrefijoClaveWidget)
	}
	return nuevoID(PrefijoClaveSecreta)
}

// TipoClave distingue la clave secreta (servidor a servidor, R1/R2) de la
// pública del widget (R54/R55).
type TipoClave string

// Tipos de clave.
const (
	ClaveSecreta TipoClave = "secreta"
	ClavePublica TipoClave = "publica"
)

var (
	reOrigin    = regexp.MustCompile(`^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:[0-9]{1,5})?$`)
	rePrefijo   = regexp.MustCompile(`^vc_(sec|pub)_[A-Za-z0-9_-]{4}$`)
	reIDPublico = regexp.MustCompile(`^[A-Za-z0-9_-]{22}$`)
	reCodigoRef = regexp.MustCompile(`^VC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{6}$`)
)

// OriginValido aplica Origin.schema.json: https, sin comodines, sin ruta.
func OriginValido(o string) bool { return len(o) <= 253 && reOrigin.MatchString(o) }

// IDPublicoValido aplica IdPublicoEnlace.schema.json.
func IDPublicoValido(id string) bool { return reIDPublico.MatchString(id) }

// CodigoReferenciaValido aplica CodigoReferencia.schema.json.
func CodigoReferenciaValido(c string) bool { return reCodigoRef.MatchString(c) }

// ClaveAPI es una credencial de tenant. Solo se guarda el HMAC (R1).
type ClaveAPI struct {
	ID         string
	Tipo       TipoClave
	Hash       []byte // HMAC-SHA256 con la clave del servidor (32 bytes)
	Prefijo    string // "vc_sec_abcd": para reconocerla en el panel, no la identifica
	Origenes   []string
	CreadaEn   time.Time
	RevocadaEn *time.Time
}

// Validar aplica las reglas de la tabla vc.claves_api.
func (c ClaveAPI) Validar() error {
	var errs []error
	switch c.Tipo {
	case ClaveSecreta:
		if !IDValido(c.ID, PrefijoClaveSecreta) {
			errs = append(errs, invalido("/clave_id", "formato"))
		}
		if len(c.Origenes) > 0 {
			errs = append(errs, invalido("/origenes", "la clave secreta no admite Origin (R2)"))
		}
	case ClavePublica:
		if !IDValido(c.ID, PrefijoClaveWidget) {
			errs = append(errs, invalido("/clave_id", "formato"))
		}
		if len(c.Origenes) < 1 || len(c.Origenes) > 20 || !unicos(c.Origenes) {
			errs = append(errs, invalido("/origenes", "entre 1 y 20, sin repetir"))
		}
		for _, o := range c.Origenes {
			if !OriginValido(o) {
				errs = append(errs, invalido("/origenes", "Origin exacto https sin comodines"))
			}
		}
	default:
		errs = append(errs, invalido("/tipo", "valor no permitido"))
	}
	if len(c.Hash) != 32 {
		errs = append(errs, invalido("/hash", "32 bytes"))
	}
	if !rePrefijo.MatchString(c.Prefijo) {
		errs = append(errs, invalido("/prefijo", "formato"))
	}
	if c.CreadaEn.IsZero() {
		errs = append(errs, invalido("/creada_en", "requerido"))
	}
	return unir(errs)
}

// AdmiteOrigin informa si el Origin está en la lista exacta (R55).
func (c ClaveAPI) AdmiteOrigin(o string) bool { return OriginValido(o) && slices.Contains(c.Origenes, o) }

// Enlace es el enlace opaco del profesional (BRIEF 2, R62).
type Enlace struct {
	IDPublico  string
	AsesorID   string
	CreadoEn   time.Time
	RevocadoEn *time.Time
}

// Validar aplica las reglas de vc.enlaces.
func (e Enlace) Validar() error {
	var errs []error
	if !IDPublicoValido(e.IDPublico) {
		errs = append(errs, invalido("/id_publico", "formato"))
	}
	if !IDValido(e.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato"))
	}
	if e.CreadoEn.IsZero() {
		errs = append(errs, invalido("/creado_en", "requerido"))
	}
	return unir(errs)
}

// TokenSesion es el token de una sola sesión (vc_ses_). Solo se guarda el HMAC.
type TokenSesion struct {
	Hash       []byte
	SesionID   string
	EmitidoEn  time.Time
	VenceEn    time.Time
	RevocadoEn *time.Time
}

// Validar aplica las reglas de vc.tokens_sesion.
func (t TokenSesion) Validar() error {
	var errs []error
	if len(t.Hash) != 32 {
		errs = append(errs, invalido("/hash", "32 bytes"))
	}
	if !IDValido(t.SesionID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato"))
	}
	if t.EmitidoEn.IsZero() || !t.VenceEn.After(t.EmitidoEn) {
		errs = append(errs, invalido("/vence_en", "posterior a la emisión"))
	}
	return unir(errs)
}

// Vigente informa si el token se puede usar en ese instante.
func (t TokenSesion) Vigente(ahora time.Time) bool {
	return t.RevocadoEn == nil && ahora.Before(t.VenceEn)
}

// Derivacion guarda solo el código de referencia (R50); la URL se arma al leer.
type Derivacion struct {
	SesionID         string
	CodigoReferencia string
	GeneradaEn       time.Time
}

// Validar aplica las reglas de vc.derivaciones.
func (d Derivacion) Validar() error {
	var errs []error
	if !IDValido(d.SesionID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato"))
	}
	if !CodigoReferenciaValido(d.CodigoReferencia) {
		errs = append(errs, invalido("/codigo_referencia", "formato"))
	}
	if d.GeneradaEn.IsZero() {
		errs = append(errs, invalido("/generada_en", "requerido"))
	}
	return unir(errs)
}

// NuevoCodigoReferencia genera "VC-XXXX-XXXXXX": 10 caracteres Crockford de
// crypto/rand (50 bits, no predecible, sin datos personales; R50).
func NuevoCodigoReferencia() (string, error) {
	var b [10]byte
	if _, err := leerAleatorio(b[:]); err != nil {
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("entropía para código de referencia: %w", err))
	}
	c := make([]byte, 10)
	for i, v := range b {
		c[i] = crockford[v&31]
	}
	return "VC-" + string(c[:4]) + "-" + string(c[4:]), nil
}

// Consumo resume el uso de un tenant para decidir el cupo (R56/R57).
type Consumo struct {
	SegundosMes int64 // duración consumida por sesiones creadas desde el inicio del mes
	Activas     int   // sesiones consentidas o en curso, creadas dentro de la ventana
}
