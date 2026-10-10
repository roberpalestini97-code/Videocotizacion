package turno_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/falsos"
	"videocotizacion/backend/internal/turno"
)

func TestDesdeTextoConFalsos(t *testing.T) {
	c, tr, ex, si, _ := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)

	c.Extractor = &pedidoCaptor{Extractor: c.Extractor}
	cap := c.Extractor.(*pedidoCaptor)

	sal, err := turno.DesdeTexto(context.Background(), turno.TextoEntrada{
		Numero: 1, Texto: "Quiero pintar living y dos dormitorios", Oficio: dominio.OficioPintura, Prov: c,
	})
	if err != nil {
		t.Fatal(err)
	}
	evs := sal.Eventos
	if len(evs) < 4 {
		t.Fatalf("eventos: %d", len(evs))
	}
	if evs[0].Tipo != "transcripcion.final" || evs[1].Tipo != "pizarron.actualizado" || evs[2].Tipo != "avatar.respuesta" || evs[3].Tipo != "avatar.visemas" {
		t.Fatalf("tipos: %+v", evs)
	}
	if sal.Cotizacion != nil {
		t.Fatal("preguntar no debe emitir cotización")
	}
	if tr.Llamadas() != 0 {
		t.Fatalf("STT no debió llamarse")
	}
	if ex.Llamadas() != 1 || si.Llamadas() != 1 {
		t.Fatalf("llm %d tts %d", ex.Llamadas(), si.Llamadas())
	}
	ref, err := prompts.ReferenciaContrato(dominio.OficioPintura)
	if err != nil {
		t.Fatal(err)
	}
	if cap.ultimo.VersionPrompt != ref || cap.ultimo.VersionEsquema != prompts.EsquemaSalidaLLM {
		t.Fatalf("pedido LLM: %+v", cap.ultimo)
	}
	if cap.ultimo.CuerpoPrompt == "" || !strings.Contains(cap.ultimo.CuerpoPrompt, "pintura") {
		t.Fatalf("cuerpo prompt vacío o incorrecto")
	}
}

func TestDesdeTextoMaterialPaisajismoTrasUltimaSalida(t *testing.T) {
	c, _, ex, si, _ := falsos.Conjunto()
	ultima, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "05-paisajismo-tecnico-planos-largo-plazo.json"))
	if err != nil {
		t.Fatal(err)
	}
	respuesta, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(respuesta)
	cap := &pedidoCaptor{Extractor: c.Extractor}
	c.Extractor = cap

	_, err = turno.DesdeTexto(context.Background(), turno.TextoEntrada{
		Numero: 2, Texto: "Siguiente dato del plano", Oficio: dominio.OficioJardineria,
		UltimaSalidaLLM: ultima, Prov: c,
	})
	if err != nil {
		t.Fatal(err)
	}
	if ex.Llamadas() != 1 || si.Llamadas() != 1 {
		t.Fatalf("llm %d tts %d", ex.Llamadas(), si.Llamadas())
	}
	if cap.ultimo.VersionPrompt != "conducta_paisajismo@5cc33b65b089" {
		t.Fatalf("prompt: %+v", cap.ultimo)
	}
}

type pedidoCaptor struct {
	proveedores.Extractor
	ultimo proveedores.PedidoExtraccion
}

func (p *pedidoCaptor) Extraer(ctx context.Context, ped proveedores.PedidoExtraccion) (proveedores.RespuestaExtraccion, error) {
	p.ultimo = ped
	return p.Extractor.Extraer(ctx, ped)
}
