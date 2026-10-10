// Package claves calcula el HMAC-SHA256 con el que se guardan las credenciales
// (R1). El secreto en claro no se persiste.
package claves

import (
	"crypto/hmac"
	"crypto/sha256"
)

// HMAC devuelve 32 bytes. Si la clave del servidor está vacía, devuelve nil.
func HMAC(claveServidor, presentada string) []byte {
	if claveServidor == "" || presentada == "" {
		return nil
	}
	mac := hmac.New(sha256.New, []byte(claveServidor))
	_, _ = mac.Write([]byte(presentada))
	return mac.Sum(nil)
}
