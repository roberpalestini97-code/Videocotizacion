package config

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

const claveGemini = "AIzaSy-clave-gemini-NO-DEBE-VERSE"

func baseGemini() map[string]string {
	m := base()
	m["PROVEEDOR_LLM"], m["GEMINI_API_KEY"] = "gemini", claveGemini
	return m
}

func TestGeminiConClaveYModelo(t *testing.T) {
	m := baseGemini()
	m["GEMINI_MODELO"] = "gemini-otro"
	c, err := Cargar(entorno(m), Servir)
	if err != nil {
		t.Fatal(err)
	}
	if c.Proveedores.LLM != ProveedorGemini || c.Gemini.Modelo != "gemini-otro" || c.Gemini.Clave.Revelar() != claveGemini {
		t.Fatalf("config: %+v", c.Gemini)
	}
	var b bytes.Buffer
	slog.New(slog.NewTextHandler(&b, nil)).Info("x", "config", c)
	if strings.Contains(b.String(), claveGemini) || !strings.Contains(b.String(), "gemini-otro") {
		t.Fatalf("log: %s", b.String())
	}
}

func TestGeminiSinClaveFalla(t *testing.T) {
	m := baseGemini()
	delete(m, "GEMINI_API_KEY")
	if _, err := Cargar(entorno(m), Servir); err == nil || !strings.Contains(err.Error(), "GEMINI_API_KEY") {
		t.Fatalf("esperaba falta de clave: %v", err)
	}
	m["GEMINI_API_KEY"] = "   "
	if _, err := Cargar(entorno(m), Servir); err == nil {
		t.Fatal("clave en blanco debía fallar")
	}
}

func TestGeminiSoloParaElLLM(t *testing.T) {
	m := baseGemini()
	m["PROVEEDOR_TTS"] = "gemini"
	if _, err := Cargar(entorno(m), Servir); err == nil {
		t.Fatal("gemini no es un TTS implementado")
	}
}

func TestGeminiURLBaseProhibidaEnProduccion(t *testing.T) {
	m := baseGemini()
	m["GEMINI_URL_BASE"] = "https://proxy.ejemplo"
	if _, err := Cargar(entorno(m), Servir); err != nil {
		t.Fatalf("en desarrollo se admite: %v", err)
	}
	// Producción sigue rechazando los falsos de los otros puertos y además la URL base.
	m["ENTORNO"], m["ALMACEN"] = "produccion", "postgres"
	m["DB_URL"], m["CLAVE_HMAC"] = "postgres://u@h/db?sslmode=verify-full", "x"
	_, err := Cargar(entorno(m), Servir)
	if err == nil || !strings.Contains(err.Error(), "GEMINI_URL_BASE") || !strings.Contains(err.Error(), "PROVEEDOR_STT=falso") {
		t.Fatalf("producción: %v", err)
	}
	if strings.Contains(err.Error(), "PROVEEDOR_LLM=falso") {
		t.Fatalf("el LLM ya es real: %v", err)
	}
}
