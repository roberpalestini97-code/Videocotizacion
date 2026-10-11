package gemini

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/secreto"
)

const claveTest = "AIzaSy-CLAVE-DE-PRUEBA-NO-DEBE-VERSE"
const textoCliente = "tengo 40 m2 de pared en Cobo, vive Juan Perez 11-5555-1234"

var jpegMin = []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0xFF, 0xD9}

const salidaOK = `{"version":"1.0","oficio":"pintura","respuesta_hablada":"Perfecto, te cuento."}`

func sobre(texto string, prompt, cand, pensado int) string {
	b, _ := json.Marshal(map[string]any{
		"candidates": []any{map[string]any{
			"content":      map[string]any{"role": "model", "parts": []any{map[string]any{"text": texto}}},
			"finishReason": "STOP",
		}},
		"usageMetadata": map[string]any{"promptTokenCount": prompt, "candidatesTokenCount": cand, "thoughtsTokenCount": pensado},
	})
	return string(b)
}

func pedido() proveedores.PedidoExtraccion {
	return proveedores.PedidoExtraccion{
		Transcripcion: textoCliente, Fotogramas: [][]byte{jpegMin}, CuerpoPrompt: "Sos un extractor de datos.",
		VersionPrompt: "p1", VersionEsquema: "1.0",
	}
}

// nuevoExt arma un extractor contra un servidor de prueba, sin esperas reales.
func nuevoExt(t *testing.T, h http.HandlerFunc, mod func(*Opciones)) (*Extractor, *[]time.Duration) {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	var esperas []time.Duration
	o := Opciones{Clave: secreto.Nuevo(claveTest), URLBase: srv.URL, Reintentos: 2, EsperaBase: time.Millisecond,
		dormir: func(ctx context.Context, d time.Duration) error { esperas = append(esperas, d); return ctx.Err() }}
	if mod != nil {
		mod(&o)
	}
	e, err := Nuevo(o)
	if err != nil {
		t.Fatal(err)
	}
	return e, &esperas
}

func TestExito(t *testing.T) {
	var cuerpo map[string]any
	var ruta, metodo string
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		ruta, metodo = r.URL.Path, r.Method
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &cuerpo)
		_, _ = io.WriteString(w, sobre(salidaOK, 120, 30, 10))
	}, nil)
	r, err := e.Extraer(context.Background(), pedido())
	if err != nil {
		t.Fatal(err)
	}
	if string(r.JSON) != salidaOK {
		t.Fatalf("json: %s", r.JSON)
	}
	if r.TokensEntrada != 120 || r.TokensSalida != 40 {
		t.Fatalf("tokens: %+v (salida = candidatos 30 + razonamiento 10)", r)
	}
	if metodo != http.MethodPost || ruta != "/models/"+ModeloPorDefecto+":generateContent" {
		t.Fatalf("ruta %s %s", metodo, ruta)
	}
	// El prompt de sistema es CuerpoPrompt; la transcripción y la imagen van en el turno del usuario.
	si := cuerpo["systemInstruction"].(map[string]any)["parts"].([]any)[0].(map[string]any)["text"]
	if si != "Sos un extractor de datos." {
		t.Fatalf("systemInstruction: %v", si)
	}
	partes := cuerpo["contents"].([]any)[0].(map[string]any)["parts"].([]any)
	if len(partes) != 2 || !strings.Contains(partes[0].(map[string]any)["text"].(string), textoCliente) {
		t.Fatalf("partes: %v", partes)
	}
	img := partes[1].(map[string]any)["inlineData"].(map[string]any)
	if img["mimeType"] != "image/jpeg" || img["data"] != base64.StdEncoding.EncodeToString(jpegMin) {
		t.Fatalf("imagen: %v", img)
	}
	gc := cuerpo["generationConfig"].(map[string]any)
	if gc["responseMimeType"] != "application/json" || gc["responseJsonSchema"] == nil {
		t.Fatalf("generationConfig: %v", gc)
	}
}

func TestPedidoSinIdentificadoresNiMontos(t *testing.T) {
	var crudo string
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		crudo = string(b)
		_, _ = io.WriteString(w, sobre(salidaOK, 1, 1, 0))
	}, nil)
	if _, err := e.Extraer(context.Background(), pedido()); err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	_ = json.Unmarshal([]byte(crudo), &m)
	for k := range m {
		if k != "systemInstruction" && k != "contents" && k != "generationConfig" {
			t.Fatalf("campo inesperado en el pedido: %s", k)
		}
	}
	for _, malo := range []string{"tenant", "cliente_id", "telefono", "codigo_referencia", claveTest, "VersionPrompt", "VersionEsquema"} {
		if strings.Contains(crudo, malo) {
			t.Fatalf("el pedido contiene %q", malo)
		}
	}
	for _, monto := range []string{`"precio"`, `"monto"`, `"importe"`} {
		if strings.Contains(crudo, monto) {
			t.Fatalf("el esquema enviado tiene campo de monto %s", monto)
		}
	}
}

func TestClaveViajaPorEncabezadoYNoPorURL(t *testing.T) {
	var gotHdr, gotURL, gotQuery string
	var cuerpoTieneClave bool
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		gotHdr, gotURL, gotQuery = r.Header.Get("x-goog-api-key"), r.URL.String(), r.URL.RawQuery
		b, _ := io.ReadAll(r.Body)
		cuerpoTieneClave = strings.Contains(string(b), claveTest)
		_, _ = io.WriteString(w, sobre(salidaOK, 1, 1, 0))
	}, nil)
	if _, err := e.Extraer(context.Background(), pedido()); err != nil {
		t.Fatal(err)
	}
	if gotHdr != claveTest {
		t.Fatalf("encabezado x-goog-api-key = %q", gotHdr)
	}
	if gotQuery != "" || strings.Contains(gotURL, claveTest) || strings.Contains(strings.ToLower(gotURL), "key=") {
		t.Fatalf("la clave no puede ir en la URL: %s", gotURL)
	}
	if cuerpoTieneClave {
		t.Fatal("la clave no puede ir en el cuerpo")
	}
}

func TestClaveAusente(t *testing.T) {
	if _, err := Nuevo(Opciones{}); !errors.Is(err, ErrClaveAusente) {
		t.Fatalf("esperaba ErrClaveAusente, hubo %v", err)
	}
	if _, err := Nuevo(Opciones{Clave: secreto.Nuevo("")}); !errors.Is(err, ErrClaveAusente) {
		t.Fatalf("clave vacía: %v", err)
	}
}

func TestBaseInseguraSeRechaza(t *testing.T) {
	for _, base := range []string{"http://generativelanguage.googleapis.com/v1beta", "ftp://x", "https://user:pw@h/x", "https://h/x?key=1"} {
		if _, err := Nuevo(Opciones{Clave: secreto.Nuevo("k"), URLBase: base}); err == nil {
			t.Fatalf("debía rechazar %q", base)
		}
	}
	if _, err := Nuevo(Opciones{Clave: secreto.Nuevo("k"), Modelo: "../x"}); err == nil {
		t.Fatal("modelo con path debía rechazarse")
	}
}

func TestRateLimit429ConRetryAfter(t *testing.T) {
	var n atomic.Int32
	e, esperas := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		if n.Add(1) == 1 {
			w.Header().Set("Retry-After", "3")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = io.WriteString(w, `{"error":{"code":429,"message":"texto libre con datos del cliente","status":"RESOURCE_EXHAUSTED"}}`)
			return
		}
		_, _ = io.WriteString(w, sobre(salidaOK, 5, 5, 0))
	}, nil)
	if _, err := e.Extraer(context.Background(), pedido()); err != nil {
		t.Fatal(err)
	}
	if n.Load() != 2 || len(*esperas) != 1 || (*esperas)[0] != 3*time.Second {
		t.Fatalf("intentos=%d esperas=%v; debía esperar exactamente el Retry-After", n.Load(), *esperas)
	}
}

func TestCuotaAgotadaSinRetryAfterRazonable(t *testing.T) {
	var n atomic.Int32
	e, esperas := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		w.Header().Set("Retry-After", "3600") // cuota diaria: no se espera una hora con el cliente en línea
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":{"code":429,"message":"SECRETO-DEL-CLIENTE","status":"RESOURCE_EXHAUSTED"}}`)
	}, nil)
	_, err := e.Extraer(context.Background(), pedido())
	if !errors.Is(err, ErrCuotaAgotada) {
		t.Fatalf("esperaba ErrCuotaAgotada: %v", err)
	}
	if n.Load() != 1 || len(*esperas) != 0 {
		t.Fatalf("no debía reintentar: intentos=%d esperas=%v", n.Load(), *esperas)
	}
	if strings.Contains(err.Error(), "SECRETO-DEL-CLIENTE") || !strings.Contains(err.Error(), "RESOURCE_EXHAUSTED") {
		t.Fatalf("el error no debe traer el mensaje libre del proveedor: %v", err)
	}
}

func TestRetryAfterEnFechaHTTP(t *testing.T) {
	ahora := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	if d := retryAfter(ahora.Add(5*time.Second).UTC().Format(http.TimeFormat), ahora); d != 5*time.Second {
		t.Fatalf("fecha HTTP: %v", d)
	}
	if retryAfter("-4", ahora) != 0 || retryAfter("basura", ahora) != 0 || retryAfter("", ahora) != 0 {
		t.Fatal("valores inválidos deben dar 0")
	}
}

func TestError500ReintentadoYLuegoError(t *testing.T) {
	var n atomic.Int32
	e, esperas := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, `{"error":{"code":500,"message":"detalle interno con datos","status":"INTERNAL"}}`)
	}, nil)
	_, err := e.Extraer(context.Background(), pedido())
	if !errors.Is(err, ErrNoDisponible) {
		t.Fatalf("esperaba ErrNoDisponible: %v", err)
	}
	if n.Load() != 3 || len(*esperas) != 2 {
		t.Fatalf("debía hacer 1 intento + 2 reintentos: intentos=%d esperas=%v", n.Load(), *esperas)
	}
	var ge *Error
	if !errors.As(err, &ge) || ge.Estado != 500 || ge.Intentos != 3 {
		t.Fatalf("error tipado: %+v", ge)
	}
	if strings.Contains(err.Error(), "detalle interno") {
		t.Fatal("el cuerpo crudo no debe filtrarse")
	}
}

func TestError500LuegoExito(t *testing.T) {
	var n atomic.Int32
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		if n.Add(1) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = io.WriteString(w, sobre(salidaOK, 1, 1, 0))
	}, nil)
	if _, err := e.Extraer(context.Background(), pedido()); err != nil || n.Load() != 2 {
		t.Fatalf("err=%v intentos=%d", err, n.Load())
	}
}

func TestErrores4xxNoSeReintentan(t *testing.T) {
	for estado, esperado := range map[int]error{400: ErrSolicitudRechazada, 401: ErrCredencial, 403: ErrCredencial, 404: ErrSolicitudRechazada} {
		t.Run(fmt.Sprint(estado), func(t *testing.T) {
			var n atomic.Int32
			e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
				n.Add(1)
				w.WriteHeader(estado)
			}, nil)
			if _, err := e.Extraer(context.Background(), pedido()); !errors.Is(err, esperado) || n.Load() != 1 {
				t.Fatalf("err=%v intentos=%d", err, n.Load())
			}
		})
	}
}

func TestJSONMalformado(t *testing.T) {
	for nombre, texto := range map[string]string{
		"texto plano":   "Hola, no soy JSON",
		"json cortado":  `{"version":"1.0","oficio":`,
		"no es objeto":  `["a","b"]`,
		"con vallas md": "```json\n" + salidaOK + "\n```",
		"vacío":         "",
	} {
		t.Run(nombre, func(t *testing.T) {
			e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, sobre(texto, 1, 1, 0)) }, nil)
			_, err := e.Extraer(context.Background(), pedido())
			if !errors.Is(err, ErrRespuestaNoJSON) {
				t.Fatalf("esperaba ErrRespuestaNoJSON: %v", err)
			}
			if texto != "" && strings.Contains(err.Error(), "Hola") {
				t.Fatal("el error no debe copiar la salida del modelo")
			}
		})
	}
	// El sobre mismo roto.
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, `<html>`) }, nil)
	if _, err := e.Extraer(context.Background(), pedido()); !errors.Is(err, ErrRespuestaNoJSON) {
		t.Fatalf("sobre roto: %v", err)
	}
}

func TestBloqueoPorSeguridad(t *testing.T) {
	casos := map[string]string{
		"prompt bloqueado": `{"promptFeedback":{"blockReason":"PROHIBITED_CONTENT"},"usageMetadata":{"promptTokenCount":9}}`,
		"candidato SAFETY": `{"candidates":[{"finishReason":"SAFETY"}]}`,
		"blocklist":        `{"candidates":[{"finishReason":"BLOCKLIST","content":{"parts":[]}}]}`,
	}
	for nombre, cuerpo := range casos {
		t.Run(nombre, func(t *testing.T) {
			var n atomic.Int32
			e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) { n.Add(1); _, _ = io.WriteString(w, cuerpo) }, nil)
			_, err := e.Extraer(context.Background(), pedido())
			if !errors.Is(err, ErrBloqueadoSeguridad) {
				t.Fatalf("esperaba ErrBloqueadoSeguridad: %v", err)
			}
			if errors.Is(err, ErrRespuestaNoJSON) || n.Load() != 1 {
				t.Fatalf("bloqueo no es no-JSON ni se reintenta (intentos=%d)", n.Load())
			}
		})
	}
}

func TestMaxTokensEsNoJSON(t *testing.T) {
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"{\"a\":"}]}}]}`)
	}, nil)
	if _, err := e.Extraer(context.Background(), pedido()); !errors.Is(err, ErrRespuestaNoJSON) {
		t.Fatalf("%v", err)
	}
}

func TestIgnoraPartesDeRazonamiento(t *testing.T) {
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"pensando...","thought":true},{"text":"{\"version\":\"1.0\"}"}]}}]}`)
	}, nil)
	r, err := e.Extraer(context.Background(), pedido())
	if err != nil || string(r.JSON) != `{"version":"1.0"}` {
		t.Fatalf("%s %v", r.JSON, err)
	}
}

func TestRespuestaDemasiadoGrande(t *testing.T) {
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, sobre(`{"x":"`+strings.Repeat("a", 5000)+`"}`, 1, 1, 0))
	}, func(o *Opciones) { o.RespuestaMaxBytes = 1000 })
	if _, err := e.Extraer(context.Background(), pedido()); !errors.Is(err, ErrRespuestaGrande) {
		t.Fatalf("%v", err)
	}
}

func TestTimeoutPorIntentoNoSeReintenta(t *testing.T) {
	var n atomic.Int32
	liberar := make(chan struct{})
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		_, _ = io.Copy(io.Discard, r.Body)
		select {
		case <-liberar:
		case <-r.Context().Done():
		}
	}, func(o *Opciones) { o.Timeout = 50 * time.Millisecond })
	defer close(liberar)
	_, err := e.Extraer(context.Background(), pedido())
	if !errors.Is(err, ErrTimeout) || !errors.Is(err, context.DeadlineExceeded) || n.Load() != 1 {
		t.Fatalf("err=%v intentos=%d", err, n.Load())
	}
}

func TestCancelacionDeContexto(t *testing.T) {
	entro := make(chan struct{})
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body) // sin leer el cuerpo el servidor no detecta que el cliente se fue
		close(entro)
		<-r.Context().Done()
	}, nil)
	ctx, cancelar := context.WithCancel(context.Background())
	go func() { <-entro; cancelar() }()
	_, err := e.Extraer(ctx, pedido())
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("esperaba context.Canceled: %v", err)
	}
	if errors.Is(err, ErrTimeout) {
		t.Fatal("cancelar no es timeout")
	}
	// Contexto ya cancelado: no llega ni a pegarle al servidor.
	var n atomic.Int32
	e2, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) { n.Add(1) }, nil)
	if _, err := e2.Extraer(ctx, pedido()); !errors.Is(err, context.Canceled) || n.Load() != 0 {
		t.Fatalf("err=%v intentos=%d", err, n.Load())
	}
}

func TestCancelacionDuranteBackoff(t *testing.T) {
	ctx, cancelar := context.WithCancel(context.Background())
	var n atomic.Int32
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}, func(o *Opciones) {
		o.dormir = func(c context.Context, d time.Duration) error { cancelar(); return c.Err() }
	})
	if _, err := e.Extraer(ctx, pedido()); !errors.Is(err, context.Canceled) || n.Load() != 1 {
		t.Fatalf("err=%v intentos=%d", err, n.Load())
	}
}

func TestPedidosInvalidos(t *testing.T) {
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) { t.Error("no debía llamar al proveedor") }, nil)
	casos := map[string]func(*proveedores.PedidoExtraccion){
		"sin prompt": func(p *proveedores.PedidoExtraccion) { p.CuerpoPrompt = " " },
		"sin nada":   func(p *proveedores.PedidoExtraccion) { p.Transcripcion, p.Fotogramas = "", nil },
		"no es jpeg": func(p *proveedores.PedidoExtraccion) { p.Fotogramas = [][]byte{[]byte("PNG....")} },
		"jpeg gigante": func(p *proveedores.PedidoExtraccion) {
			p.Fotogramas = [][]byte{append([]byte{0xFF, 0xD8}, make([]byte, 200<<10)...)}
		},
		"demasiados": func(p *proveedores.PedidoExtraccion) {
			p.Fotogramas = [][]byte{jpegMin, jpegMin, jpegMin, jpegMin, jpegMin, jpegMin, jpegMin, jpegMin, jpegMin}
		},
		"transcripción XL": func(p *proveedores.PedidoExtraccion) { p.Transcripcion = strings.Repeat("a", 40<<10) },
	}
	for n, mut := range casos {
		t.Run(n, func(t *testing.T) {
			p := pedido()
			mut(&p)
			if _, err := e.Extraer(context.Background(), p); !errors.Is(err, ErrPedidoInvalido) {
				t.Fatalf("%v", err)
			}
		})
	}
}

func TestSoloTextoSinFotogramas(t *testing.T) {
	var cuerpo string
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		cuerpo = string(b)
		_, _ = io.WriteString(w, sobre(salidaOK, 1, 1, 0))
	}, nil)
	p := pedido()
	p.Fotogramas = nil
	if _, err := e.Extraer(context.Background(), p); err != nil || strings.Contains(cuerpo, "inlineData") {
		t.Fatalf("err=%v", err)
	}
}

// La clave nunca aparece en errores, logs ni representaciones del adaptador.
func TestLaClaveNoSeFiltra(t *testing.T) {
	var log bytes.Buffer
	lg := slog.New(slog.NewJSONHandler(&log, &slog.HandlerOptions{Level: slog.LevelDebug}))
	var recogidos []string
	para := []http.HandlerFunc{
		func(w http.ResponseWriter, r *http.Request) { // el servidor repite la clave en el cuerpo de error
			w.WriteHeader(500)
			_, _ = io.WriteString(w, `{"error":{"message":"key `+r.Header.Get("x-goog-api-key")+` y `+textoCliente+`","status":"INTERNAL"}}`)
		},
		func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(403)
			_, _ = io.WriteString(w, `{"error":{"message":"API key `+r.Header.Get("x-goog-api-key")+` not valid","status":"PERMISSION_DENIED"}}`)
		},
		func(w http.ResponseWriter, r *http.Request) {
			_, _ = io.WriteString(w, sobre("no json "+textoCliente, 1, 1, 0))
		},
		func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, sobre(salidaOK, 1, 1, 0)) },
	}
	var ult *Extractor
	for _, h := range para {
		e, _ := nuevoExt(t, h, func(o *Opciones) { o.Log = lg })
		ult = e
		_, err := e.Extraer(context.Background(), pedido())
		if err != nil {
			recogidos = append(recogidos, err.Error(), fmt.Sprintf("%v|%+v|%#v|%q", err, err, err, err))
		}
	}
	// Conexión rechazada: el error de red de Go incluye la URL; que no llegue al error final.
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	e, err := Nuevo(Opciones{Clave: secreto.Nuevo(claveTest), URLBase: url, Reintentos: -1, Log: lg})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.Extraer(context.Background(), pedido()); err == nil {
		t.Fatal("debía fallar la conexión")
	} else {
		recogidos = append(recogidos, err.Error())
		if strings.Contains(err.Error(), "127.0.0.1") {
			t.Fatalf("el error de red no debe traer la URL: %v", err)
		}
	}
	recogidos = append(recogidos, fmt.Sprintf("%v %+v %#v %s", ult, ult, ult, ult), fmt.Sprintf("%+v", *ult), log.String())
	for _, s := range recogidos {
		if strings.Contains(s, claveTest) || strings.Contains(s, "CLAVE-DE-PRUEBA") {
			t.Fatalf("la clave se filtró: %s", s)
		}
		if strings.Contains(s, "Juan Perez") || strings.Contains(s, "5555-1234") {
			t.Fatalf("datos del cliente en errores/logs: %s", s)
		}
	}
	if !strings.Contains(log.String(), "gemini") {
		t.Fatal("el log debía registrar metadatos")
	}
}

func TestNoEsFalso(t *testing.T) {
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {}, nil)
	var x proveedores.Extractor = e
	if _, ok := x.(proveedores.Falso); ok {
		t.Fatal("el adaptador real no puede declararse falso")
	}
	if (proveedores.Conjunto{Extractor: e}).Falsos() != nil {
		t.Fatal("no debe figurar entre los falsos")
	}
}

func TestModeloConfigurable(t *testing.T) {
	var ruta string
	e, _ := nuevoExt(t, func(w http.ResponseWriter, r *http.Request) {
		ruta = r.URL.Path
		_, _ = io.WriteString(w, sobre(salidaOK, 1, 1, 0))
	}, func(o *Opciones) { o.Modelo = "models/gemini-otro-1.0" })
	if _, err := e.Extraer(context.Background(), pedido()); err != nil || ruta != "/models/gemini-otro-1.0:generateContent" {
		t.Fatalf("ruta=%s err=%v", ruta, err)
	}
}
