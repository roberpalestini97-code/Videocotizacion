package config

import (
	"bufio"
	"os"
	"strings"
)

// CargarArchivoEnv lee un archivo .env y define variables que todavía no
// están en el entorno. No pisa lo que ya vino del proceso. Si el archivo no
// existe, no hace nada. No se usa en producción: un ENTORNO=produccion ya
// definido hace que se ignore el archivo.
func CargarArchivoEnv(ruta string) error {
	if strings.TrimSpace(os.Getenv("ENTORNO")) == string(Produccion) {
		return nil
	}
	f, err := os.Open(ruta)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		linea := strings.TrimSpace(sc.Text())
		if linea == "" || strings.HasPrefix(linea, "#") {
			continue
		}
		linea = strings.TrimPrefix(linea, "export ")
		clave, valor, ok := strings.Cut(linea, "=")
		if !ok {
			continue
		}
		clave = strings.TrimSpace(clave)
		if clave == "" || os.Getenv(clave) != "" {
			continue
		}
		valor = strings.TrimSpace(valor)
		if len(valor) >= 2 {
			if (valor[0] == '"' && valor[len(valor)-1] == '"') || (valor[0] == '\'' && valor[len(valor)-1] == '\'') {
				valor = valor[1 : len(valor)-1]
			}
		}
		if err := os.Setenv(clave, valor); err != nil {
			return err
		}
	}
	return sc.Err()
}
