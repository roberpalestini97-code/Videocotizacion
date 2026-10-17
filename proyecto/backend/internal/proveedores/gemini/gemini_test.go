package gemini_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/gemini"
	"videocotizacion/backend/internal/secreto"
)

const claveFalsa = "AIzaSy-CLAVE-DE-PRUEBA-NO-REAL-0123456789"

func esquema(t *testing.T) map[string]any {
	t.Helper()
	raw, err := prompts.EsquemaSalidaJSON()
	if err != nil {
		t.Fatal(err)
	}
	s, err := gemini.EsquemaDesdeJSONSchema(raw)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func ejemplo(t *testing.T, nombre string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "conductas", "ejemplos", nombre))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// respuestaREST imita GenerateContentResponse con el texto dado.
func respuestaREST(texto, fin string) []byte {
	b, _ := json.Marshal(map[string]any{
		"candidates": []any{map[string]any{
			"content":      map[string]any{"role": "model", "parts": []any{map[string]any{"text": texto}}},
			"finishReason": fin,
		}},
		"usageMetadata": map[string]any{"promptTokenCount": 120, "candidatesTokenCount": 80, "thoughtsTokenCount": 5, "totalTokenCount": 205},
	})
	return b
}

type servidorFalso struct {
	srv      *httptest.Server
	llamadas atomic.Int64
}

func nuevoServidor(t *testing.T, h func(n int64, w http.ResponseWriter, r *http.Request)) *servidorFalso {
	t.Helper()
	s := &servidorFalso{}
	s.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h(s.llamadas.Add(1), w, r)
	}))
	t.Cleanup(s.srv.Close)
	return s
}

func nuevoExtractor(t *testing.T, base string, reintentos int) *gemini.Extractor {
	t.Helper()
	e, err := gemini.Nuevo(gemini.Opciones{
		Clave: secreto.Nuevo(claveFalsa), URLBase: base, Esquema: esquema(t),
		Reintentos: reintentos, EsperaBase: time.Millisecond, Timeout: 2 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func pedidoDePrueba() proveedores.PedidoExtraccion {
	return proveedores.PedidoExtraccion{
		Transcripcion: "Quiero pintar el living, son 20 metros", CuerpoPrompt: "Sos el asistente de pintura.",
		VersionPrompt: "conducta_pintura@x", VersionEsquema: "1.0",
		Fotogramas: [][]byte{{0xFF, 0xD8, 0xFF, 0xE0, 1, 2}, []byte("no es jpeg")},
	}
}

func TestExtraerExitoArmaElPedidoREST(t *testing.T) {
	salida := ejemplo(t, "01-pintura-interior-pide-medidas.json")
	s := nuevoServidor(t, func(_ int64, w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/models/"+gemini.ModeloPorDefecto+":generateContent" || r.URL.RawQuery != "" {
			t.Errorf("ruta: %s %s?%s", r.Method, r.URL.Path, r.URL.RawQuery)
		}
		if r.Header.Get("x-goog-api-key") != claveFalsa || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("encabezados: %v", r.Header)
		}
		var p struct {
			SystemInstruction struct{ Parts []struct{ Text string } }
			Contents          []struct {
				Role  string
				Parts []struct {
					Text       string
					InlineData *struct{ MimeType, Data string }
				}
			}
			GenerationConfig struct {
				ResponseMimeType   string
				ResponseJsonSchema map[string]any
				ResponseSchema     map[string]any
				CandidateCount     int
				ThinkingConfig     *struct{ ThinkingLevel string }
			}
		}
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			t.Error(err)
		}
		if p.SystemInstruction.Parts[0].Text != "Sos el asistente de pintura." || p.GenerationConfig.ResponseMimeType != "application/json" ||
			p.GenerationConfig.ResponseJsonSchema["type"] != "object" || p.GenerationConfig.ResponseSchema != nil || p.GenerationConfig.CandidateCount != 1 ||
			p.GenerationConfig.ThinkingConfig == nil || p.GenerationConfig.ThinkingConfig.ThinkingLevel != "minimal" {
			t.Errorf("pedido: %+v", p)
		}
		partes := p.Contents[0].Parts
		if p.Contents[0].Role != "user" || len(partes) != 1 || !strings.Contains(partes[0].Text, "son 20 metros") {
			t.Errorf("contenido: %+v", p.Contents)
		}
		if partes[0].InlineData != nil {
			t.Errorf("no se adjuntan fotogramas mientras adjuntarFotogramas=false: %+v", partes[0])
		}
		_, _ = w.Write(respuestaREST(salida, "STOP"))
	})
	e := nuevoExtractor(t, s.srv.URL, 0)
	res, err := e.Extraer(context.Background(), pedidoDePrueba())
	if err != nil {
		t.Fatal(err)
	}
	if res.TokensEntrada != 120 || res.TokensSalida != 85 {
		t.Fatalf("tokens: %+v", res)
	}
	if ent, sal, n := e.Consumo(); ent != 120 || sal != 85 || n != 1 {
		t.Fatalf("consumo: %d %d %d", ent, sal, n)
	}
	if _, err := cotizador.ValidarSalidaLLM(res.JSON); err != nil {
		t.Fatalf("la salida no re-valida: %v", err)
	}
}

func TestExtraerReintenta429Y5xx(t *testing.T) {
	salida := ejemplo(t, "01-pintura-interior-pide-medidas.json")
	s := nuevoServidor(t, func(n int64, w http.ResponseWriter, _ *http.Request) {
		switch n {
		case 1:
			w.WriteHeader(http.StatusTooManyRequests)
		case 2:
			w.WriteHeader(http.StatusServiceUnavailable)
		default:
			_, _ = w.Write(respuestaREST(salida, "STOP"))
		}
	})
	if _, err := nuevoExtractor(t, s.srv.URL, 2).Extraer(context.Background(), pedidoDePrueba()); err != nil {
		t.Fatal(err)
	}
	if s.llamadas.Load() != 3 {
		t.Fatalf("llamadas: %d", s.llamadas.Load())
	}
}

func TestExtraerErroresHTTP(t *testing.T) {
	casos := []struct {
		nombre   string
		estado   int
		llamadas int64
		cuota    bool
	}{
		{"429 persistente", http.StatusTooManyRequests, 3, true},
		{"500 persistente", http.StatusInternalServerError, 3, false},
		{"400 no se reintenta", http.StatusBadRequest, 1, false},
		{"403 no se reintenta", http.StatusForbidden, 1, false},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			s := nuevoServidor(t, func(_ int64, w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(c.estado)
				_, _ = io.WriteString(w, `{"error":{"message":"detalle interno `+claveFalsa+`"}}`)
			})
			_, err := nuevoExtractor(t, s.srv.URL, 2).Extraer(context.Background(), pedidoDePrueba())
			if !errores.Es(err, errores.ProveedorNoDisponible) || errors.Is(err, proveedores.ErrCuotaProveedor) != c.cuota {
				t.Fatalf("error: %v", err)
			}
			if s.llamadas.Load() != c.llamadas {
				t.Fatalf("llamadas: %d", s.llamadas.Load())
			}
			if d := err.(*errores.Error).Detalle(); strings.Contains(d, "detalle interno") {
				t.Fatalf("el error filtra el cuerpo: %s", d)
			}
		})
	}
}

func TestExtraerRespuestasInvalidas(t *testing.T) {
	salida := ejemplo(t, "01-pintura-interior-pide-medidas.json")
	casos := map[string]struct {
		cuerpo []byte
		causa  error
	}{
		"json inválido del modelo": {respuestaREST("esto no es JSON", "STOP"), gemini.ErrRespuestaInvalida},
		"cortada por tokens":       {respuestaREST(salida[:120], "MAX_TOKENS"), gemini.ErrCortada},
		"cuerpo HTTP cortado":      {[]byte(`{"candidates":[{"content":{"parts":[{"text":"{`), gemini.ErrRespuestaInvalida},
		"bloqueada por seguridad":  {[]byte(`{"promptFeedback":{"blockReason":"SAFETY"}}`), gemini.ErrBloqueada},
		"sin candidatos":           {[]byte(`{"candidates":[]}`), gemini.ErrRespuestaInvalida},
		"respuesta enorme":         {bytes.Repeat([]byte(" "), gemini.MaxRespuestaBytes+10), gemini.ErrRespuestaGrande},
	}
	for nombre, c := range casos {
		t.Run(nombre, func(t *testing.T) {
			s := nuevoServidor(t, func(_ int64, w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(c.cuerpo) })
			_, err := nuevoExtractor(t, s.srv.URL, 2).Extraer(context.Background(), pedidoDePrueba())
			if !errores.Es(err, errores.ValidacionFallida) || !errors.Is(err, c.causa) {
				t.Fatalf("error: %v", err)
			}
			if s.llamadas.Load() != 1 {
				t.Fatalf("una respuesta inválida no se reintenta acá (lo hace el orquestador): %d", s.llamadas.Load())
			}
		})
	}
}

// El modelo cuela un monto: el adaptador lo entrega (es JSON), pero la
// re-validación de Go lo rechaza siempre.
func TestMontoInyectadoLoRechazaLaValidacionDeGo(t *testing.T) {
	conMonto := strings.Replace(ejemplo(t, "02-fachada-altura-emitir.json"), `"version": "1.0",`, `"version": "1.0", "precio_total": 1,`, 1)
	s := nuevoServidor(t, func(_ int64, w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(respuestaREST(conMonto, "STOP")) })
	res, err := nuevoExtractor(t, s.srv.URL, 0).Extraer(context.Background(), pedidoDePrueba())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := cotizador.ValidarSalidaLLM(res.JSON); !errores.Es(err, errores.ValidacionFallida) {
		t.Fatalf("monto aceptado: %v", err)
	}
}

func TestExtraerCancelacion(t *testing.T) {
	bloqueo := make(chan struct{})
	s := nuevoServidor(t, func(_ int64, _ http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body) // sin leer el cuerpo el servidor no detecta el corte
		select {
		case <-r.Context().Done():
		case <-bloqueo:
		}
	})
	t.Cleanup(func() { close(bloqueo) }) // corre antes que srv.Close (LIFO)
	ctx, cancelar := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancelar()
	inicio := time.Now()
	_, err := nuevoExtractor(t, s.srv.URL, 2).Extraer(ctx, pedidoDePrueba())
	if !errores.Es(err, errores.ProveedorNoDisponible) || time.Since(inicio) > time.Second {
		t.Fatalf("cancelación: %v en %s", err, time.Since(inicio))
	}
	if s.llamadas.Load() != 1 {
		t.Fatalf("una cancelación no se reintenta: %d", s.llamadas.Load())
	}
}

func TestExtraerReintentaTimeoutDeIntento(t *testing.T) {
	salida := ejemplo(t, "01-pintura-interior-pide-medidas.json")
	s := nuevoServidor(t, func(n int64, w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		if n < 3 {
			<-r.Context().Done()
			return
		}
		_, _ = w.Write(respuestaREST(salida, "STOP"))
	})
	e, err := gemini.Nuevo(gemini.Opciones{
		Clave: secreto.Nuevo(claveFalsa), URLBase: s.srv.URL, Esquema: esquema(t),
		Reintentos: 2, EsperaBase: time.Millisecond, Timeout: 80 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelar()
	if _, err := e.Extraer(ctx, pedidoDePrueba()); err != nil {
		t.Fatal(err)
	}
	if s.llamadas.Load() != 3 {
		t.Fatalf("llamadas: %d", s.llamadas.Load())
	}
}

func TestNuevoValidaOpciones(t *testing.T) {
	esq := esquema(t)
	casos := map[string]gemini.Opciones{
		"sin clave":         {Esquema: esq},
		"modelo raro":       {Clave: secreto.Nuevo(claveFalsa), Esquema: esq, Modelo: "../../x?key=1"},
		"http no loopback":  {Clave: secreto.Nuevo(claveFalsa), Esquema: esq, URLBase: "http://generativelanguage.googleapis.com/v1beta"},
		"clave en la URL":   {Clave: secreto.Nuevo(claveFalsa), Esquema: esq, URLBase: "https://x.example/v1beta?key=" + claveFalsa},
		"sin esquema":       {Clave: secreto.Nuevo(claveFalsa)},
		"usuario en la URL": {Clave: secreto.Nuevo(claveFalsa), Esquema: esq, URLBase: "https://u:p@x.example/v1beta"},
	}
	for nombre, op := range casos {
		_, err := gemini.Nuevo(op)
		if err == nil {
			t.Errorf("%s: se esperaba error", nombre)
			continue
		}
		if strings.Contains(err.Error(), claveFalsa) {
			t.Errorf("%s: el error muestra la clave", nombre)
		}
	}
}

// Contrato de seguridad: la clave no aparece en ningún error, detalle,
// formato %v/%+v/%#v ni log de ninguno de los caminos de falla.
func TestLaClaveNoApareceEnErroresNiLogs(t *testing.T) {
	var log bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&log, nil))
	respuestas := []func(w http.ResponseWriter){
		func(w http.ResponseWriter) {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = io.WriteString(w, claveFalsa)
		},
		func(w http.ResponseWriter) {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = io.WriteString(w, claveFalsa)
		},
		func(w http.ResponseWriter) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, claveFalsa)
		},
		func(w http.ResponseWriter) { _, _ = w.Write(respuestaREST(claveFalsa, "STOP")) },
		func(w http.ResponseWriter) { _, _ = io.WriteString(w, claveFalsa) },
	}
	for i, responder := range respuestas {
		s := nuevoServidor(t, func(_ int64, w http.ResponseWriter, _ *http.Request) { responder(w) })
		e := nuevoExtractor(t, s.srv.URL, 1)
		_, err := e.Extraer(context.Background(), pedidoDePrueba())
		if err == nil {
			t.Fatalf("caso %d: se esperaba error", i)
		}
		logger.Error("turno", "err", err, "detalle", err.(*errores.Error).Detalle(), "extractor", e)
		textos := []string{err.Error(), err.(*errores.Error).Detalle(), fmt.Sprintf("%v %+v %#v", err, e, e), log.String(),
			errores.Buscar(errores.CodigoDe(err)).Mensaje}
		for _, txt := range textos {
			if strings.Contains(txt, claveFalsa) {
				t.Fatalf("caso %d: la clave aparece en %q", i, txt)
			}
		}
	}
	// Servidor caído: el error de transporte tampoco lleva la URL ni la clave.
	s := nuevoServidor(t, func(int64, http.ResponseWriter, *http.Request) {})
	base := s.srv.URL
	s.srv.Close()
	_, err := nuevoExtractor(t, base, 1).Extraer(context.Background(), pedidoDePrueba())
	if !errores.Es(err, errores.ProveedorNoDisponible) || strings.Contains(err.(*errores.Error).Detalle(), claveFalsa) || strings.Contains(err.(*errores.Error).Detalle(), base) {
		t.Fatalf("transporte: %v", err)
	}
}

func TestEsquemaDerivadoDelDeConductas(t *testing.T) {
	esq := esquema(t)
	raw, _ := json.Marshal(esq)
	for _, prohibido := range []string{`"not"`, `"pattern"`, `"if"`, `"then"`, `"uniqueItems"`, `"exclusiveMinimum"`, `"const"`, `"$schema"`, `"nullable"`, `"default"`, `"minLength"`, `"maxLength"`, `"precio`, `"monto`, `"descuento`} {
		if bytes.Contains(raw, []byte(prohibido)) {
			t.Errorf("el responseJsonSchema contiene %s", prohibido)
		}
	}
	if esq["additionalProperties"] != false || esq["type"] != "object" {
		t.Fatalf("raíz: %+v", esq["type"])
	}
	props := esq["properties"].(map[string]any)
	if len(props) != 15 || len(esq["required"].([]string)) != 13 {
		t.Fatalf("propiedades %d requeridas %d", len(props), len(esq["required"].([]string)))
	}
	alt := props["altura"].(map[string]any)["properties"].(map[string]any)["metros_max"].(map[string]any)
	anyOf, _ := alt["anyOf"].([]any)
	if len(anyOf) != 2 || anyOf[0].(map[string]any)["type"] != "number" || anyOf[1].(map[string]any)["type"] != "null" {
		t.Fatalf("metros_max: %+v", alt)
	}
	ver := props["version"].(map[string]any)
	if ver["type"] != "string" || fmt.Sprint(ver["enum"]) != "[1.0]" {
		t.Fatalf("version: %+v", ver)
	}
	acc := props["siguiente_paso"].(map[string]any)["properties"].(map[string]any)["accion"].(map[string]any)
	if len(acc["enum"].([]string)) != 8 {
		t.Fatalf("accion: %+v", acc)
	}
	tc := props["tipo_cliente"].(map[string]any)
	if _, ok := tc["enum"]; ok || tc["type"] != "string" || !strings.Contains(fmt.Sprint(tc["description"]), "particular_primera_vez") {
		t.Fatalf("tipo_cliente tiene que ir como texto, el enum no entra en el tope de Gemini: %+v", tc)
	}
	of := props["oficio"].(map[string]any)
	if _, ok := of["enum"]; ok || !strings.Contains(fmt.Sprint(of["description"]), "pintura") {
		t.Fatalf("oficio aliviado: %+v", of)
	}
	tr := props["trabajo"].(map[string]any)["properties"].(map[string]any)["tipo"].(map[string]any)
	if _, ok := tr["enum"]; ok || !strings.Contains(fmt.Sprint(tr["description"]), "pintura_interior") {
		t.Fatalf("trabajo.tipo aliviado: %+v", tr)
	}
}
