package cotizador

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"videocotizacion/backend/internal/errores"
)

// Los 12 ejemplos de conductas validan; los 20 negativos fallan con la
// validación completa (la de T25), no solo con la decodificación estricta.
func TestValidarSalidaLLMEjemplosYNegativos(t *testing.T) {
	ejemplos, _ := filepath.Glob(filepath.Join("..", "..", "..", "conductas", "ejemplos", "*.json"))
	negativos, _ := filepath.Glob(filepath.Join("..", "..", "..", "conductas", "negativos", "*.json"))
	if len(ejemplos) != 12 || len(negativos) != 20 {
		t.Fatalf("ejemplos %d negativos %d", len(ejemplos), len(negativos))
	}
	for _, f := range ejemplos {
		if _, err := ValidarSalidaLLM(leerConducta(t, "ejemplos", filepath.Base(f))); err != nil {
			t.Errorf("%s: %v", filepath.Base(f), err)
		}
	}
	for _, f := range negativos {
		_, err := ValidarSalidaLLM(leerConducta(t, "negativos", filepath.Base(f)))
		if !errores.Es(err, errores.ValidacionFallida) {
			t.Errorf("%s: se esperaba validacion_fallida, hubo %v", filepath.Base(f), err)
		}
	}
}

// Los negativos de montos en respuesta_hablada fallan SOLO por el filtro:
// el orquestador cambia el texto por plantilla y conserva los datos.
func TestValidarSalidaLLMMontoSoloEnHablada(t *testing.T) {
	for _, f := range []string{"04-respuesta-con-signo-pesos.json", "05-respuesta-con-pesos-en-letras.json", "06-respuesta-con-cifra.json", "18-respuesta-con-porcentaje-de-ajuste.json"} {
		s, err := ValidarSalidaLLM(leerConducta(t, "negativos", f))
		if !errors.Is(err, ErrMontoEnRespuesta) || s.Version != "1.0" {
			t.Errorf("%s: %v", f, err)
		}
	}
}

func TestValidarSalidaLLMRequeridosYTipos(t *testing.T) {
	base := string(leerConducta(t, "ejemplos", "01-pintura-interior-pide-medidas.json"))
	casos := map[string]string{
		"sin respuesta":      strings.Replace(base, `"respuesta_hablada"`, `"x_respuesta"`, 1),
		"faltantes ausentes": strings.Replace(base, `"faltantes"`, `"faltantesX"`, 1),
		"zona null":          strings.Replace(base, `"zona": {`, `"zona": null, "z": {`, 1),
		"accion inventada":   strings.Replace(base, `"accion": "preguntar"`, `"accion": "regalar"`, 1),
		"faltante repetido": strings.Replace(base, `"estado_superficie"
  ],`, `"medidas"
  ],`, 1),
		"cantidad como string": strings.Replace(base, `"medidas": []`, `"medidas": [{"concepto":"living","cantidad":"12","unidad":"m2","origen":"estimado"}]`, 1),
		"altura excesiva":      strings.Replace(base, `"metros_max": 2.6`, `"metros_max": 61`, 1),
		"monto como campo":     strings.Replace(base, `"version": "1.0",`, `"version": "1.0", "monto": 5,`, 1),
	}
	for nombre, raw := range casos {
		if raw == base {
			t.Fatalf("%s: el reemplazo no aplicó", nombre)
		}
		if _, err := ValidarSalidaLLM([]byte(raw)); !errores.Es(err, errores.ValidacionFallida) || errors.Is(err, ErrMontoEnRespuesta) {
			t.Errorf("%s: %v", nombre, err)
		}
	}
}
