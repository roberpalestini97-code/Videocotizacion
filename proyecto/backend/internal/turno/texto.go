package turno

import (
	"context"
	"fmt"
	"time"

	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/proveedores"
)

// TextoEntrada parametriza un turno por texto.enviar.
type TextoEntrada struct {
	Numero          int
	Texto           string
	Oficio          dominio.Oficio
	UltimaSalidaLLM []byte
	Prov            proveedores.Conjunto
	Sesion          *dominio.Sesion
	Cot             *cotizador.Cotizador
	Ahora           time.Time
}

// TextoSalida son eventos WS y, si Go pudo emitir, la cotización a persistir.
type TextoSalida struct {
	Eventos    []Evento
	Cotizacion *dominio.Cotizacion
	SalidaLLM  []byte
}

// DesdeTexto procesa texto.enviar: LLM, pizarrón, voz y opcionalmente cotiza en Go.
func DesdeTexto(ctx context.Context, in TextoEntrada) (TextoSalida, error) {
	if !in.Prov.Completo() {
		return TextoSalida{}, fmt.Errorf("turno: proveedores incompletos")
	}
	cuerpo, refPrompt, err := prompts.MaterialTurno(in.Oficio, in.UltimaSalidaLLM)
	if err != nil {
		return TextoSalida{}, err
	}
	ext, err := in.Prov.Extractor.Extraer(ctx, proveedores.PedidoExtraccion{
		Transcripcion:  in.Texto,
		CuerpoPrompt:   cuerpo,
		VersionPrompt:  refPrompt,
		VersionEsquema: prompts.EsquemaSalidaLLM,
	})
	if err != nil {
		return TextoSalida{}, err
	}
	salida, err := cotizador.DecodificarSalidaLLM(ext.JSON)
	if err != nil {
		return TextoSalida{}, err
	}
	hablada := salida.RespuestaHablada
	if hablada == "" {
		return TextoSalida{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("respuesta_hablada vacía"))
	}
	voz, err := in.Prov.Sintetizador.Sintetizar(ctx, hablada)
	if err != nil {
		return TextoSalida{}, err
	}
	turno := in.Numero
	out := []Evento{
		{
			Tipo: "transcripcion.final",
			Datos: map[string]any{
				"turno": turno,
				"texto": in.Texto,
			},
		},
		pizarronDesdeSalida(salida, turno),
		{
			Tipo: "avatar.respuesta",
			Datos: map[string]any{
				"turno": turno,
				"texto": hablada,
			},
		},
	}
	if len(voz.Marcas) > 0 {
		items := make([]map[string]any, 0, len(voz.Marcas))
		for _, m := range voz.Marcas {
			items = append(items, map[string]any{
				"v":    m.Visema,
				"t_ms": m.InicioMs,
				"d_ms": 80,
			})
		}
		out = append(out, Evento{
			Tipo: "avatar.visemas",
			Datos: map[string]any{
				"turno": turno,
				"items": items,
			},
		})
	}
	var guardar *dominio.Cotizacion
	if cot := intentarCotizar(salida, in); cot != nil {
		guardar = cot
	}
	salidaJSON := append([]byte(nil), ext.JSON...)
	return TextoSalida{Eventos: out, Cotizacion: guardar, SalidaLLM: salidaJSON}, nil
}

func intentarCotizar(sal cotizador.SalidaLLM, in TextoEntrada) *dominio.Cotizacion {
	if in.Cot == nil || in.Sesion == nil || sal.SiguientePaso.Accion != "emitir_presupuesto" {
		return nil
	}
	p, err := sal.Pedido()
	if err != nil {
		return nil
	}
	ahora := in.Ahora
	if ahora.IsZero() {
		ahora = time.Now().UTC()
	}
	cot, err := in.Cot.Cotizar(*in.Sesion, p, ahora)
	if err != nil {
		if errores.Es(err, errores.CotizacionNoEmitida) {
			return nil
		}
		return nil
	}
	return &cot
}
