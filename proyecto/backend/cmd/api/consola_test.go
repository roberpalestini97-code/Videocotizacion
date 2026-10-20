package main

import (
	"bytes"
	"log/slog"
	"strings"
	"sync"
	"testing"

	"videocotizacion/backend/internal/secreto"
)

func TestConsolaMuestraCadaDatoYRedactaSecretos(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(&consola{mu: &sync.Mutex{}, w: &buf, nivel: slog.LevelDebug})
	clave := "clave-que-no-puede-aparecer"
	log.Info("turno",
		"sesion", "ses_demo",
		"turno", 2,
		"accion", "preguntar",
		"config", secreto.Nuevo(clave),
	)
	s := buf.String()
	for _, quiero := range []string{"INFO", "turno", "sesion=ses_demo", "turno=2", "accion=preguntar", secreto.Redactado} {
		if !strings.Contains(s, quiero) {
			t.Errorf("falta %q en\n%s", quiero, s)
		}
	}
	if strings.Contains(s, clave) {
		t.Fatalf("el secreto salió en el registro:\n%s", s)
	}
	if strings.Count(s, "\n") < 5 {
		t.Fatalf("se esperaba un dato por línea:\n%s", s)
	}
}

func TestProduccionSigueEnJSON(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(nuevoRegistro(&buf, slog.LevelInfo, "produccion"))
	log.Info("api escuchando", "direccion", "127.0.0.1:8080")
	s := buf.String()
	if !strings.Contains(s, `"msg":"api escuchando"`) || strings.Contains(s, "\n         ") {
		t.Fatalf("producción: %s", s)
	}
}
