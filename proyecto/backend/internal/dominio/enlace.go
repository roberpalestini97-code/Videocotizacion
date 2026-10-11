package dominio

import (
	"time"
)

// TipoClave distingue la clave secreta del tenant de la pública del widget.
type TipoClave string

const (
	ClaveSecreta TipoClave = "secreta"
	ClavePublica TipoClave = "publica"
)

// Prefijos de clave_id (migración 0002).
const (
	PrefijoClavePublica = "cpw_"
	PrefijoClaveSecreta = "cse_"
)

// ClaveAPI es una credencial guardada solo como HMAC (R1). El secreto en
// claro no entra a este tipo. Nombre es el rótulo del panel; las claves
// anteriores pueden no tenerlo.
type ClaveAPI struct {
	ID         string
	Tipo       TipoClave
	Hash       []byte // 32 bytes
	Prefijo    string
	Nombre     string
	Origenes   []string
	CreadaEn   time.Time
	RevocadaEn *time.Time
}

// ClaveHallada es lo que devuelve la búsqueda por hash, sin el hash.
type ClaveHallada struct {
	TenantID TenantID
	ID       string
	Tipo     TipoClave
	Origenes []string
	Revocada bool
}

// Validar verifica las mismas reglas que los CHECK de vc.claves_api.
func (c ClaveAPI) Validar() error {
	var errs []error
	prefijoID := PrefijoClaveSecreta
	if c.Tipo == ClavePublica {
		prefijoID = PrefijoClavePublica
	}
	if c.Tipo != ClavePublica && c.Tipo != ClaveSecreta {
		errs = append(errs, invalido("/tipo", "valor no permitido"))
	} else if !IDValido(c.ID, prefijoID) {
		errs = append(errs, invalido("/clave_id", "formato inválido"))
	}
	if len(c.Hash) != 32 {
		errs = append(errs, invalido("/hash", "debe ser de 32 bytes"))
	}
	if !rePrefijoClave.MatchString(c.Prefijo) {
		errs = append(errs, invalido("/prefijo", "formato inválido"))
	}
	if c.Nombre != "" && !textoValido(c.Nombre, 1, 60) {
		errs = append(errs, invalido("/nombre", "formato inválido"))
	}
	publica := c.Tipo == ClavePublica
	if publica != (len(c.Origenes) > 0) || len(c.Origenes) > 20 {
		errs = append(errs, invalido("/origenes", "la clave pública lleva de 1 a 20 Origin; la secreta ninguno"))
	}
	for _, o := range c.Origenes {
		if !originValido(o) {
			errs = append(errs, invalido("/origenes", "Origin inválido"))
		}
	}
	if c.CreadaEn.IsZero() {
		errs = append(errs, invalido("/creada_en", "requerido"))
	}
	return unir(errs)
}

// Enlace es el enlace opaco del profesional (BRIEF decisión 2).
type Enlace struct {
	IDPublico  string
	AsesorID   string
	CreadoEn   time.Time
	RevocadoEn *time.Time
}

// Validar verifica el id público y el asesor.
func (e Enlace) Validar() error {
	var errs []error
	if !reIDPublico.MatchString(e.IDPublico) {
		errs = append(errs, invalido("/id_publico", "formato inválido"))
	}
	if !IDValido(e.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if e.CreadoEn.IsZero() {
		errs = append(errs, invalido("/creado_en", "requerido"))
	}
	return unir(errs)
}

// TokenSesion es el HMAC de un vc_ses_ emitido por crearSesion. El valor en
// claro no entra a este tipo ni al almacén.
type TokenSesion struct {
	Hash       []byte
	SesionID   string
	EmitidoEn  time.Time
	VenceEn    time.Time
	RevocadoEn *time.Time
}

// Validar verifica las mismas reglas que los CHECK de vc.tokens_sesion.
func (t TokenSesion) Validar() error {
	var errs []error
	if len(t.Hash) != 32 {
		errs = append(errs, invalido("/hash", "debe ser de 32 bytes"))
	}
	if !IDValido(t.SesionID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato inválido"))
	}
	if t.EmitidoEn.IsZero() || !t.VenceEn.After(t.EmitidoEn) {
		errs = append(errs, invalido("/vence_en", "debe ser posterior a emitido_en"))
	}
	return unir(errs)
}

// TokenHallado es lo que devuelve la búsqueda por HMAC, sin el hash.
type TokenHallado struct {
	TenantID TenantID
	SesionID string
	VenceEn  time.Time
	Revocado bool
}
