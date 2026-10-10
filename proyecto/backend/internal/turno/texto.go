package turno

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/proveedores"
)

// Marcas que el orquestador deja en TextoSalida para logs y métricas. No
// llevan texto del cliente.
const (
	MarcaIntentoInyeccion   = "intento_inyeccion"
	MarcaHabladaReemplazada = "respuesta_hablada_reemplazada"
	MarcaSalidaInvalida     = "salida_invalida"
	MarcaReintentoLLM       = "reintento_llm"
)

// Causas de cierre (CierreTurno.Causa). MotivoCierre del contrato no tiene
// todas: ver docs/review/T13-huecos-del-contrato.md.
const (
	CausaCotizacion      = "cotizacion"
	CausaDerivarWhatsApp = "derivar_whatsapp"
	CausaFueraDeAlcance  = "fuera_de_alcance"
	CausaSinTarifa       = "sin_tarifa"
	CausaCerrar          = "cerrar"
	CausaCuotaProveedor  = "cuota_proveedor"
	CausaTopeTurnos      = "tope_turnos"
	CausaSinVoz          = "sin_voz"
)

// Frases de plantilla: las arma Go, nunca el LLM (ADR 0002 §4, §5 y §7). Sin
// montos, sin < ni >.
const (
	FraseNoEntendi      = "Perdón, no te entendí bien. ¿Me lo contás de nuevo con otras palabras?"
	FraseHabladaSegura  = "Perfecto, lo anoto. Sigamos con los datos del trabajo."
	FraseCotizacion     = "Listo, ya tengo lo necesario. Te dejo en pantalla el presupuesto orientativo; el profesional lo confirma cuando vea el trabajo. Si querés seguir, tocá el botón de WhatsApp con tu código."
	FraseDerivacion     = "Esto lo tiene que ver el profesional directamente. Te dejo el botón de WhatsApp con tu código de consulta para que sigan por ahí."
	FraseCuota          = "Ahora no puedo seguir la consulta por acá. Te dejo el botón de WhatsApp con tu código para que el profesional te atienda."
	FraseTopeTurnos     = "Ya hablamos bastante y quiero que no pierdas nada de lo que me contaste. Te dejo el botón de WhatsApp con tu código para seguir con el profesional."
	FraseSinVoz         = "Como no te escucho, cierro la consulta por ahora. Te dejo el botón de WhatsApp con tu código para seguir cuando quieras."
	FraseFaltanMedidas  = "Para armarte el presupuesto necesito las medidas aproximadas."
	FraseFaltaZona      = "Para el presupuesto necesito saber en qué localidad es el trabajo."
	correccionReintento = "campos desconocidos, faltantes, fuera de enum, fuera de rango o con montos; respetá el esquema 1.0 sin precios"
)

// TextoEntrada parametriza un turno (texto.enviar o voz ya transcripta).
type TextoEntrada struct {
	Numero          int
	Texto           string
	Fotogramas      [][]byte // JPEG en memoria, ya validados; no se guardan
	Oficio          dominio.Oficio
	UltimaSalidaLLM []byte // última salida validada de la sesión (sus datos)
	Prov            proveedores.Conjunto
	Sesion          *dominio.Sesion
	Cot             *cotizador.Cotizador
	Ahora           time.Time
}

// CierreTurno indica que la sesión termina en este turno.
type CierreTurno struct {
	Motivo dominio.MotivoCierre
	Causa  string
}

// TextoSalida son los eventos WS del turno y lo que el llamador persiste.
type TextoSalida struct {
	Eventos []Evento
	// SalidaLLM es la salida validada y normalizada (para respuestas_modelo).
	// Vacía si el modelo no dio una salida válida.
	SalidaLLM     []byte
	Cotizacion    *dominio.Cotizacion
	Cierre        *CierreTurno
	Marcas        []string
	TokensEntrada int64
	TokensSalida  int64
}

// DesdeTexto ejecuta un turno: prompt por oficio → Extractor (con 1 reintento
// si la salida no valida) → validación en Go → pizarrón → respuesta del
// avatar y visemas → y, si corresponde, precio en Go y cierre con derivación.
// El LLM nunca pone precio: el cálculo es del cotizador, en centavos int64.
func DesdeTexto(ctx context.Context, in TextoEntrada) (TextoSalida, error) {
	if !in.Prov.Completo() {
		return TextoSalida{}, fmt.Errorf("turno: proveedores incompletos")
	}
	cuerpo, refPrompt, err := prompts.MaterialTurno(in.Oficio, in.UltimaSalidaLLM)
	if err != nil {
		return TextoSalida{}, err
	}
	out := TextoSalida{}
	pedido := proveedores.PedidoExtraccion{
		Transcripcion: in.Texto, Fotogramas: in.Fotogramas, CuerpoPrompt: cuerpo,
		VersionPrompt: refPrompt, VersionEsquema: prompts.EsquemaSalidaLLM, DatosPrevios: in.UltimaSalidaLLM,
	}
	salida, crudo, err := extraerValidada(ctx, in.Prov.Extractor, pedido, &out)
	switch {
	case errors.Is(err, proveedores.ErrCuotaProveedor):
		return cierreSinSalida(ctx, in, out, FraseCuota, CierreTurno{Motivo: dominio.MotivoCuotaAgotada, Causa: CausaCuotaProveedor})
	case errores.Es(err, errores.ValidacionFallida):
		out.Marcas = append(out.Marcas, MarcaSalidaInvalida)
		return respuestaSinSalida(ctx, in, out, FraseNoEntendi)
	case err != nil:
		return TextoSalida{}, err
	}

	hablada := salida.RespuestaHablada
	if cotizador.HabladaConMontos(hablada) {
		hablada = FraseHabladaSegura
		out.Marcas = append(out.Marcas, MarcaHabladaReemplazada)
	}
	if salida.IntentoInyeccion || PareceInyeccion(in.Texto) {
		salida.IntentoInyeccion = true
		out.Marcas = append(out.Marcas, MarcaIntentoInyeccion)
	}
	salida.RespuestaHablada = hablada
	if out.SalidaLLM, err = normalizar(salida); err != nil {
		// No debería pasar: lo que validó se vuelve a validar al normalizar.
		out.SalidaLLM = crudo
	}

	extra := ""
	switch salida.SiguientePaso.Accion {
	case "emitir_presupuesto", "fuera_de_zona":
		cot, causa := cotizar(salida, in)
		switch {
		case cot != nil:
			out.Cotizacion = cot
			out.Cierre = &CierreTurno{Motivo: dominio.MotivoCompletada, Causa: CausaCotizacion}
			extra = FraseCotizacion
		case errors.Is(causa, cotizador.ErrFaltanMedidas):
			extra = FraseFaltanMedidas
		case errors.Is(causa, cotizador.ErrFaltaZona):
			extra = FraseFaltaZona
		case causa != nil:
			out.Cierre = &CierreTurno{Motivo: dominio.MotivoCompletada, Causa: CausaSinTarifa}
			extra = FraseDerivacion
		}
	case "derivar_whatsapp":
		out.Cierre = &CierreTurno{Motivo: dominio.MotivoCompletada, Causa: CausaDerivarWhatsApp}
		extra = FraseDerivacion
	case "fuera_de_alcance":
		out.Cierre = &CierreTurno{Motivo: dominio.MotivoCompletada, Causa: CausaFueraDeAlcance}
		extra = FraseDerivacion
	case "cerrar":
		out.Cierre = &CierreTurno{Motivo: dominio.MotivoCompletada, Causa: CausaCerrar}
		extra = FraseDerivacion
	}
	texto := TextoPlano(hablada)
	if extra != "" {
		texto = strings.TrimSpace(texto + " " + extra)
	}
	out.Eventos = append(out.Eventos, eventoTranscripcion(in), pizarronDesdeSalida(salida, in.Numero))
	evs, err := eventosAvatar(ctx, in, texto)
	if err != nil {
		return TextoSalida{}, err
	}
	out.Eventos = append(out.Eventos, evs...)
	return out, nil
}

// extraerValidada llama al LLM y valida en Go. Si la salida no valida (o el
// proveedor devuelve una respuesta inválida, cortada o bloqueada), reintenta
// UNA vez con una corrección fija (ADR 0002 §5). Un monto solo en
// respuesta_hablada no se reintenta: se reemplaza el texto.
func extraerValidada(ctx context.Context, ex proveedores.Extractor, p proveedores.PedidoExtraccion, out *TextoSalida) (cotizador.SalidaLLM, []byte, error) {
	var ultimo error
	for intento := 0; intento < 2; intento++ {
		if intento == 1 {
			p.Correccion = correccionReintento
			out.Marcas = append(out.Marcas, MarcaReintentoLLM)
		}
		res, err := ex.Extraer(ctx, p)
		out.TokensEntrada += res.TokensEntrada
		out.TokensSalida += res.TokensSalida
		if err != nil {
			if !errores.Es(err, errores.ValidacionFallida) {
				return cotizador.SalidaLLM{}, nil, err
			}
			ultimo = err
			continue
		}
		s, err := cotizador.ValidarSalidaLLM(res.JSON)
		if err == nil || errors.Is(err, cotizador.ErrMontoEnRespuesta) {
			return s, res.JSON, nil
		}
		ultimo = err
	}
	return cotizador.SalidaLLM{}, nil, ultimo
}

// normalizar re-serializa la salida validada (con la respuesta ya filtrada y
// la marca de inyección de Go) y la vuelve a validar antes de guardarla.
func normalizar(s cotizador.SalidaLLM) ([]byte, error) {
	if s.Medidas == nil {
		s.Medidas = []cotizador.MedidaLLM{}
	}
	if s.Faltantes == nil {
		s.Faltantes = []string{}
	}
	if s.Urgencia.Senales == nil {
		s.Urgencia.Senales = []string{}
	}
	if s.SiguientePaso.Campos == nil {
		s.SiguientePaso.Campos = []string{}
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(s); err != nil {
		return nil, err
	}
	b := bytes.TrimSpace(buf.Bytes())
	if _, err := cotizador.ValidarSalidaLLM(b); err != nil {
		return nil, err
	}
	return b, nil
}

func cotizar(s cotizador.SalidaLLM, in TextoEntrada) (*dominio.Cotizacion, error) {
	if in.Cot == nil || in.Sesion == nil {
		return nil, errors.New("turno: sin cotizador o sin sesión")
	}
	p, err := s.Pedido()
	if err != nil {
		return nil, err
	}
	ahora := in.Ahora
	if ahora.IsZero() {
		ahora = time.Now().UTC()
	}
	cot, err := in.Cot.Cotizar(*in.Sesion, p, ahora)
	if err != nil {
		return nil, err
	}
	return &cot, nil
}

// respuestaSinSalida contesta con una plantilla cuando el modelo no dio una
// salida válida: no hay pizarrón nuevo ni nada que guardar.
func respuestaSinSalida(ctx context.Context, in TextoEntrada, out TextoSalida, frase string) (TextoSalida, error) {
	out.Eventos = append(out.Eventos, eventoTranscripcion(in))
	evs, err := eventosAvatar(ctx, in, frase)
	if err != nil {
		return TextoSalida{}, err
	}
	out.Eventos = append(out.Eventos, evs...)
	return out, nil
}

func cierreSinSalida(ctx context.Context, in TextoEntrada, out TextoSalida, frase string, c CierreTurno) (TextoSalida, error) {
	out.Cierre = &c
	return respuestaSinSalida(ctx, in, out, frase)
}

// Cierre arma los eventos de un cierre decidido fuera del LLM (tope de
// turnos, silencio): solo la frase del avatar y sus visemas.
func Cierre(ctx context.Context, numero int, prov proveedores.Conjunto, frase string, c CierreTurno) (TextoSalida, error) {
	in := TextoEntrada{Numero: max(numero, 1), Prov: prov}
	evs, err := eventosAvatar(ctx, in, frase)
	if err != nil {
		return TextoSalida{}, err
	}
	return TextoSalida{Eventos: evs, Cierre: &c}, nil
}

func eventoTranscripcion(in TextoEntrada) Evento {
	texto := TextoPlano(in.Texto)
	if texto == "" {
		texto = "…"
	}
	return Evento{Tipo: "transcripcion.final", Datos: map[string]any{"turno": in.Numero, "texto": texto}}
}

// eventosAvatar arma avatar.respuesta y avatar.visemas. Con voz en el
// navegador (VozEnCliente) no se llama al sintetizador: los visemas salen del
// texto. Con un sintetizador de servidor se usan sus marcas.
func eventosAvatar(ctx context.Context, in TextoEntrada, texto string) ([]Evento, error) {
	texto = TextoPlano(texto)
	if texto == "" {
		texto = FraseNoEntendi
	}
	out := []Evento{{Tipo: "avatar.respuesta", Datos: map[string]any{"turno": in.Numero, "texto": texto}}}
	var items []map[string]any
	if v, ok := in.Prov.Sintetizador.(proveedores.VozEnCliente); ok && v.VozEnCliente() {
		items = VisemasDeTexto(texto)
	} else {
		voz, err := in.Prov.Sintetizador.Sintetizar(ctx, texto)
		if err != nil {
			return nil, err
		}
		for _, m := range voz.Marcas {
			if !visemasValidos[m.Visema] || m.InicioMs < 0 || m.InicioMs > maxTiempoVisemaMs || len(items) >= maxVisemas {
				continue
			}
			items = append(items, map[string]any{"v": m.Visema, "t_ms": m.InicioMs, "d_ms": 80})
		}
	}
	if len(items) > 0 {
		out = append(out, Evento{Tipo: "avatar.visemas", Datos: map[string]any{"turno": in.Numero, "items": items}})
	}
	return out, nil
}
