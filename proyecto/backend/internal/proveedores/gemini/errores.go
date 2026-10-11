package gemini

import (
	"errors"
	"fmt"
)

// Errores tipados del adaptador. Se distinguen con errors.Is. Ninguno lleva el
// cuerpo crudo de la respuesta del proveedor (puede contener datos del
// cliente) ni la clave: solo códigos de estado y enums del propio proveedor.
var (
	ErrClaveAusente       = errors.New("gemini: falta la clave de API")
	ErrPedidoInvalido     = errors.New("gemini: pedido inválido")
	ErrCredencial         = errors.New("gemini: el proveedor rechazó la credencial")
	ErrCuotaAgotada       = errors.New("gemini: cuota agotada o límite de uso")
	ErrBloqueadoSeguridad = errors.New("gemini: contenido bloqueado por la seguridad del proveedor")
	ErrRespuestaNoJSON    = errors.New("gemini: la respuesta no es un objeto JSON utilizable")
	ErrRespuestaGrande    = errors.New("gemini: respuesta más grande que el límite")
	ErrTimeout            = errors.New("gemini: tiempo límite agotado")
	ErrNoDisponible       = errors.New("gemini: proveedor no disponible (error transitorio)")
	ErrSolicitudRechazada = errors.New("gemini: el proveedor rechazó la solicitud")
)

// Error agrega contexto seguro a un error tipado.
type Error struct {
	Tipo     error  // uno de los Err* de arriba
	Causa    error  // opcional (por ejemplo context.DeadlineExceeded)
	Estado   int    // código HTTP si hubo respuesta
	Codigo   string // enum del proveedor (RESOURCE_EXHAUSTED, SAFETY...), solo [A-Z_a-z0-9]
	Intentos int    // intentos realizados
}

func (e *Error) Error() string {
	s := e.Tipo.Error()
	if e.Estado != 0 {
		s += fmt.Sprintf(" (http %d)", e.Estado)
	}
	if e.Codigo != "" {
		s += " [" + e.Codigo + "]"
	}
	if e.Intentos > 1 {
		s += fmt.Sprintf(" tras %d intentos", e.Intentos)
	}
	return s
}

// Unwrap permite errors.Is contra el tipo y contra la causa (context.*).
func (e *Error) Unwrap() []error {
	if e.Causa != nil {
		return []error{e.Tipo, e.Causa}
	}
	return []error{e.Tipo}
}

// codigoSeguro deja pasar solo enums del proveedor (nada de texto libre).
func codigoSeguro(s string) string {
	if len(s) == 0 || len(s) > 40 {
		return ""
	}
	for _, r := range s {
		if !(r == '_' || r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9') {
			return ""
		}
	}
	return s
}
