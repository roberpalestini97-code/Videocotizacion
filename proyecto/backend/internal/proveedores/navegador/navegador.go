// Package navegador implementa STT y TTS "en el cliente" (decisión de Rober,
// T13): el navegador reconoce la voz (es-AR) y manda texto.enviar por el
// WebSocket, y sintetiza la voz del avatar a partir de avatar.respuesta. El
// servidor no hace ni STT ni TTS: estos adaptadores nulos fallan si se los
// llama, para que un cableado equivocado se note y no cobre nada.
package navegador

import (
	"context"

	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
)

// Transcriptor nulo: el audio no debería llegar al servidor.
type Transcriptor struct{}

// Sintetizador nulo: la voz del avatar la produce el navegador.
type Sintetizador struct{}

// VozEnCliente implementa proveedores.VozEnCliente.
func (Transcriptor) VozEnCliente() bool { return true }

// VozEnCliente implementa proveedores.VozEnCliente.
func (Sintetizador) VozEnCliente() bool { return true }

// Transcribir siempre falla con proveedor_no_disponible.
func (Transcriptor) Transcribir(context.Context, proveedores.Audio) (proveedores.Transcripcion, error) {
	return proveedores.Transcripcion{}, errores.Envolver(errores.ProveedorNoDisponible, proveedores.ErrVozEnCliente)
}

// Sintetizar siempre falla con proveedor_no_disponible.
func (Sintetizador) Sintetizar(context.Context, string) (proveedores.Voz, error) {
	return proveedores.Voz{}, errores.Envolver(errores.ProveedorNoDisponible, proveedores.ErrVozEnCliente)
}

var (
	_ proveedores.Transcriptor = Transcriptor{}
	_ proveedores.Sintetizador = Sintetizador{}
	_ proveedores.VozEnCliente = Transcriptor{}
	_ proveedores.VozEnCliente = Sintetizador{}
)
