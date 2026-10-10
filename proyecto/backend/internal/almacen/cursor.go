package almacen

import (
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// CodificarCursor arma el cursor opaco de la paginación por clave
// (creada_en, sesion_id). No lleva datos personales ni el tenant.
func CodificarCursor(creadaEn time.Time, sesionID string) string {
	crudo := strconv.FormatInt(dominio.Instante(creadaEn).UnixMicro(), 10) + "|" + sesionID
	return base64.RawURLEncoding.EncodeToString([]byte(crudo))
}

// DecodificarCursor valida y abre un cursor. "" = primera página.
func DecodificarCursor(c string) (creadaEn time.Time, sesionID string, err error) {
	if c == "" {
		return time.Time{}, "", nil
	}
	invalido := errores.Envolver(errores.ValidacionFallida, errors.New("/despues: cursor inválido"))
	if len(c) > 128 {
		return time.Time{}, "", invalido
	}
	b, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return time.Time{}, "", invalido
	}
	micro, id, ok := strings.Cut(string(b), "|")
	if !ok || !dominio.IDValido(id, dominio.PrefijoSesion) {
		return time.Time{}, "", invalido
	}
	n, err := strconv.ParseInt(micro, 10, 64)
	if err != nil || n < 0 {
		return time.Time{}, "", invalido
	}
	return time.UnixMicro(n).UTC(), id, nil
}
