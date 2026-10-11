// Package dominio contiene las entidades y reglas puras de VideoCotización:
// tenant, asesor, sesión, consentimiento y cotización. No importa adaptadores
// (almacén, proveedores, HTTP); la prueba de internal/arquitectura lo vigila.
package dominio

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"

	"videocotizacion/backend/internal/errores"
)

// Alfabeto Crockford base32 (sin I, L, O, U), el de los ids del contrato.
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// Prefijos de ids opacos del contrato (R7).
const (
	PrefijoSesion         = "ses_"
	PrefijoCotizacion     = "cot_"
	PrefijoAsesor         = "ase_"
	PrefijoConsentimiento = "cns_"
	PrefijoRegistro       = "reg_"
)

var (
	reID             = regexp.MustCompile(`^[a-z]{3}_[0-9A-HJKMNP-TV-Z]{26}$`)
	reIDPublico      = regexp.MustCompile(`^[A-Za-z0-9_-]{22}$`)
	rePrefijoClave   = regexp.MustCompile(`^vc_(sec|pub)_[A-Za-z0-9_-]{4}$`)
	reOrigin         = regexp.MustCompile(`^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:[0-9]{1,5})?$`)
	reOriginLoopback = regexp.MustCompile(`^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$`)
)

// permitirOriginLoopback lo enciende el arranque fuera de producción, para
// que la semilla local pueda guardar http://localhost. En producción queda
// apagado: un Origin de loopback no pasa la validación.
var permitirOriginLoopback bool

// PermitirOriginLoopback habilita http://localhost y http://127.0.0.1 en la
// validación de Origin. El proceso de producción no lo llama.
func PermitirOriginLoopback(v bool) { permitirOriginLoopback = v }

func originValido(o string) bool {
	if reOrigin.MatchString(o) {
		return true
	}
	return permitirOriginLoopback && reOriginLoopback.MatchString(o)
}

// leerAleatorio se puede reemplazar en pruebas para simular fallas de entropía.
var leerAleatorio = rand.Read

// nuevoID genera prefijo + 26 caracteres Crockford a partir de 128 bits de
// crypto/rand (los 2 bits más altos del primer carácter quedan en cero).
func nuevoID(prefijo string) (string, error) {
	var b [16]byte
	if _, err := leerAleatorio(b[:]); err != nil {
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("entropía para id: %w", err))
	}
	var sb strings.Builder
	sb.Grow(len(prefijo) + 26)
	sb.WriteString(prefijo)
	// 128 bits = 2 bits + 25 grupos de 5 bits.
	hi := uint64(b[0])<<56 | uint64(b[1])<<48 | uint64(b[2])<<40 | uint64(b[3])<<32 |
		uint64(b[4])<<24 | uint64(b[5])<<16 | uint64(b[6])<<8 | uint64(b[7])
	lo := uint64(b[8])<<56 | uint64(b[9])<<48 | uint64(b[10])<<40 | uint64(b[11])<<32 |
		uint64(b[12])<<24 | uint64(b[13])<<16 | uint64(b[14])<<8 | uint64(b[15])
	for i := 25; i >= 0; i-- {
		desplazamiento := uint(i * 5)
		var v uint64
		switch {
		case desplazamiento >= 64:
			v = hi >> (desplazamiento - 64)
		case desplazamiento > 59:
			v = lo>>desplazamiento | hi<<(64-desplazamiento)
		default:
			v = lo >> desplazamiento
		}
		sb.WriteByte(crockford[v&31])
	}
	return sb.String(), nil
}

// IDValido verifica prefijo y formato de un id opaco.
func IDValido(id, prefijo string) bool {
	return strings.HasPrefix(id, prefijo) && reID.MatchString(id)
}

// NuevoIDSesion, NuevoIDCotizacion, NuevoIDAsesor, NuevoIDConsentimiento.
func NuevoIDSesion() (string, error)         { return nuevoID(PrefijoSesion) }
func NuevoIDCotizacion() (string, error)     { return nuevoID(PrefijoCotizacion) }
func NuevoIDAsesor() (string, error)         { return nuevoID(PrefijoAsesor) }
func NuevoIDConsentimiento() (string, error) { return nuevoID(PrefijoConsentimiento) }
func NuevoIDRegistro() (string, error)       { return nuevoID(PrefijoRegistro) }
func NuevoIDClavePublica() (string, error)   { return nuevoID(PrefijoClavePublica) }
func NuevoIDClaveSecreta() (string, error)   { return nuevoID(PrefijoClaveSecreta) }

// NuevoIDPublico genera el id opaco del enlace (22 caracteres).
func NuevoIDPublico() (string, error) {
	const alfa = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
	var b [22]byte
	if _, err := leerAleatorio(b[:]); err != nil {
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("entropía para enlace: %w", err))
	}
	for i := range b {
		b[i] = alfa[int(b[i])%len(alfa)]
	}
	return string(b[:]), nil
}

// TenantID es un UUID en texto canónico (minúsculas). Sale SIEMPRE de la
// credencial autenticada, nunca del cuerpo de la petición (ADR 0005).
type TenantID string

var reUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// Valido informa si el TenantID tiene formato UUID canónico.
func (t TenantID) Valido() bool { return reUUID.MatchString(string(t)) }

// NuevoTenantID genera un UUID v4.
func NuevoTenantID() (TenantID, error) {
	var b [16]byte
	if _, err := leerAleatorio(b[:]); err != nil {
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("entropía para tenant: %w", err))
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	h := hex.EncodeToString(b[:])
	return TenantID(h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]), nil
}

// ExigirTenant devuelve error de validación si el tenant no es un UUID.
func ExigirTenant(t TenantID) error {
	if !t.Valido() {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("tenant_id con formato inválido"))
	}
	return nil
}
