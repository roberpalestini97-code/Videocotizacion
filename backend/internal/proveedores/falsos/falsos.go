// Package falsos implementa los puertos de proveedores con adaptadores
// deterministas, sin red ni costo, que cuentan llamadas y consumo y permiten
// inyectar fallas (latencia, error, respuesta inválida). Son la base de las
// pruebas ("costo 0" = contadores en 0). Producción no arranca con ellos.
package falsos

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
)

// Fallas configura el comportamiento anómalo de un falso.
type Fallas struct {
	Latencia time.Duration // espera antes de responder (respeta ctx)
	Error    error         // si no es nil, se devuelve envuelto como proveedor_no_disponible
}

// Contador acumula llamadas y consumo, seguro para uso concurrente.
type Contador struct {
	mu       sync.Mutex
	llamadas int64
	unidades int64
}

func (c *Contador) sumar(unidades int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.llamadas++
	c.unidades += unidades
}

// Llamadas devuelve cuántas veces se invocó el puerto.
func (c *Contador) Llamadas() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.llamadas
}

// Unidades devuelve el consumo acumulado (ms de audio, tokens o caracteres).
func (c *Contador) Unidades() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.unidades
}

func esperar(ctx context.Context, f Fallas) error {
	if f.Latencia > 0 {
		t := time.NewTimer(f.Latencia)
		defer t.Stop()
		select {
		case <-ctx.Done():
			return errores.Envolver(errores.ProveedorNoDisponible, ctx.Err())
		case <-t.C:
		}
	}
	if err := ctx.Err(); err != nil {
		return errores.Envolver(errores.ProveedorNoDisponible, err)
	}
	if f.Error != nil {
		return errores.Envolver(errores.ProveedorNoDisponible, f.Error)
	}
	return nil
}

// Transcriptor falso: devuelve Texto fijo; consumo = ms de audio PCM16 mono.
type Transcriptor struct {
	Contador
	Fallas
	Texto string
}

// EsFalso marca el adaptador como falso.
func (*Transcriptor) EsFalso() bool { return true }

// Transcribir implementa proveedores.Transcriptor.
func (t *Transcriptor) Transcribir(ctx context.Context, a proveedores.Audio) (proveedores.Transcripcion, error) {
	if err := esperar(ctx, t.Fallas); err != nil {
		return proveedores.Transcripcion{}, err
	}
	var ms int64
	if a.FrecuenciaHz > 0 {
		ms = int64(len(a.PCM)/2) * 1000 / int64(a.FrecuenciaHz)
	}
	t.sumar(ms)
	return proveedores.Transcripcion{Texto: t.Texto, Final: a.Final, MilisegsAudio: ms}, nil
}

// RespuestaConMonto es una salida inválida a propósito: el LLM no puede poner
// precios (R14); sirve para probar que la validación la rechaza.
const RespuestaConMonto = `{"oficio":"pintura","precio":150000}`

// Extractor falso: devuelve JSON fijo. Tokens ≈ runas/4, determinista.
type Extractor struct {
	Contador
	Fallas
	JSON              string
	RespuestaInvalida bool // devuelve RespuestaConMonto
}

// EsFalso marca el adaptador como falso.
func (*Extractor) EsFalso() bool { return true }

// Extraer implementa proveedores.Extractor.
func (e *Extractor) Extraer(ctx context.Context, p proveedores.PedidoExtraccion) (proveedores.RespuestaExtraccion, error) {
	if err := esperar(ctx, e.Fallas); err != nil {
		return proveedores.RespuestaExtraccion{}, err
	}
	salida := e.JSON
	if salida == "" {
		salida = "{}"
	}
	if e.RespuestaInvalida {
		salida = RespuestaConMonto
	}
	entrada := int64((utf8.RuneCountInString(p.Transcripcion) + 3) / 4)
	sal := int64((len(salida) + 3) / 4)
	e.sumar(entrada + sal)
	return proveedores.RespuestaExtraccion{JSON: []byte(salida), TokensEntrada: entrada, TokensSalida: sal}, nil
}

// Sintetizador falso: audio de silencio proporcional al texto y una marca por
// palabra. Consumo = caracteres.
type Sintetizador struct {
	Contador
	Fallas
}

// EsFalso marca el adaptador como falso.
func (*Sintetizador) EsFalso() bool { return true }

// Sintetizar implementa proveedores.Sintetizador.
func (s *Sintetizador) Sintetizar(ctx context.Context, texto string) (proveedores.Voz, error) {
	if err := esperar(ctx, s.Fallas); err != nil {
		return proveedores.Voz{}, err
	}
	n := int64(utf8.RuneCountInString(texto))
	var marcas []proveedores.MarcaVisema
	for i := range strings.Fields(texto) {
		marcas = append(marcas, proveedores.MarcaVisema{Visema: "sil", InicioMs: int64(i) * 300})
	}
	s.sumar(n)
	return proveedores.Voz{Audio: make([]byte, n*32), Marcas: marcas, Caracteres: n}, nil
}

// Mensajeria falsa: arma el enlace wa.me sin llamar a nadie.
type Mensajeria struct {
	Contador
	Fallas
}

// EsFalso marca el adaptador como falso.
func (*Mensajeria) EsFalso() bool { return true }

// ErrTelefono indica un teléfono que no está en formato E.164.
var ErrTelefono = errors.New("teléfono no E.164")

// EnlaceDerivacion implementa proveedores.Mensajeria.
func (m *Mensajeria) EnlaceDerivacion(ctx context.Context, telefonoE164, texto string) (string, error) {
	if err := esperar(ctx, m.Fallas); err != nil {
		return "", err
	}
	if len(telefonoE164) < 9 || telefonoE164[0] != '+' || strings.Trim(telefonoE164[1:], "0123456789") != "" {
		return "", errores.Envolver(errores.ValidacionFallida, ErrTelefono)
	}
	m.sumar(1)
	return "https://wa.me/" + telefonoE164[1:] + "?text=" + CodificarTexto(texto), nil
}

// CodificarTexto codifica en porcentaje todo salvo [A-Za-z0-9._~-] (el
// patrón de DerivacionWhatsApp.url_wa_me no admite "+" ni otros símbolos).
func CodificarTexto(texto string) string {
	const hexa = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(texto); i++ {
		c := texto[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '.', c == '_', c == '~', c == '-':
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(hexa[c>>4])
			b.WriteByte(hexa[c&15])
		}
	}
	return b.String()
}

// Conjunto devuelve los cuatro falsos listos para cablear.
func Conjunto() (proveedores.Conjunto, *Transcriptor, *Extractor, *Sintetizador, *Mensajeria) {
	t, e, s, m := &Transcriptor{}, &Extractor{}, &Sintetizador{}, &Mensajeria{}
	return proveedores.Conjunto{Transcriptor: t, Extractor: e, Sintetizador: s, Mensajeria: m}, t, e, s, m
}

var (
	_ proveedores.Transcriptor = (*Transcriptor)(nil)
	_ proveedores.Extractor    = (*Extractor)(nil)
	_ proveedores.Sintetizador = (*Sintetizador)(nil)
	_ proveedores.Mensajeria   = (*Mensajeria)(nil)
	_ proveedores.Falso        = (*Transcriptor)(nil)
)
