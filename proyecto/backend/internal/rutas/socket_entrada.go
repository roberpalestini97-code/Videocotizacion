package rutas

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"image/jpeg"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/coder/websocket"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/turno"
)

// usoMedios es el conteo de la sesión en este proceso. No persiste el texto
// ni el JPEG: un exceso se descarta y no llama a proveedores.
type usoMedios struct {
	turnos          int
	descartesTexto  int
	fotogramas      int
	descartesTrama  int
	ultimoFotograma time.Time
	audioTipo       byte
	audioParcial    []byte
}

const maxCargaAudioTurno = 128 << 10 // eventos-sesion.md: carga útil ≤ 128 KiB por trama; tope por turno

// atenderMedios lee lo que sigue a sesion.lista. El texto no puede pasar de
// 16 KiB ni la trama de 20 B + 128 KiB: el exceso cierra con 1009.
func (h *enlace) atenderMedios(conn *websocket.Conn, r *http.Request, tenant dominio.TenantID, sesionID string) {
	conn.SetReadLimit(topeTramaMedios)
	seq := 1
	for {
		tipo, payload, err := conn.Read(r.Context())
		if err != nil {
			return
		}
		if tipo == websocket.MessageText && len(payload) > topeTextoMedios {
			cerrarMedios(conn, websocket.StatusMessageTooBig, "tamano")
			return
		}
		var msgs [][]byte
		switch tipo {
		case websocket.MessageText:
			msgs = h.responderTexto(r.Context(), tenant, sesionID, payload, &seq)
		case websocket.MessageBinary:
			msgs = h.responderTrama(r.Context(), tenant, sesionID, payload, &seq)
		}
		for _, msg := range msgs {
			if len(msg) == 0 {
				continue
			}
			if err := conn.Write(r.Context(), websocket.MessageText, msg); err != nil {
				return
			}
		}
	}
}

// responderTexto aplica R66. Un texto válido no es error de tope, pero tampoco
// llama al LLM. MotivoCierre no tiene un corte por turnos: el que pasa de 60
// recibe error y la sesión sigue.
func (h *enlace) responderTexto(ctx context.Context, tenant dominio.TenantID, sesionID string, payload []byte, seq *int) [][]byte {
	texto, es := textoDeEnviar(payload)
	if !es {
		return nil
	}
	if utf8.RuneCountInString(texto) > caracteresMaxPorTurno || strings.ContainsAny(texto, "<>") {
		h.contarDescarteTexto(sesionID)
		return [][]byte{eventoError(siguienteSeq(seq))}
	}
	if h.turnoDeMas(sesionID) {
		return [][]byte{eventoError(siguienteSeq(seq))}
	}
	if !h.prov.Completo() {
		return nil
	}
	return h.ejecutarTurnoConTexto(ctx, tenant, sesionID, texto, seq)
}

func (h *enlace) ejecutarTurnoConTexto(ctx context.Context, tenant dominio.TenantID, sesionID, texto string, seq *int) [][]byte {
	n := h.numeroTurno(sesionID)
	var ses *dominio.Sesion
	var oficio dominio.Oficio
	var ultimaSalida []byte
	if s, err := h.almacen.LeerSesion(ctx, tenant, sesionID); err == nil {
		ses = &s
		if as, err := h.almacen.LeerAsesor(ctx, tenant, s.AsesorID); err == nil {
			oficio = prompts.OficioDelTurno(s.AvatarID, as.Oficios)
		}
		if resps, err := h.almacen.ListarRespuestasModeloDeSesion(ctx, tenant, sesionID); err == nil && len(resps) > 0 {
			ultimaSalida = resps[len(resps)-1].SalidaJSON
		}
	}
	sal, err := turno.DesdeTexto(ctx, turno.TextoEntrada{
		Numero: n, Texto: texto, Oficio: oficio, UltimaSalidaLLM: ultimaSalida,
		Prov: h.prov, Sesion: ses, Cot: h.cot, Ahora: h.ahoraDePanel(),
	})
	if err != nil {
		return [][]byte{eventoErrorProveedor(siguienteSeq(seq), err)}
	}
	if len(sal.SalidaLLM) > 0 {
		if err := h.almacen.AnexarRespuestaModelo(ctx, tenant, dominio.RespuestaModelo{
			SesionID: sesionID, Turno: n, RegistradaEn: h.ahoraDePanel(), SalidaJSON: sal.SalidaLLM,
		}); err != nil && !errores.Es(err, errores.EstadoInvalido) {
			h.log.Warn("guardar respuesta del modelo", "err", err, "sesion", sesionID)
		}
	}
	if sal.Cotizacion != nil {
		if err := h.almacen.GuardarCotizacion(ctx, tenant, *sal.Cotizacion); err != nil && !errores.Es(err, errores.EstadoInvalido) {
			h.log.Warn("guardar cotización del turno", "err", err, "sesion", sesionID)
		}
	}
	out := make([][]byte, 0, len(sal.Eventos)+1)
	for _, ev := range sal.Eventos {
		out = append(out, eventoServidor(ev.Tipo, siguienteSeq(seq), ev.Datos))
	}
	if sal.Cotizacion != nil && ses != nil {
		if as, err := h.almacen.LeerAsesor(ctx, tenant, ses.AsesorID); err == nil {
			if der, err := mapaDerivacionWhatsApp(ses.ID, as.WhatsApp, h.ahoraDePanel()); err == nil {
				out = append(out, eventoServidor("cotizacion.emitida", siguienteSeq(seq), map[string]any{
					"cotizacion": mapaCotizacionContrato(*sal.Cotizacion),
					"derivacion": der,
				}))
			}
		}
	}
	return out
}

func (h *enlace) numeroTurno(sesionID string) int {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	h.asegurarUso(sesionID)
	return h.usoMedios[sesionID].turnos
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

// turnoDeMas cuenta el texto aceptado como descarte (no hay proveedor).
// Devuelve true si ya se habían aceptado turnosLLMMax y este no entra.
func (h *enlace) turnoDeMas(sesionID string) bool {
	h.mediosMu.Lock()
	defer h.mediosMu.Unlock()
	h.asegurarUso(sesionID)
	u := h.usoMedios[sesionID]
	u.descartesTexto++
	if u.turnos >= turnosLLMMax {
		h.usoMedios[sesionID] = u
		return true
	}
	u.turnos++
	h.usoMedios[sesionID] = u
	return false
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

// responderTrama aplica R65. Con proveedores, PCM16 u Opus con fin de turno
// pasan por STT (en dev el falso no decodifica Opus; T13 decodifica en prod).
func (h *enlace) responderTrama(ctx context.Context, tenant dominio.TenantID, sesionID string, payload []byte, seq *int) [][]byte {
	t := leerTrama(payload)
	if t.ok && tramaEsAudioSubida(t.tipo) {
		if !h.prov.Completo() {
			h.contarDescarteTrama(sesionID)
			return nil
		}
		tipoAudio, carga, listo := h.acumularAudioTrama(sesionID, t)
		if !listo {
			return nil
		}
		if h.turnoDeMas(sesionID) {
			return [][]byte{eventoError(siguienteSeq(seq))}
		}
		frecuencia := 16000
		if tipoAudio == 0x02 {
			frecuencia = 0 // Opus: consumo STT real lo mide el adaptador (T13).
		}
		tr, err := h.prov.Transcriptor.Transcribir(ctx, proveedores.Audio{
			PCM: carga, FrecuenciaHz: frecuencia, Final: true,
		})
		if err != nil {
			return [][]byte{eventoErrorProveedor(siguienteSeq(seq), err)}
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
	} else {
		h.contarDescarteTrama(sesionID)
	}
	return [][]byte{eventoFotograma(siguienteSeq(seq), seqFoto, motivo)}
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
