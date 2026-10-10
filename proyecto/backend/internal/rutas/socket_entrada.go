package rutas

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"image/jpeg"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/coder/websocket"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/turno"
)

// usoMedios es el conteo de la sesión en este proceso. Guarda en memoria, y
// solo hasta el próximo turno o el corte del socket, los últimos fotogramas
// aceptados (nunca en base, disco ni logs). El número de turno se deriva de
// la base (respuestas_modelo); turnos cuenta además los intentos fallidos.
type usoMedios struct {
	turnos          int
	descartesTexto  int
	fotogramas      int
	descartesTrama  int
	ultimoFotograma time.Time
	audioTipo       byte
	audioParcial    []byte
	fotos           [][]byte
}

const (
	maxCargaAudioTurno = 128 << 10 // eventos-sesion.md: carga útil ≤ 128 KiB por trama; tope por turno
	fotosPorTurno      = 2         // fotogramas más recientes que van al Extractor
)

// atenderMedios lee lo que sigue a sesion.lista. El texto no puede pasar de
// 16 KiB ni la trama de 20 B + 128 KiB: el exceso cierra con 1009. Un turno
// que termina la sesión (cotización o derivación) manda sesion.cerrada y
// cierra con 1000. Sin mensajes del cliente durante sin_voz_s se avisa y se
// cierra con motivo sin_voz.
func (h *enlace) atenderMedios(conn *websocket.Conn, r *http.Request, tenant dominio.TenantID, sesionID string) {
	conn.SetReadLimit(topeTramaMedios)
	defer h.liberarMedios(sesionID)
	c := &canalMedios{conn: conn, seq: 1, actividad: time.Now()}
	if h.prov.Completo() {
		v := h.vigilarSilencio(r.Context(), c, tenant, sesionID)
		defer v.parar()
		c.vig = v
	}
	for {
		tipo, payload, err := conn.Read(r.Context())
		if err != nil {
			return
		}
		c.vig.pausar()
		c.mu.Lock()
		c.actividad = time.Now()
		if c.terminado {
			c.mu.Unlock()
			return
		}
		if tipo == websocket.MessageText && len(payload) > topeTextoMedios {
			c.terminado = true
			c.mu.Unlock()
			cerrarMedios(conn, websocket.StatusMessageTooBig, "tamano")
			return
		}
		var res respuestaMedios
		switch tipo {
		case websocket.MessageText:
			res = h.responderTexto(r.Context(), tenant, sesionID, payload, &c.seq)
		case websocket.MessageBinary:
			res = h.responderTrama(r.Context(), tenant, sesionID, payload, &c.seq)
		}
		if !c.escribir(r.Context(), res.msgs) {
			c.terminado = true
			c.mu.Unlock()
			return
		}
		if res.cerrar {
			c.terminado = true
			c.mu.Unlock()
			_ = conn.Close(websocket.StatusNormalClosure, "fin")
			return
		}
		c.actividad = time.Now()
		c.mu.Unlock()
		c.vig.reanudar()
	}
}

// canalMedios serializa las escrituras del bucle y del vigilante de silencio.
type canalMedios struct {
	mu        sync.Mutex
	conn      *websocket.Conn
	seq       int
	terminado bool
	actividad time.Time // último mensaje del cliente procesado (reloj real)
	vig       *vigilante
}

func (c *canalMedios) escribir(ctx context.Context, msgs [][]byte) bool {
	for _, msg := range msgs {
		if len(msg) == 0 {
			continue
		}
		if err := c.conn.Write(ctx, websocket.MessageText, msg); err != nil {
			return false
		}
	}
	return true
}

// respuestaMedios son los mensajes a mandar y si la sesión terminó.
type respuestaMedios struct {
	msgs   [][]byte
	cerrar bool
}

func soloMensajes(msgs ...[]byte) respuestaMedios { return respuestaMedios{msgs: msgs} }

// responderTexto aplica R66: un texto largo o con < > se descarta sin llamar
// al LLM. El tope de turnos LLM cierra la sesión con derivación.
func (h *enlace) responderTexto(ctx context.Context, tenant dominio.TenantID, sesionID string, payload []byte, seq *int) respuestaMedios {
	texto, es := textoDeEnviar(payload)
	if !es {
		return respuestaMedios{}
	}
	if utf8.RuneCountInString(texto) > caracteresMaxPorTurno || strings.ContainsAny(texto, "<>") || strings.TrimSpace(texto) == "" {
		h.contarDescarteTexto(sesionID)
		return soloMensajes(eventoError(siguienteSeq(seq)))
	}
	if !h.prov.Completo() {
		return respuestaMedios{}
	}
	return h.ejecutarTurnoConTexto(ctx, tenant, sesionID, texto, seq)
}

// ejecutarTurnoConTexto corre un turno de punta a punta (T25): lee la sesión
// y sus datos (última salida validada), numera el turno desde la base (P3),
// llama al orquestador, persiste respuestas_modelo y la cotización ANTES de
// mandar nada, y si el turno cierra, cierra la sesión y manda la derivación.
func (h *enlace) ejecutarTurnoConTexto(ctx context.Context, tenant dominio.TenantID, sesionID, texto string, seq *int) respuestaMedios {
	ses, err := h.almacen.LeerSesion(ctx, tenant, sesionID)
	if err != nil {
		return soloMensajes(eventoCodigo(siguienteSeq(seq), errores.ErrorInterno))
	}
	if ses.Estado == dominio.EstadoCerrada {
		return respuestaMedios{msgs: [][]byte{eventoCodigo(siguienteSeq(seq), errores.SesionCerrada)}, cerrar: true}
	}
	resps, err := h.almacen.ListarRespuestasModeloDeSesion(ctx, tenant, sesionID)
	if err != nil {
		return soloMensajes(eventoCodigo(siguienteSeq(seq), errores.ErrorInterno))
	}
	var ultimaSalida []byte
	ultimoTurno := 0
	if len(resps) > 0 {
		ultimaSalida = resps[len(resps)-1].SalidaJSON
		ultimoTurno = resps[len(resps)-1].Turno
	}
	n, tope := h.reservarTurno(sesionID, ultimoTurno)
	if tope {
		return h.cerrarConPlantilla(ctx, tenant, ses, n, turno.FraseTopeTurnos, turno.CierreTurno{Motivo: dominio.MotivoCuotaAgotada, Causa: turno.CausaTopeTurnos}, seq)
	}
	var oficio dominio.Oficio
	if as, err := h.almacen.LeerAsesor(ctx, tenant, ses.AsesorID); err == nil {
		oficio = prompts.OficioDelTurno(ses.AvatarID, as.Oficios)
	}
	sal, err := turno.DesdeTexto(ctx, turno.TextoEntrada{
		Numero: n, Texto: texto, Fotogramas: h.tomarFotogramas(sesionID), Oficio: oficio, UltimaSalidaLLM: ultimaSalida,
		Prov: h.prov, Sesion: &ses, Cot: h.cot, Ahora: h.ahoraDePanel(),
	})
	if err != nil {
		h.log.Warn("turno sin respuesta del proveedor", "sesion", sesionID, "turno", n, "codigo", string(errores.CodigoDe(err)))
		return soloMensajes(eventoErrorProveedor(siguienteSeq(seq), err))
	}
	h.log.Info("turno", "sesion", sesionID, "turno", n, "marcas", sal.Marcas,
		"tokens_entrada", sal.TokensEntrada, "tokens_salida", sal.TokensSalida, "cotizacion", sal.Cotizacion != nil)
	if len(sal.SalidaLLM) > 0 {
		if n, err = h.guardarRespuesta(ctx, tenant, sesionID, n, sal.SalidaLLM); err != nil {
			h.log.Error("guardar respuesta del modelo", "sesion", sesionID, "codigo", string(errores.CodigoDe(err)))
			return soloMensajes(eventoCodigo(siguienteSeq(seq), errores.ErrorInterno))
		}
		renumerar(sal.Eventos, n)
	}
	if sal.Cotizacion != nil {
		if err := h.almacen.GuardarCotizacion(ctx, tenant, *sal.Cotizacion); err != nil {
			// Sin cotización guardada no se muestra precio (P4).
			h.log.Error("guardar cotización del turno", "sesion", sesionID, "codigo", string(errores.CodigoDe(err)))
			return soloMensajes(eventoCodigo(siguienteSeq(seq), errores.ErrorInterno))
		}
	}
	out := respuestaMedios{msgs: make([][]byte, 0, len(sal.Eventos)+2)}
	for _, ev := range sal.Eventos {
		out.msgs = append(out.msgs, eventoServidor(ev.Tipo, siguienteSeq(seq), ev.Datos))
	}
	if sal.Cierre != nil {
		out.msgs = append(out.msgs, h.mensajesCierre(ctx, tenant, ses, sal.Cotizacion, *sal.Cierre, seq)...)
		out.cerrar = true
	}
	return out
}

// guardarRespuesta anexa la salida con el número n. Si otro socket de la
// misma sesión ya usó ese número (PK repetida), toma el siguiente de la base
// y reintenta una vez.
func (h *enlace) guardarRespuesta(ctx context.Context, tenant dominio.TenantID, sesionID string, n int, salida []byte) (int, error) {
	for intento := 0; ; intento++ {
		err := h.almacen.AnexarRespuestaModelo(ctx, tenant, dominio.RespuestaModelo{
			SesionID: sesionID, Turno: n, RegistradaEn: h.ahoraDePanel(), SalidaJSON: salida,
		})
		if err == nil || !errores.Es(err, errores.EstadoInvalido) || intento > 0 {
			return n, err
		}
		resps, errL := h.almacen.ListarRespuestasModeloDeSesion(ctx, tenant, sesionID)
		if errL != nil || len(resps) == 0 {
			return n, err
		}
		n, _ = h.reservarTurno(sesionID, resps[len(resps)-1].Turno)
	}
}

func renumerar(evs []turno.Evento, n int) {
	for _, ev := range evs {
		if _, ok := ev.Datos["turno"]; ok {
			ev.Datos["turno"] = n
		}
		if _, ok := ev.Datos["version"]; ok {
			ev.Datos["version"] = n
		}
	}
}

// cerrarConPlantilla cierra la sesión por una decisión de Go (tope de turnos,
// silencio): frase de plantilla del avatar + sesion.cerrada.
func (h *enlace) cerrarConPlantilla(ctx context.Context, tenant dominio.TenantID, ses dominio.Sesion, n int, frase string, c turno.CierreTurno, seq *int) respuestaMedios {
	sal, err := turno.Cierre(ctx, min(n, 500), h.prov, frase, c)
	out := respuestaMedios{cerrar: true}
	if err == nil {
		for _, ev := range sal.Eventos {
			out.msgs = append(out.msgs, eventoServidor(ev.Tipo, siguienteSeq(seq), ev.Datos))
		}
	}
	out.msgs = append(out.msgs, h.mensajesCierre(ctx, tenant, ses, nil, c, seq)...)
	return out
}

// mensajesCierre cierra la sesión en la base y arma cotizacion.emitida (si
// hubo precio, con la derivación) y sesion.cerrada. Sin cotización, la
// derivación se lee con GET /v1/sesiones/{id}/derivacion (ya cerrada): el
// contrato no tiene un evento de derivación sin precio (ver huecos T13).
func (h *enlace) mensajesCierre(ctx context.Context, tenant dominio.TenantID, ses dominio.Sesion, cot *dominio.Cotizacion, c turno.CierreTurno, seq *int) [][]byte {
	cerrada, err := h.almacen.CerrarSesion(ctx, tenant, ses.ID, c.Motivo, h.ahoraDePanel())
	if err != nil {
		if !errores.Es(err, errores.SesionCerrada) {
			h.log.Error("cerrar sesión al final del turno", "sesion", ses.ID, "codigo", string(errores.CodigoDe(err)))
			return [][]byte{eventoCodigo(siguienteSeq(seq), errores.ErrorInterno)}
		}
		if cerrada, err = h.almacen.LeerSesion(ctx, tenant, ses.ID); err != nil {
			return [][]byte{eventoCodigo(siguienteSeq(seq), errores.ErrorInterno)}
		}
	}
	h.log.Info("sesión cerrada por el orquestador", "sesion", ses.ID, "motivo", string(cerrada.MotivoCierre), "causa", c.Causa)
	var out [][]byte
	if cot != nil {
		generada := h.ahoraDePanel()
		if cerrada.CerradaEn != nil {
			generada = *cerrada.CerradaEn
		}
		if as, err := h.almacen.LeerAsesor(ctx, tenant, ses.AsesorID); err == nil {
			if der, err := mapaDerivacionWhatsApp(ses.ID, as.WhatsApp, generada); err == nil {
				out = append(out, eventoServidor("cotizacion.emitida", siguienteSeq(seq), map[string]any{
					"cotizacion": mapaCotizacionContrato(*cot),
					"derivacion": der,
				}))
			}
		}
	}
	return append(out, eventoServidor("sesion.cerrada", siguienteSeq(seq), map[string]any{
		"motivo_cierre": string(cerrada.MotivoCierre),
		"duracion_s":    cerrada.DuracionS,
	}))
}

// reservarTurno numera el turno como max(último de la base, intentos en el
// proceso) + 1. Con un reinicio o con otra instancia el número sigue al de la
// base (P3). Devuelve true si pasa de turnosLLMMax.
func (h *enlace) reservarTurno(sesionID string, ultimoDB int) (int, bool) {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	h.asegurarUso(sesionID)
	u := h.usoMedios[sesionID]
	u.turnos = max(u.turnos, ultimoDB) + 1
	h.usoMedios[sesionID] = u
	return u.turnos, u.turnos > turnosLLMMax
}

// turnosAgotados mira el tope sin reservar (antes de pagar STT de servidor).
func (h *enlace) turnosAgotados(sesionID string) bool {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	return h.usoMedios[sesionID].turnos >= turnosLLMMax
}

func (h *enlace) guardarFotograma(sesionID string, jpg []byte) {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	h.asegurarUso(sesionID)
	u := h.usoMedios[sesionID]
	u.fotos = append(u.fotos, append([]byte(nil), jpg...))
	if len(u.fotos) > fotosPorTurno {
		u.fotos = u.fotos[len(u.fotos)-fotosPorTurno:]
	}
	h.usoMedios[sesionID] = u
}

// tomarFotogramas entrega los fotogramas recibidos desde el turno anterior y
// los suelta: cada imagen va al modelo una sola vez.
func (h *enlace) tomarFotogramas(sesionID string) [][]byte {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	u := h.usoMedios[sesionID]
	fotos := u.fotos
	u.fotos = nil
	if _, ok := h.usoMedios[sesionID]; ok {
		h.usoMedios[sesionID] = u
	}
	return fotos
}

// liberarMedios suelta audio y fotogramas al cortarse el socket. Los
// contadores quedan (topes por sesión, R65 y R66).
func (h *enlace) liberarMedios(sesionID string) {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	if u, ok := h.usoMedios[sesionID]; ok {
		u.fotos, u.audioParcial, u.audioTipo = nil, nil, 0
		h.usoMedios[sesionID] = u
	}
}

func textoDeEnviar(payload []byte) (string, bool) {
	var ev struct {
		Tipo  string `json:"tipo"`
		Datos struct {
			Texto string `json:"texto"`
		} `json:"datos"`
	}
	if json.Unmarshal(payload, &ev) != nil || ev.Tipo != "texto.enviar" {
		return "", false
	}
	return ev.Datos.Texto, true
}

func (h *enlace) contarDescarteTexto(sesionID string) {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	h.asegurarUso(sesionID)
	u := h.usoMedios[sesionID]
	u.descartesTexto++
	h.usoMedios[sesionID] = u
}

func (h *enlace) asegurarUso(sesionID string) {
	if h.usoMedios == nil {
		h.usoMedios = map[string]usoMedios{}
	}
	if _, ok := h.usoMedios[sesionID]; !ok {
		h.usoMedios[sesionID] = usoMedios{}
	}
}

type trama struct {
	ok       bool
	tipo     byte
	flags    byte
	seq      uint32
	longitud uint32
	carga    []byte
}

func tramaEsAudioSubida(tipo byte) bool {
	return tipo == 0x01 || tipo == 0x02
}

// acumularAudioTrama concatena tramas PCM/Opus hasta el bit fin de turno.
func (h *enlace) acumularAudioTrama(sesionID string, t trama) (tipo byte, carga []byte, listo bool) {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	h.asegurarUso(sesionID)
	u := h.usoMedios[sesionID]
	if uint32(len(t.carga)) != t.longitud {
		u.descartesTrama++
		h.usoMedios[sesionID] = u
		return 0, nil, false
	}
	if u.audioTipo != 0 && u.audioTipo != t.tipo {
		u.audioParcial = nil
		u.audioTipo = 0
		u.descartesTrama++
		h.usoMedios[sesionID] = u
		return 0, nil, false
	}
	if len(u.audioParcial)+len(t.carga) > maxCargaAudioTurno {
		u.audioParcial = nil
		u.audioTipo = 0
		u.descartesTrama++
		h.usoMedios[sesionID] = u
		return 0, nil, false
	}
	if len(t.carga) > 0 {
		u.audioTipo = t.tipo
		u.audioParcial = append(u.audioParcial, t.carga...)
	}
	if t.flags&1 == 0 {
		h.usoMedios[sesionID] = u
		return 0, nil, false
	}
	if len(u.audioParcial) == 0 {
		u.audioTipo = 0
		u.descartesTrama++
		h.usoMedios[sesionID] = u
		return 0, nil, false
	}
	out := append([]byte(nil), u.audioParcial...)
	tipoOut := u.audioTipo
	u.audioParcial = nil
	u.audioTipo = 0
	h.usoMedios[sesionID] = u
	return tipoOut, out, true
}

func leerTrama(b []byte) trama {
	if len(b) < encabezadoTrama || b[0] != 'V' || b[1] != 'C' || b[2] != 1 {
		return trama{}
	}
	return trama{
		ok: true, tipo: b[3], flags: b[4],
		seq:      binary.BigEndian.Uint32(b[8:12]),
		longitud: binary.BigEndian.Uint32(b[16:20]),
		carga:    b[encabezadoTrama:],
	}
}

// responderTrama aplica R65. Con un STT de servidor, PCM16 u Opus con fin de
// turno pasan por STT; con voz en el navegador el audio no debería llegar y
// el adaptador nulo devuelve error. Un fotograma aceptado queda en memoria
// para el próximo turno.
func (h *enlace) responderTrama(ctx context.Context, tenant dominio.TenantID, sesionID string, payload []byte, seq *int) respuestaMedios {
	t := leerTrama(payload)
	if t.ok && tramaEsAudioSubida(t.tipo) {
		if !h.prov.Completo() {
			h.contarDescarteTrama(sesionID)
			return respuestaMedios{}
		}
		tipoAudio, carga, listo := h.acumularAudioTrama(sesionID, t)
		if !listo {
			return respuestaMedios{}
		}
		if h.turnosAgotados(sesionID) {
			return h.ejecutarTurnoConTexto(ctx, tenant, sesionID, " ", seq)
		}
		frecuencia := 16000
		if tipoAudio == 0x02 {
			frecuencia = 0 // Opus: el consumo lo mide el adaptador de STT.
		}
		tr, err := h.prov.Transcriptor.Transcribir(ctx, proveedores.Audio{
			PCM: carga, FrecuenciaHz: frecuencia, Final: true,
		})
		if err != nil {
			return soloMensajes(eventoErrorProveedor(siguienteSeq(seq), err))
		}
		texto := tr.Texto
		if texto == "" {
			texto = " "
		}
		return h.ejecutarTurnoConTexto(ctx, tenant, sesionID, texto, seq)
	}
	seqFoto := uint32(0)
	if t.ok {
		seqFoto = t.seq
	}
	motivo := motivoFotograma(t)
	if motivo == "" {
		motivo = h.cupoFotograma(sesionID, h.ahoraDePanel())
		if motivo == "" && h.prov.Completo() {
			h.guardarFotograma(sesionID, t.carga)
		}
	} else {
		h.contarDescarteTrama(sesionID)
	}
	return soloMensajes(eventoFotograma(siguienteSeq(seq), seqFoto, motivo))
}

func motivoFotograma(t trama) string {
	if !t.ok || t.tipo != 0x10 {
		return "formato"
	}
	if t.longitud > bytesMaxFotograma || uint32(len(t.carga)) > bytesMaxFotograma || t.longitud != uint32(len(t.carga)) {
		return "tamano"
	}
	if len(t.carga) < 3 || t.carga[0] != 0xFF || t.carga[1] != 0xD8 || t.carga[2] != 0xFF {
		return "formato"
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(t.carga))
	if err != nil {
		return "formato"
	}
	if cfg.Width > ladoMaxFotogramaPx || cfg.Height > ladoMaxFotogramaPx || cfg.Width < 1 || cfg.Height < 1 {
		return "dimensiones"
	}
	return ""
}

// cupoFotograma deja pasar el primero y descarta el que llega antes de los
// 3000 ms o pasa de 400. El motivo vacío significa aceptado.
func (h *enlace) cupoFotograma(sesionID string, ahora time.Time) string {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	h.asegurarUso(sesionID)
	u := h.usoMedios[sesionID]
	if u.fotogramas >= maxFotogramasSesion {
		u.descartesTrama++
		h.usoMedios[sesionID] = u
		return "tope_sesion"
	}
	espera := time.Duration(intervaloFotogramaMs) * time.Millisecond
	if !u.ultimoFotograma.IsZero() && ahora.Sub(u.ultimoFotograma) < espera {
		u.descartesTrama++
		h.usoMedios[sesionID] = u
		return "frecuencia"
	}
	u.fotogramas++
	u.ultimoFotograma = ahora
	h.usoMedios[sesionID] = u
	return ""
}

func (h *enlace) contarDescarteTrama(sesionID string) {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	h.asegurarUso(sesionID)
	u := h.usoMedios[sesionID]
	u.descartesTrama++
	h.usoMedios[sesionID] = u
}

func siguienteSeq(seq *int) int {
	*seq++
	return *seq
}

func eventoError(seq int) []byte {
	entrada := errores.Buscar(errores.ValidacionFallida)
	return eventoServidor("error", seq, map[string]any{
		"codigo":  string(errores.ValidacionFallida),
		"mensaje": entrada.Mensaje,
	})
}

func eventoCodigo(seq int, cod errores.Codigo) []byte {
	return eventoServidor("error", seq, map[string]any{
		"codigo":  string(cod),
		"mensaje": errores.Buscar(cod).Mensaje,
	})
}

func eventoErrorProveedor(seq int, err error) []byte {
	cod := errores.ValidacionFallida
	if errores.Es(err, errores.ProveedorNoDisponible) {
		cod = errores.ProveedorNoDisponible
	}
	entrada := errores.Buscar(cod)
	return eventoServidor("error", seq, map[string]any{
		"codigo":  string(cod),
		"mensaje": entrada.Mensaje,
	})
}

func eventoFotograma(seq int, seqFoto uint32, motivo string) []byte {
	datos := map[string]any{
		"seq_fotograma": seqFoto,
		"resultado":     "aceptado",
	}
	if motivo != "" {
		datos["resultado"] = "descartado"
		datos["motivo"] = motivo
	}
	return eventoServidor("camara.fotograma", seq, datos)
}

func eventoServidor(tipo string, seq int, datos map[string]any) []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(map[string]any{
		"v": 1, "tipo": tipo, "seq": seq,
		"ts":    time.Now().UTC().Format(time.RFC3339),
		"datos": datos,
	})
	return buf.Bytes()
}
