package dominio

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/binary"
	"fmt"
	"time"

	"videocotizacion/backend/internal/errores"
)

const (
	// PasoTOTP es el intervalo de RFC 6238. La ventana de aceptación es ±1.
	PasoTOTP = 30 * time.Second
	// MetodoHMACRecuperacion es el único método con el que se guardan los
	// códigos de recuperación: HMAC-SHA256 con CLAVE_HMAC, nunca el claro.
	MetodoHMACRecuperacion = "hmac-sha256"
)

// SecretoTOTP es el secreto ya cifrado. El claro no entra al almacén.
type SecretoTOTP struct {
	AsesorID string
	Cifrado  []byte
	CreadaEn time.Time
}

// CodigoRecuperacion guarda el HMAC de un código de un solo uso.
type CodigoRecuperacion struct {
	AsesorID string
	Hash     []byte
	Metodo   string
	Usado    bool
	// Reutilizable: no se marca como usado al ingresar. Solo la semilla demo
	// (SEMILLA_LOCAL, almacén en memoria) lo pone en true; nunca un código real.
	Reutilizable bool
}

// IngresoHallado es la cookie encontrada sin conocer el tenant de antemano.
type IngresoHallado struct {
	TenantID TenantID
	IngresoPanel
}

// AperturaPanel consume el segundo factor, invalida la cookie preliminar y
// deja la sesión nueva. Lleva HMAC, no el código ni el secreto.
type AperturaPanel struct {
	HashPrevio       []byte
	Paso             *int64
	HashRecuperacion []byte
	Nueva            IngresoPanel
	Ahora            time.Time
}

func (s SecretoTOTP) Validar() error {
	var errs []error
	if !IDValido(s.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if len(s.Cifrado) < 29 || len(s.Cifrado) > 128 {
		errs = append(errs, invalido("/cifrado", "largo inválido"))
	}
	if s.CreadaEn.IsZero() {
		errs = append(errs, invalido("/creada_en", "requerido"))
	}
	return unir(errs)
}

func (c CodigoRecuperacion) Validar() error {
	var errs []error
	if !IDValido(c.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if len(c.Hash) != 32 {
		errs = append(errs, invalido("/hash", "largo inválido"))
	}
	if c.Metodo != MetodoHMACRecuperacion {
		errs = append(errs, invalido("/metodo", "valor no permitido"))
	}
	if c.Usado {
		errs = append(errs, invalido("/usado", "el alta no marca uso"))
	}
	return unir(errs)
}

func (a AperturaPanel) Validar() error {
	tienePaso := a.Paso != nil
	tieneRec := len(a.HashRecuperacion) != 0
	if tienePaso == tieneRec {
		return invalido("/apertura", "se espera un solo factor")
	}
	if len(a.HashPrevio) != 32 || (tieneRec && len(a.HashRecuperacion) != 32) {
		return invalido("/hash", "largo inválido")
	}
	if a.Nueva.Preliminar {
		return invalido("/cookie", "la sesión nueva no es preliminar")
	}
	if a.Ahora.IsZero() {
		return invalido("/ahora", "requerido")
	}
	return a.Nueva.Validar()
}

// CifrarSecretoTOTP sella el secreto con AES-256-GCM. La clave de 32 bytes
// es SHA-256("vc-totp-aes-gcm-v1" || 0 || CLAVE_HMAC). El resultado es
// nonce || ciphertext y no incluye el secreto en claro.
func CifrarSecretoTOTP(clave string, secreto []byte) ([]byte, error) {
	if clave == "" || len(secreto) < 16 || len(secreto) > 32 {
		return nil, invalido("/secreto", "formato inválido")
	}
	gcm, err := gcmDe(clave)
	if err != nil {
		return nil, err
	}
	var nonce [12]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("nonce"))
	}
	pref := make([]byte, len(nonce), len(nonce)+len(secreto)+gcm.Overhead())
	copy(pref, nonce[:])
	return gcm.Seal(pref, nonce[:], secreto, nil), nil
}

// DescifrarSecretoTOTP abre el sobre. El error no incluye el secreto.
func DescifrarSecretoTOTP(clave string, cifrado []byte) ([]byte, error) {
	if clave == "" || len(cifrado) < 12+16 {
		return nil, invalido("/secreto", "formato inválido")
	}
	gcm, err := gcmDe(clave)
	if err != nil {
		return nil, err
	}
	claro, err := gcm.Open(nil, cifrado[:12], cifrado[12:], nil)
	if err != nil {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("secreto totp"))
	}
	return claro, nil
}

// CifrarCSRFPanel sella el token que GET tiene que devolver al recargar.
// La clave no es la del secreto TOTP. El resultado es nonce || ciphertext.
func CifrarCSRFPanel(clave, token string) ([]byte, error) {
	if clave == "" || !csrfPanelValido(token) {
		return nil, invalido("/csrf", "formato inválido")
	}
	gcm, err := gcmCSRF(clave)
	if err != nil {
		return nil, err
	}
	var nonce [12]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("nonce"))
	}
	claro := []byte(token)
	pref := make([]byte, len(nonce), len(nonce)+len(claro)+gcm.Overhead())
	copy(pref, nonce[:])
	sobre := gcm.Seal(pref, nonce[:], claro, nil)
	for i := range claro {
		claro[i] = 0
	}
	return sobre, nil
}

// DescifrarCSRFPanel abre el sobre. El error no incluye el token.
func DescifrarCSRFPanel(clave string, cifrado []byte) (string, error) {
	if clave == "" || len(cifrado) < 12+16 {
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("csrf"))
	}
	gcm, err := gcmCSRF(clave)
	if err != nil {
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("csrf"))
	}
	claro, err := gcm.Open(nil, cifrado[:12], cifrado[12:], nil)
	if err != nil {
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("csrf"))
	}
	if !csrfPanelValido(string(claro)) {
		for i := range claro {
			claro[i] = 0
		}
		return "", errores.Envolver(errores.ErrorInterno, fmt.Errorf("csrf"))
	}
	token := string(claro)
	for i := range claro {
		claro[i] = 0
	}
	return token, nil
}

func csrfPanelValido(token string) bool {
	if len(token) != 43 {
		return false
	}
	for _, c := range token {
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '_', c == '-':
		default:
			return false
		}
	}
	return true
}

func gcmCSRF(clave string) (cipher.AEAD, error) {
	h := sha256.New()
	_, _ = h.Write([]byte("vc-panel-csrf-aes-gcm-v1"))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write([]byte(clave))
	block, err := aes.NewCipher(h.Sum(nil))
	if err != nil {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("cifrado"))
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("cifrado"))
	}
	return gcm, nil
}

func gcmDe(clave string) (cipher.AEAD, error) {
	block, err := aes.NewCipher(claveAES(clave))
	if err != nil {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("cifrado"))
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, errores.Envolver(errores.ErrorInterno, fmt.Errorf("cifrado"))
	}
	return gcm, nil
}

func claveAES(clave string) []byte {
	h := sha256.New()
	_, _ = h.Write([]byte("vc-totp-aes-gcm-v1"))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write([]byte(clave))
	return h.Sum(nil)
}

// CodigoTOTP es el código RFC 6238 (HMAC-SHA1, 6 dígitos) del paso de 30 s
// que contiene instante. SHA-1 queda porque el estándar TOTP lo exige.
func CodigoTOTP(secreto []byte, instante time.Time) string {
	return codigoEnPaso(secreto, contadorDe(instante.Unix()/int64(PasoTOTP/time.Second)))
}

// PasoQueCoincide recorre la ventana ±1 y devuelve el paso que coincide.
// Siempre calcula los tres códigos. Reusar ese paso es totp_invalido.
func PasoQueCoincide(secreto []byte, codigo string, instante time.Time) (int64, bool) {
	base := instante.Unix() / int64(PasoTOTP/time.Second)
	esperado := codigo
	if len(esperado) != 6 {
		esperado = "000000"
	}
	var elegido int64
	var hay int
	for _, delta := range []int64{0, -1, 1} {
		paso := base + delta
		sum := codigoEnPaso(secreto, contadorDe(paso))
		coincide := subtle.ConstantTimeCompare([]byte(sum), []byte(esperado))
		if coincide == 1 && hay == 0 && len(codigo) == 6 {
			elegido = paso
			hay = 1
		}
	}
	return elegido, hay == 1
}

func contadorDe(paso int64) uint64 {
	if paso < 0 {
		return 0
	}
	return uint64(paso)
}

func codigoEnPaso(secreto []byte, contador uint64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], contador)
	mac := hmac.New(sha1.New, secreto)
	_, _ = mac.Write(msg[:])
	sum := mac.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	bin := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", bin%1000000)
}
