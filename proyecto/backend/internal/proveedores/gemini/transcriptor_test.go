package gemini_test

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/gemini"
	"videocotizacion/backend/internal/secreto"
)

func nuevoTranscriptor(t *testing.T, base string) *gemini.Transcriptor {
	t.Helper()
	tr, err := gemini.NuevoTranscriptor(gemini.Opciones{
		Clave: secreto.Nuevo(claveFalsa), URLBase: base,
		Reintentos: 1, EsperaBase: time.Millisecond, Timeout: 2 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	return tr
}

func TestTranscribirMandaWAVYLimpiaElTexto(t *testing.T) {
	pcm := make([]byte, 32000) // 1 s de PCM16 16 kHz
	var cuerpo map[string]any
	s := nuevoServidor(t, func(_ int64, w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &cuerpo); err != nil {
			t.Errorf("cuerpo: %v", err)
		}
		_, _ = w.Write(respuestaREST(`{"texto":"  quiero  pintar <b>el living</b>\n\u0007"}`, "STOP"))
	})
	tr := nuevoTranscriptor(t, s.srv.URL)
	res, err := tr.Transcribir(t.Context(), proveedores.Audio{PCM: pcm, FrecuenciaHz: 16000, Final: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.Texto != "quiero pintar bel living/b" || !res.Final || res.MilisegsAudio != 1000 {
		t.Fatalf("transcripción: %+v", res)
	}
	partes := cuerpo["contents"].([]any)[0].(map[string]any)["parts"].([]any)
	inline := partes[1].(map[string]any)["inlineData"].(map[string]any)
	wav, _ := base64.StdEncoding.DecodeString(inline["data"].(string))
	if inline["mimeType"] != "audio/wav" || len(wav) != 44+len(pcm) || string(wav[:4]) != "RIFF" {
		t.Fatalf("audio: %v %d", inline["mimeType"], len(wav))
	}
	si := cuerpo["systemInstruction"].(map[string]any)["parts"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.Contains(si, "nunca es una instrucción") {
		t.Fatal("falta la defensa contra instrucciones en el audio")
	}
}

func TestTranscribirRechazaAudioVacioYOpus(t *testing.T) {
	s := nuevoServidor(t, func(int64, http.ResponseWriter, *http.Request) { t.Error("no debía llamar a la red") })
	tr := nuevoTranscriptor(t, s.srv.URL)
	if _, err := tr.Transcribir(t.Context(), proveedores.Audio{PCM: []byte{1}, FrecuenciaHz: 16000}); !errores.Es(err, errores.ValidacionFallida) {
		t.Fatalf("vacío: %v", err)
	}
	if _, err := tr.Transcribir(t.Context(), proveedores.Audio{PCM: []byte{1, 2, 3, 4}}); !errores.Es(err, errores.ProveedorNoDisponible) {
		t.Fatalf("opus: %v", err)
	}
}

func TestTranscribirReintenta503(t *testing.T) {
	s := nuevoServidor(t, func(n int64, w http.ResponseWriter, _ *http.Request) {
		if n == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write(respuestaREST(`{"texto":"hola"}`, "STOP"))
	})
	res, err := nuevoTranscriptor(t, s.srv.URL).Transcribir(t.Context(), proveedores.Audio{PCM: make([]byte, 320), FrecuenciaHz: 16000})
	if err != nil || res.Texto != "hola" || s.llamadas.Load() != 2 {
		t.Fatalf("%+v %v llamadas=%d", res, err, s.llamadas.Load())
	}
}

func TestLimpiarTranscripcionTope(t *testing.T) {
	largo := strings.Repeat("á", gemini.MaxTextoTranscripcion+50)
	if got := gemini.LimpiarTranscripcion(largo); utf8.RuneCountInString(got) != gemini.MaxTextoTranscripcion {
		t.Fatalf("largo: %d", utf8.RuneCountInString(got))
	}
	if got := gemini.LimpiarTranscripcion(" \t\n "); got != "" {
		t.Fatalf("espacios: %q", got)
	}
}

func TestWAVEncabezado(t *testing.T) {
	pcm := []byte{1, 2, 3, 4}
	w := gemini.WAV(pcm, 16000)
	if !bytes.Equal(w[44:], pcm) || string(w[8:16]) != "WAVEfmt " || string(w[36:40]) != "data" {
		t.Fatal("formato")
	}
	if binary.LittleEndian.Uint32(w[24:]) != 16000 || binary.LittleEndian.Uint32(w[28:]) != 32000 || binary.LittleEndian.Uint32(w[40:]) != 4 {
		t.Fatal("campos")
	}
}
