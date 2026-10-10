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
	return referenciaDeCuerpo(string(o), cuerpo), nil
}

// referenciaDeCuerpo arma conducta_{slug}@{sha256[0:12]} sobre el markdown con
// fines de línea normalizados a LF: el hash no puede depender de si el archivo
// se sacó en Windows (CRLF) o en Linux/macOS (LF). Misma regla que
// contracts/fuente/prompts.mjs.
func referenciaDeCuerpo(slug, cuerpo string) string {
	normalizado := strings.ReplaceAll(cuerpo, "\r\n", "\n")
	sum := sha256.Sum256([]byte(normalizado))
	return fmt.Sprintf("conducta_%s@%x", slug, sum[:6])
}
