// Package enlace implementa Mensajeria sin proveedor externo (ADR 0006 §6):
// arma https://wa.me/<número>?text=<texto> y NO envía nada. El texto lo arma
// Go con el código de referencia opaco; no lleva datos personales del cliente.
package enlace

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"unicode/utf8"

	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
)

// MaxTexto acota el texto prellenado (el enlace tiene que entrar en una URL).
const MaxTexto = 300

// ErrTelefono indica un número que no está en formato E.164.
var ErrTelefono = errors.New("teléfono no E.164")

// ErrTexto indica un texto vacío, largo o con caracteres de control.
var ErrTexto = errors.New("texto prellenado inválido")

// Mensajeria arma enlaces wa.me. No tiene estado ni red.
type Mensajeria struct{}

// EnlaceDerivacion implementa proveedores.Mensajeria. Usa PathEscape (espacio
// = %20), igual que el ejemplo de DerivacionWhatsApp del contrato.
func (Mensajeria) EnlaceDerivacion(ctx context.Context, telefonoE164, texto string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", errores.Envolver(errores.ProveedorNoDisponible, err)
	}
	if n := len(telefonoE164); n < 9 || n > 16 || telefonoE164[0] != '+' || strings.Trim(telefonoE164[1:], "0123456789") != "" {
		return "", errores.Envolver(errores.ValidacionFallida, ErrTelefono)
	}
	if texto == "" || utf8.RuneCountInString(texto) > MaxTexto || strings.ContainsFunc(texto, func(r rune) bool { return r < 0x20 || r == '<' || r == '>' }) {
		return "", errores.Envolver(errores.ValidacionFallida, ErrTexto)
	}
	return "https://wa.me/" + telefonoE164[1:] + "?text=" + url.PathEscape(texto), nil
}

var _ proveedores.Mensajeria = Mensajeria{}
