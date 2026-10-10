package falsos

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"unicode/utf8"

	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
)

// ErrGuion indica que el extractor guionado recibió algo que el guion no
// esperaba (más turnos de los previstos o una transcripción distinta).
var ErrGuion = errors.New("guion del extractor falso")

// PasoGuion es una respuesta del extractor guionado, en orden.
type PasoGuion struct {
	Espera string // si no está vacío, la transcripción tiene que contenerlo
	JSON   string // salida del "modelo" (puede ser inválida a propósito)
	Error  error  // si no es nil, se devuelve tal cual (p. ej. cuota)
}

// Guion es un Extractor falso determinista guiado por una lista de pasos,
// para probar conversaciones completas. Guarda una copia de cada pedido
// (sin los bytes de los fotogramas, solo cuántos hubo).
type Guion struct {
	Contador
	mu       sync.Mutex
	pasos    []PasoGuion
	sig      int
	pedidos  []proveedores.PedidoExtraccion
	nFotos   []int
	fallidos []string // pasos que no coincidieron con lo esperado
}

// NuevoGuion arma el extractor con sus pasos.
func NuevoGuion(pasos ...PasoGuion) *Guion { return &Guion{pasos: pasos} }

// EsFalso marca el adaptador como falso.
func (*Guion) EsFalso() bool { return true }

// Extraer implementa proveedores.Extractor.
func (g *Guion) Extraer(ctx context.Context, p proveedores.PedidoExtraccion) (proveedores.RespuestaExtraccion, error) {
	if err := ctx.Err(); err != nil {
		return proveedores.RespuestaExtraccion{}, errores.Envolver(errores.ProveedorNoDisponible, err)
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	copia := p
	copia.Fotogramas = nil
	g.pedidos = append(g.pedidos, copia)
	g.nFotos = append(g.nFotos, len(p.Fotogramas))
	if g.sig >= len(g.pasos) {
		g.fallidos = append(g.fallidos, fmt.Sprintf("pedido %d sin paso", len(g.pedidos)))
		return proveedores.RespuestaExtraccion{}, errores.Envolver(errores.ProveedorNoDisponible, ErrGuion)
	}
	paso := g.pasos[g.sig]
	g.sig++
	if paso.Espera != "" && !strings.Contains(p.Transcripcion, paso.Espera) {
		g.fallidos = append(g.fallidos, fmt.Sprintf("paso %d: no llegó %q", g.sig, paso.Espera))
	}
	entrada := int64((utf8.RuneCountInString(p.Transcripcion) + len(p.DatosPrevios) + 3) / 4)
	if paso.Error != nil {
		g.sumar(entrada)
		return proveedores.RespuestaExtraccion{TokensEntrada: entrada}, paso.Error
	}
	sal := int64((len(paso.JSON) + 3) / 4)
	g.sumar(entrada + sal)
	return proveedores.RespuestaExtraccion{JSON: []byte(paso.JSON), TokensEntrada: entrada, TokensSalida: sal}, nil
}

// Pedidos devuelve copia de los pedidos recibidos y cuántos fotogramas traía cada uno.
func (g *Guion) Pedidos() ([]proveedores.PedidoExtraccion, []int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]proveedores.PedidoExtraccion(nil), g.pedidos...), append([]int(nil), g.nFotos...)
}

// Restantes devuelve cuántos pasos quedan sin usar.
func (g *Guion) Restantes() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return len(g.pasos) - g.sig
}

var _ proveedores.Extractor = (*Guion)(nil)

// Fallidos devuelve los desvíos respecto del guion (vacío = se cumplió).
func (g *Guion) Fallidos() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]string(nil), g.fallidos...)
}
