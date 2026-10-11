package prompts

import (
	"crypto/sha256"
	"fmt"
	"strings"

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
	return fmt.Sprintf("conducta_%s@%s", o, hashCanonico(cuerpo)), nil
}

// hashCanonico es sha256[0:12] del markdown con fin de línea CRLF. Las anclas
// publicadas en el contrato (openapi, vectores, T41) se calcularon en Windows
// con checkout CRLF; fijar CRLF como forma canónica las conserva y hace que la
// referencia no dependa del sistema operativo ni de core.autocrlf.
// Misma regla en contracts/fuente/prompts.mjs.
func hashCanonico(cuerpo string) string {
	lf := strings.ReplaceAll(cuerpo, "\r\n", "\n")
	sum := sha256.Sum256([]byte(strings.ReplaceAll(lf, "\n", "\r\n")))
	return fmt.Sprintf("%x", sum[:6])
}
