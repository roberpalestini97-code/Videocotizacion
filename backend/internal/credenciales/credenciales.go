// Package credenciales genera y reconoce las credenciales del contrato
// (claves `vc_sec_`/`vc_pub_` y token `vc_ses_`) y calcula su HMAC-SHA256 con
// una clave del servidor (R1): la base guarda solo el HMAC, nunca el valor.
// Núcleo puro: sin red ni base.
package credenciales

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"videocotizacion/backend/internal/secreto"
)

// Tipo de credencial según su prefijo.
type Tipo string

// Tipos reconocidos.
const (
	Secreta Tipo = "secreta" // vc_sec_ (claveSecreta)
	Publica Tipo = "publica" // vc_pub_ (clavePublica)
	Sesion  Tipo = "sesion"  // vc_ses_ (tokenSesion)
)

var prefijos = map[Tipo]string{Secreta: "vc_sec_", Publica: "vc_pub_", Sesion: "vc_ses_"}

// 256 bits en base64url sin relleno = 43 caracteres (patrón del contrato
// para vc_ses_; se usa el mismo largo para las claves).
var reCredencial = regexp.MustCompile(`^vc_(sec|pub|ses)_[A-Za-z0-9_-]{43}$`)

// LargoMinimoClaveServidor es el mínimo de la clave del HMAC (256 bits).
const LargoMinimoClaveServidor = 32

// ErrClaveServidor indica una clave de HMAC ausente o corta.
var ErrClaveServidor = errors.New("la clave del servidor para credenciales necesita al menos 32 bytes")

// Firmador calcula el HMAC de las credenciales con la clave del servidor.
type Firmador struct{ clave secreto.Secreto }

// NuevoFirmador valida el largo de la clave.
func NuevoFirmador(clave secreto.Secreto) (Firmador, error) {
	if len(clave.Revelar()) < LargoMinimoClaveServidor {
		return Firmador{}, ErrClaveServidor
	}
	return Firmador{clave: clave}, nil
}

// Hash devuelve HMAC-SHA256(clave del servidor, valor): 32 bytes.
func (f Firmador) Hash(valor string) []byte {
	m := hmac.New(sha256.New, []byte(f.clave.Revelar()))
	m.Write([]byte(valor))
	return m.Sum(nil)
}

// Reconocer devuelve el tipo de una credencial bien formada.
func Reconocer(valor string) (Tipo, bool) {
	if !reCredencial.MatchString(valor) {
		return "", false
	}
	for t, p := range prefijos {
		if strings.HasPrefix(valor, p) {
			return t, true
		}
	}
	return "", false
}

// Nueva genera una credencial de 256 bits de crypto/rand. El valor se
// entrega UNA vez al dueño; se guardan solo el HMAC y el prefijo visible.
func Nueva(f Firmador, t Tipo) (valor string, hash []byte, prefijoVisible string, err error) {
	p, ok := prefijos[t]
	if !ok {
		return "", nil, "", fmt.Errorf("tipo de credencial %q", t)
	}
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", nil, "", fmt.Errorf("entropía para credencial: %w", err)
	}
	valor = p + base64.RawURLEncoding.EncodeToString(b[:])
	return valor, f.Hash(valor), valor[:len(p)+4], nil
}

// Aleatorio devuelve n bytes de crypto/rand en base64url sin relleno.
func Aleatorio(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("entropía: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
