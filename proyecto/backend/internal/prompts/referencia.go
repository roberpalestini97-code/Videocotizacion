package prompts

import (
	"crypto/sha256"
	"fmt"

	"videocotizacion/backend/internal/dominio"
)

// EsquemaReferenciaPanel coincide con SesionDetalle.versiones.esquema_salida.
const EsquemaReferenciaPanel = "1.0.0"

// ReferenciaContrato devuelve conducta_{oficio}@{sha256 del markdown}[0:12],
// formato de SesionDetalle.versiones.prompt (T41).
func ReferenciaContrato(o dominio.Oficio) (string, error) {
	cuerpo, err := CuerpoPorOficio(o)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(cuerpo))
	return fmt.Sprintf("conducta_%s@%x", o, sum[:6]), nil
}
