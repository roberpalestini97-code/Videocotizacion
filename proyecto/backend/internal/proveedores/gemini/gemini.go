// Package gemini implementa proveedores.Extractor contra la API REST de Gemini
// (Google AI Studio, método generateContent) usando solo net/http y
// encoding/json. Ver ADR 0003, sección "Adaptador Gemini (T13a)".
//
// Reglas que cumple:
//   - La clave viaja SOLO en el encabezado x-goog-api-key (nunca en la URL) y
//     vive en un secreto.Secreto: no sale en logs, errores ni Stringer.
//   - Al proveedor se manda la transcripción, los fotogramas y el prompt; ningún
//     id de tenant ni del cliente (ADR 0003, punto 5).
//   - Reintento acotado con backoff solo para 429 y 5xx; respeta Retry-After.
//   - Los errores no incluyen el cuerpo crudo de la respuesta.
//   - La salida se devuelve cruda: el backend la valida contra el esquema
//     completo antes de usarla.
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
	"math/rand/v2"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/secreto"
)

// Valores por defecto.
const (
	// ModeloPorDefecto: Flash-Lite estable más reciente con nivel gratuito según
	// la documentación consultada (ver ADR). Se cambia con GEMINI_MODELO.
	ModeloPorDefecto  = "gemini-3.5-flash-lite"
	URLBasePorDefecto = "https://generativelanguage.googleapis.com/v1beta"

	// Encabezado de autenticación (preferido sobre ?key= para que la clave no
	// quede en logs de proxys ni en URLs de errores).
	encabezadoClave = "x-goog-api-key"

	fotogramaMaxBytes = 128 << 10 // BRIEF decisión 3
	fotogramasMax     = 8
	transcripcionMax  = 32 << 10
	cuerpoErrorMax    = 64 << 10
)

// Opciones configura el adaptador. Solo Clave es obligatoria.
type Opciones struct {
	Clave   secreto.Secreto
	Modelo  string // por defecto ModeloPorDefecto
	URLBase string // por defecto la oficial; http solo si es loopback (pruebas)

	Cliente           *http.Client  // por defecto uno propio sin redirecciones
	Timeout           time.Duration // por intento (30s)
	Reintentos        int           // reintentos máximos tras el primer intento (2); -1 = ninguno
	EsperaBase        time.Duration // backoff inicial (500ms)
	EsperaMax         time.Duration // tope de espera entre intentos y de Retry-After aceptado (8s)
	RespuestaMaxBytes int64         // tope de lectura de la respuesta (1 MiB)
	TokensSalidaMax   int           // maxOutputTokens (4096; incluye razonamiento del modelo)
	Log               *slog.Logger  // solo metadatos; nunca transcripción, imágenes ni clave

	dormir func(context.Context, time.Duration) error // inyectable en pruebas
}

// Extractor implementa proveedores.Extractor. No implementa proveedores.Falso.
type Extractor struct {
	clave    secreto.Secreto
	modelo   string
	endpoint string
	cliente  *http.Client
	timeout  time.Duration
	reint    int
	espera   time.Duration
	esperaMx time.Duration
	respMax  int64
	tokMax   int
	log      *slog.Logger
	dormir   func(context.Context, time.Duration) error
	esquema  map[string]any
}

var _ proveedores.Extractor = (*Extractor)(nil)

var reModelo = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

// Nuevo valida las opciones y arma el adaptador.
func Nuevo(o Opciones) (*Extractor, error) {
	if o.Clave.Vacio() {
		return nil, ErrClaveAusente
	}
	modelo := strings.TrimPrefix(strings.TrimSpace(o.Modelo), "models/")
	if modelo == "" {
		modelo = ModeloPorDefecto
	}
	if !reModelo.MatchString(modelo) {
		return nil, fmt.Errorf("gemini: nombre de modelo inválido")
	}
	base := strings.TrimRight(strings.TrimSpace(o.URLBase), "/")
	if base == "" {
		base = URLBasePorDefecto
	}
	if err := validarBase(base); err != nil {
		return nil, err
	}
	e := &Extractor{
		clave: o.Clave, modelo: modelo, endpoint: base + "/models/" + modelo + ":generateContent",
		cliente: o.Cliente, timeout: o.Timeout, reint: o.Reintentos, espera: o.EsperaBase, esperaMx: o.EsperaMax,
		respMax: o.RespuestaMaxBytes, tokMax: o.TokensSalidaMax, log: o.Log, dormir: o.dormir, esquema: esquemaGemini(),
	}
	if e.cliente == nil {
		e.cliente = &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	if e.timeout <= 0 {
		e.timeout = 30 * time.Second
	}
	switch {
	case e.reint == 0:
		e.reint = 2
	case e.reint < 0:
		e.reint = 0
	}
	if e.espera <= 0 {
		e.espera = 500 * time.Millisecond
	}
	if e.esperaMx <= 0 {
		e.esperaMx = 8 * time.Second
	}
	if e.respMax <= 0 {
		e.respMax = 1 << 20
	}
	if e.tokMax <= 0 {
		e.tokMax = 4096
	}
	if e.log == nil {
		e.log = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if e.dormir == nil {
		e.dormir = dormir
	}
	return e, nil
}

// validarBase exige https salvo loopback (pruebas): la clave viaja en un
// encabezado y no debe ir en claro por la red.
func validarBase(base string) error {
	u, err := url.Parse(base)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("gemini: URL base inválida")
	}
	switch u.Scheme {
	case "https":
		return nil
	case "http":
		h := u.Hostname()
		if ip := net.ParseIP(h); h == "localhost" || (ip != nil && ip.IsLoopback()) {
			return nil
		}
	}
	return errors.New("gemini: la URL base debe ser https (http solo en loopback)")
}

// Modelo informa el modelo configurado.
func (e *Extractor) Modelo() string { return e.modelo }

// String no revela nada sensible.
func (e *Extractor) String() string { return "gemini.Extractor{modelo=" + e.modelo + "}" }

// --- formato de pedido y respuesta (REST generateContent) ---

type parte struct {
	Text       string      `json:"text,omitempty"`
	InlineData *datoInline `json:"inlineData,omitempty"`
}
type datoInline struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}
type contenido struct {
	Role  string  `json:"role,omitempty"`
	Parts []parte `json:"parts"`
}
type configGen struct {
	ResponseMimeType   string         `json:"responseMimeType"`
	ResponseJSONSchema map[string]any `json:"responseJsonSchema"`
	Temperature        float64        `json:"temperature"`
	MaxOutputTokens    int            `json:"maxOutputTokens"`
}
type pedidoAPI struct {
	SystemInstruction contenido   `json:"systemInstruction"`
	Contents          []contenido `json:"contents"`
	GenerationConfig  configGen   `json:"generationConfig"`
}

type respuestaAPI struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text    string `json:"text"`
				Thought bool   `json:"thought"`
			} `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	PromptFeedback struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
	UsageMetadata struct {
		PromptTokenCount     int64 `json:"promptTokenCount"`
		CandidatesTokenCount int64 `json:"candidatesTokenCount"`
		ThoughtsTokenCount   int64 `json:"thoughtsTokenCount"`
	} `json:"usageMetadata"`
}

type errorAPI struct {
	Error struct {
		Code   json.Number `json:"code"`
		Status string      `json:"status"`
	} `json:"error"`
}

func (e *Extractor) armar(p proveedores.PedidoExtraccion) ([]byte, error) {
	if strings.TrimSpace(p.CuerpoPrompt) == "" {
		return nil, fmt.Errorf("%w: falta el prompt de sistema", ErrPedidoInvalido)
	}
	if strings.TrimSpace(p.Transcripcion) == "" && len(p.Fotogramas) == 0 {
		return nil, fmt.Errorf("%w: sin transcripción ni fotogramas", ErrPedidoInvalido)
	}
	if len(p.Transcripcion) > transcripcionMax {
		return nil, fmt.Errorf("%w: transcripción demasiado larga", ErrPedidoInvalido)
	}
	if len(p.Fotogramas) > fotogramasMax {
		return nil, fmt.Errorf("%w: demasiados fotogramas (máximo %d)", ErrPedidoInvalido, fotogramasMax)
	}
	partes := []parte{{Text: "Transcripción del turno del cliente:\n" + p.Transcripcion}}
	for i, f := range p.Fotogramas {
		if len(f) == 0 || len(f) > fotogramaMaxBytes || len(f) < 3 || f[0] != 0xFF || f[1] != 0xD8 {
			return nil, fmt.Errorf("%w: el fotograma %d no es un JPEG de hasta %d KiB", ErrPedidoInvalido, i, fotogramaMaxBytes>>10)
		}
		partes = append(partes, parte{InlineData: &datoInline{MimeType: "image/jpeg", Data: base64.StdEncoding.EncodeToString(f)}})
	}
	return json.Marshal(pedidoAPI{
		SystemInstruction: contenido{Parts: []parte{{Text: p.CuerpoPrompt}}},
		Contents:          []contenido{{Role: "user", Parts: partes}},
		GenerationConfig: configGen{
			ResponseMimeType: "application/json", ResponseJSONSchema: e.esquema,
			Temperature: 0.2, MaxOutputTokens: e.tokMax,
		},
	})
}

// Extraer implementa proveedores.Extractor.
func (e *Extractor) Extraer(ctx context.Context, p proveedores.PedidoExtraccion) (proveedores.RespuestaExtraccion, error) {
	cuerpo, err := e.armar(p)
	if err != nil {
		return proveedores.RespuestaExtraccion{}, err
	}
	inicio := time.Now()
	var ultimo *Error
	for intento := 1; intento <= e.reint+1; intento++ {
		if err := ctx.Err(); err != nil {
			return proveedores.RespuestaExtraccion{}, errCtx(ctx, intento-1)
		}
		resp, espera, errI := e.una(ctx, cuerpo, intento)
		if errI == nil {
			e.log.Info("gemini: extracción ok", "modelo", e.modelo, "intentos", intento,
				"tokens_entrada", resp.TokensEntrada, "tokens_salida", resp.TokensSalida, "duracion_ms", time.Since(inicio).Milliseconds())
			return resp, nil
		}
		ultimo = errI
		reintentable := errI.Estado == http.StatusTooManyRequests || errI.Estado >= 500
		// Cuota diaria o Retry-After más largo que lo tolerable en una llamada en vivo: no se espera.
		if !reintentable || errI.Codigo == "quota_exceeded" || espera > e.esperaMx || intento > e.reint {
			break
		}
		if espera <= 0 {
			espera = e.backoff(intento)
		}
		e.log.Warn("gemini: reintento", "modelo", e.modelo, "estado", errI.Estado, "intento", intento, "espera_ms", espera.Milliseconds())
		if err := e.dormir(ctx, espera); err != nil {
			return proveedores.RespuestaExtraccion{}, errCtx(ctx, intento)
		}
	}
	e.log.Warn("gemini: extracción falló", "modelo", e.modelo, "error", ultimo.Error(), "duracion_ms", time.Since(inicio).Milliseconds())
	return proveedores.RespuestaExtraccion{}, ultimo
}

// una hace un intento. Devuelve la espera pedida por Retry-After (0 si no vino).
func (e *Extractor) una(ctx context.Context, cuerpo []byte, intento int) (proveedores.RespuestaExtraccion, time.Duration, *Error) {
	cctx, cancelar := context.WithTimeout(ctx, e.timeout)
	defer cancelar()
	req, err := http.NewRequestWithContext(cctx, http.MethodPost, e.endpoint, bytes.NewReader(cuerpo))
	if err != nil {
		return proveedores.RespuestaExtraccion{}, 0, &Error{Tipo: ErrPedidoInvalido, Intentos: intento}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(encabezadoClave, e.clave.Revelar())
	res, err := e.cliente.Do(req)
	if err != nil {
		return proveedores.RespuestaExtraccion{}, 0, e.errRed(ctx, cctx, intento)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return proveedores.RespuestaExtraccion{}, retryAfter(res.Header.Get("Retry-After"), time.Now()), e.errHTTP(res, intento)
	}
	datos, err := io.ReadAll(io.LimitReader(res.Body, e.respMax+1))
	switch {
	case err != nil:
		return proveedores.RespuestaExtraccion{}, 0, e.errRed(ctx, cctx, intento)
	case int64(len(datos)) > e.respMax:
		return proveedores.RespuestaExtraccion{}, 0, &Error{Tipo: ErrRespuestaGrande, Estado: 200, Intentos: intento}
	}
	r, errR := interpretar(datos)
	if errR != nil {
		errR.Intentos = intento
		return proveedores.RespuestaExtraccion{}, 0, errR
	}
	return r, 0, nil
}

// errRed clasifica un fallo de transporte sin exponer el texto del error de
// red (puede traer la URL).
func (e *Extractor) errRed(padre, intento context.Context, n int) *Error {
	switch {
	case padre.Err() != nil:
		return errCtx(padre, n)
	case errors.Is(intento.Err(), context.DeadlineExceeded):
		return &Error{Tipo: ErrTimeout, Causa: context.DeadlineExceeded, Intentos: n}
	}
	return &Error{Tipo: ErrNoDisponible, Intentos: n, Codigo: "red"}
}

func errCtx(ctx context.Context, n int) *Error {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return &Error{Tipo: ErrTimeout, Causa: context.DeadlineExceeded, Intentos: n}
	}
	return &Error{Tipo: context.Canceled, Causa: ctx.Err(), Intentos: n}
}

func (e *Extractor) errHTTP(res *http.Response, intento int) *Error {
	cuerpo, _ := io.ReadAll(io.LimitReader(res.Body, cuerpoErrorMax))
	var ea errorAPI
	_ = json.Unmarshal(cuerpo, &ea) // solo se usan enums; el mensaje libre se descarta
	cod := codigoSeguro(ea.Error.Status)
	if cod == "" {
		cod = codigoSeguro(string(ea.Error.Code))
	}
	err := &Error{Estado: res.StatusCode, Codigo: cod, Intentos: intento}
	switch {
	case res.StatusCode == http.StatusTooManyRequests:
		err.Tipo = ErrCuotaAgotada
	case res.StatusCode >= 500:
		err.Tipo = ErrNoDisponible
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		err.Tipo = ErrCredencial
	default:
		err.Tipo = ErrSolicitudRechazada
	}
	return err
}

// interpretar lee una respuesta 200.
func interpretar(datos []byte) (proveedores.RespuestaExtraccion, *Error) {
	var r respuestaAPI
	if err := json.Unmarshal(datos, &r); err != nil {
		return proveedores.RespuestaExtraccion{}, &Error{Tipo: ErrRespuestaNoJSON, Estado: 200, Codigo: "sobre_invalido"}
	}
	if br := r.PromptFeedback.BlockReason; br != "" && len(r.Candidates) == 0 {
		return proveedores.RespuestaExtraccion{}, &Error{Tipo: ErrBloqueadoSeguridad, Estado: 200, Codigo: codigoSeguro(br)}
	}
	if len(r.Candidates) == 0 {
		return proveedores.RespuestaExtraccion{}, &Error{Tipo: ErrRespuestaNoJSON, Estado: 200, Codigo: "sin_candidatos"}
	}
	c := r.Candidates[0]
	switch c.FinishReason {
	case "SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT":
		return proveedores.RespuestaExtraccion{}, &Error{Tipo: ErrBloqueadoSeguridad, Estado: 200, Codigo: codigoSeguro(c.FinishReason)}
	case "MAX_TOKENS":
		return proveedores.RespuestaExtraccion{}, &Error{Tipo: ErrRespuestaNoJSON, Estado: 200, Codigo: "MAX_TOKENS"}
	}
	var sb strings.Builder
	for _, pt := range c.Content.Parts {
		if !pt.Thought {
			sb.WriteString(pt.Text)
		}
	}
	txt := strings.TrimSpace(sb.String())
	var obj map[string]json.RawMessage
	if err := json.Unmarshal([]byte(txt), &obj); err != nil || obj == nil {
		return proveedores.RespuestaExtraccion{}, &Error{Tipo: ErrRespuestaNoJSON, Estado: 200, Codigo: "no_es_objeto"}
	}
	u := r.UsageMetadata
	return proveedores.RespuestaExtraccion{
		JSON:          []byte(txt),
		TokensEntrada: u.PromptTokenCount,
		TokensSalida:  u.CandidatesTokenCount + u.ThoughtsTokenCount, // el razonamiento se factura como salida
	}, nil
}

// retryAfter interpreta segundos o fecha HTTP. 0 = no vino o no sirve.
func retryAfter(v string, ahora time.Time) time.Duration {
	v = strings.TrimSpace(v)
	if v == "" {
		return 0
	}
	if s, err := strconv.Atoi(v); err == nil {
		if s < 0 {
			return 0
		}
		return time.Duration(s) * time.Second
	}
	if t, err := http.ParseTime(v); err == nil {
		if d := t.Sub(ahora); d > 0 {
			return d
		}
	}
	return 0
}

// backoff exponencial con jitter, acotado.
func (e *Extractor) backoff(intento int) time.Duration {
	d := e.espera << (intento - 1)
	if d > e.esperaMx || d <= 0 {
		d = e.esperaMx
	}
	return d/2 + time.Duration(rand.Int64N(int64(d/2)+1))
}

func dormir(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
