package arranque

import (
	"context"
	"errors"
	"strings"
	"testing"

	"videocotizacion/backend/internal/config"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/gemini"
	"videocotizacion/backend/internal/secreto"
)

func TestGeminiSeCableaSoloSiSePide(t *testing.T) {
	c := cfgDesarrollo()
	prov, err := construirProveedores(c, silencioso())
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := prov.Extractor.(proveedores.Falso); !ok {
		t.Fatal("sin PROVEEDOR_LLM=gemini debe seguir el falso")
	}
	c.Proveedores.LLM = "gemini"
	c.Gemini = config.Gemini{Clave: secreto.Nuevo("k"), Modelo: "gemini-x"}
	prov, err = construirProveedores(c, silencioso())
	if err != nil {
		t.Fatal(err)
	}
	g, ok := prov.Extractor.(*gemini.Extractor)
	if !ok || g.Modelo() != "gemini-x" {
		t.Fatalf("extractor: %T", prov.Extractor)
	}
	if got := prov.Falsos(); len(got) != 3 {
		t.Fatalf("el LLM no debe figurar como falso: %v", got)
	}
}

func TestGeminiSinClaveNoArranca(t *testing.T) {
	c := cfgDesarrollo()
	c.Proveedores.LLM = "gemini"
	if _, err := construirProveedores(c, silencioso()); !errors.Is(err, gemini.ErrClaveAusente) {
		t.Fatalf("%v", err)
	}
}

// La regla de producción no se relaja: con LLM real pero los otros puertos falsos, se niega.
func TestProduccionConGeminiSigueRechazandoFalsos(t *testing.T) {
	c := cfgDesarrollo()
	c.Entorno = config.Produccion
	c.Proveedores.LLM = "gemini"
	c.Gemini = config.Gemini{Clave: secreto.Nuevo("k")}
	_, err := Construir(context.Background(), c, silencioso())
	if !errors.Is(err, ErrProduccionInsegura) || strings.Contains(err.Error(), "PROVEEDOR_LLM") || !strings.Contains(err.Error(), "PROVEEDOR_STT") {
		t.Fatalf("%v", err)
	}
}
