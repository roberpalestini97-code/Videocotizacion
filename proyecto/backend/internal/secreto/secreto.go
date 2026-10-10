// Package secreto define el tipo Secreto, que nunca se imprime (corrección H1
// de T20, ítem G04). El valor queda encerrado en una clausura: aunque un
// Secreto esté en un campo no exportado de un struct y fmt lo recorra por
// reflexión (sin pasar por Format), una func solo se imprime como dirección.
// Con un puntero a struct no alcanza: fmt lo desreferencia con verbos como %s.
package secreto

import (
	"fmt"
	"io"
	"log/slog"
)

// Redactado es lo único que se imprime en lugar del valor.
const Redactado = "[REDACTADO]"

// Secreto envuelve credenciales, DSN con contraseña, claves de proveedores.
type Secreto struct{ f func() string }

// Nuevo crea un Secreto.
func Nuevo(s string) Secreto {
	if s == "" {
		return Secreto{}
	}
	return Secreto{f: func() string { return s }}
}

// Revelar devuelve el valor real. Usarlo solo en el punto exacto donde se
// entrega al cliente de la base o del proveedor.
func (s Secreto) Revelar() string {
	if s.f == nil {
		return ""
	}
	return s.f()
}

// Vacio informa si no hay valor.
func (s Secreto) Vacio() bool { return s.f == nil }

func (s Secreto) String() string   { return Redactado }
func (s Secreto) GoString() string { return Redactado }

// Format cubre todos los verbos (%v %+v %#v %s %q %x ...).
func (s Secreto) Format(f fmt.State, _ rune) { _, _ = io.WriteString(f, Redactado) }

// MarshalJSON nunca serializa el valor.
func (s Secreto) MarshalJSON() ([]byte, error) { return []byte(`"` + Redactado + `"`), nil }

// MarshalText nunca serializa el valor (encoding/xml, yaml, etc.).
func (s Secreto) MarshalText() ([]byte, error) { return []byte(Redactado), nil }

// LogValue redacta en log/slog.
func (s Secreto) LogValue() slog.Value { return slog.StringValue(Redactado) }

var (
	_ fmt.Stringer   = Secreto{}
	_ fmt.GoStringer = Secreto{}
	_ fmt.Formatter  = Secreto{}
	_ slog.LogValuer = Secreto{}
)
