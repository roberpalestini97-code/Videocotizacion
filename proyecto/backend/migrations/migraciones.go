// Package migrations embebe las migraciones SQL versionadas para que `api
// migrar` no dependa de archivos sueltos en el servidor.
package migrations

import "embed"

// Archivos contiene NNNN_nombre.sql (se aplican en orden) y
// NNNN_nombre.revertir.sql (reversión manual, el migrador las ignora).
//
//go:embed *.sql
var Archivos embed.FS
