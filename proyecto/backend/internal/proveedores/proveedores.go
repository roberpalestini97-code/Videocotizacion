// Package proveedores define los puertos hacia servicios externos (ADR 0003):
// transcripción (STT), extracción con LLM, síntesis de voz (TTS) y mensajería
// (WhatsApp). Las firmas usan tipos propios, nunca tipos del SDK de un
// proveedor. Los adaptadores reales se eligen en T13; hoy solo hay falsos
// (paquete falsos), que producción rechaza (corrección H4 de T20).
//
// Las firmas son provisorias: el streaming de audio y los eventos de voz se
// fijan en T25 junto con eventos-sesion.md (que todavía no está congelado).
package proveedores

import "context"

// Audio es un tramo de audio del cliente (PCM 16 bits mono). Nunca se
// persiste (R43).
type Audio struct {
	PCM          []byte
	FrecuenciaHz int
	Final        bool // último tramo del turno
}

// Transcripcion es el resultado parcial o final de un tramo.
type Transcripcion struct {
	Texto         string
	Final         bool
	MilisegsAudio int64 // consumo medido para cuotas y costos (ADR 0005)
}

// Transcriptor convierte voz en texto (es-AR).
type Transcriptor interface {
	Transcribir(ctx context.Context, a Audio) (Transcripcion, error)
}

// PedidoExtraccion es lo único que se manda al LLM: la transcripción del
// turno y, opcionalmente, fotogramas en memoria. Sin ids del cliente ni del
// tenant (ADR 0003, punto 5).
type PedidoExtraccion struct {
	Transcripcion  string
	Fotogramas     [][]byte // JPEG ≤128 KiB; no se guardan (BRIEF, decisión 3)
	CuerpoPrompt   string   // instrucción por oficio (conductas/prompts); sin ids de tenant
	VersionPrompt  string
	VersionEsquema string
}

// RespuestaExtraccion es el JSON crudo del modelo; se valida contra el
// esquema de conductas antes de usarlo (el LLM solo extrae, no pone precios).
type RespuestaExtraccion struct {
	JSON          []byte
	TokensEntrada int64
	TokensSalida  int64
}

// Extractor llama al LLM extractor.
type Extractor interface {
	Extraer(ctx context.Context, p PedidoExtraccion) (RespuestaExtraccion, error)
}

// MarcaVisema sincroniza el avatar con el audio.
type MarcaVisema struct {
	Visema   string
	InicioMs int64
}

// Voz es el audio sintetizado con sus marcas opcionales.
type Voz struct {
	Audio      []byte
	Marcas     []MarcaVisema
	Caracteres int64 // consumo medido
}

// Sintetizador convierte texto en voz.
type Sintetizador interface {
	Sintetizar(ctx context.Context, texto string) (Voz, error)
}

// Mensajeria arma la derivación a WhatsApp (enlace wa.me con código de
// referencia, sin envío automático por ahora, ADR 0006).
type Mensajeria interface {
	EnlaceDerivacion(ctx context.Context, telefonoE164, texto string) (string, error)
}

// Falso lo implementan los adaptadores falsos. El arranque lo usa para negar
// el inicio en producción aunque la configuración diga otra cosa.
type Falso interface {
	EsFalso() bool
}

// Conjunto agrupa los cuatro puertos que usa la API.
type Conjunto struct {
	Transcriptor Transcriptor
	Extractor    Extractor
	Sintetizador Sintetizador
	Mensajeria   Mensajeria
}

// Falsos devuelve los nombres de los puertos cableados con adaptadores falsos.
func (c Conjunto) Falsos() []string {
	var out []string
	for nombre, p := range map[string]any{
		"stt": c.Transcriptor, "llm": c.Extractor, "tts": c.Sintetizador, "whatsapp": c.Mensajeria,
	} {
		if f, ok := p.(Falso); ok && f.EsFalso() {
			out = append(out, nombre)
		}
	}
	return out
}

// Completo informa si los cuatro puertos están cableados.
func (c Conjunto) Completo() bool {
	return c.Transcriptor != nil && c.Extractor != nil && c.Sintetizador != nil && c.Mensajeria != nil
}
