package rutas

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"time"

	"github.com/coder/websocket"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/proveedores"
)

const (
	plazoAutenticarMedios = 5 * time.Second
	topeTextoMedios       = 16 << 10
	topeTramaMedios       = 20 + 128<<10
	encabezadoTrama       = 20

	cierreToken   websocket.StatusCode = 4401
	cierreOrigin  websocket.StatusCode = 4403
	cierreTiempo  websocket.StatusCode = 4408
	cierreCerrada websocket.StatusCode = 4409
)

var reTokenMedios = regexp.MustCompile(`^vc_med_[A-Za-z0-9_-]{43}$`)

// conectarMedios es el handshake de GET .../medios. El token no se lee de la
// URL. Después de sesion.lista se descartan el texto y los fotogramas que se
// pasan de los topes (R65, R66) y cada texto.enviar válido es un turno del
// orquestador (T25, socket_entrada.go). No se guarda audio ni JPEG, ni se
// loguea el token.
func (h *enlace) conectarMedios(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(topeTextoMedios)

	datos, err := h.almacen.BuscarDatosMedios(r.Context(), r.PathValue("sesion_id"))
	if err != nil {
		cerrarMedios(conn, cierreToken, "sesion")
		return
	}
	// R55: la lista es la de la clave que creó la sesión. La secreta no tiene
	// orígenes y el handshake sin Origin es válido; cualquier Origin, no.
	if !origenDeSesion(datos.Origenes, r.Header.Get("Origin")) {
		cerrarMedios(conn, cierreOrigin, "origin")
		return
	}
	if datos.Estado == dominio.EstadoCerrada {
		cerrarMedios(conn, cierreCerrada, "cerrada")
		return
	}

	leer, cancelar := context.WithCancel(r.Context())
	defer cancelar()
	// El contexto corto cierra el socket sin código (la librería aborta al
	// vencer). El plazo se cumple cerrando con 4408 desde otro goroutine.
	plazo := time.AfterFunc(h.plazoDelHandshake(), func() {
		cerrarMedios(conn, cierreTiempo, "tiempo")
	})
	tipo, payload, err := conn.Read(leer)
	aTiempo := plazo.Stop()
	if err != nil || !aTiempo {
		return
	}
	token, ok := tokenDelHandshake(tipo, payload)
	if !ok {
		cerrarMedios(conn, cierreToken, "autenticar")
		return
	}
	if err := h.almacen.ConsumirTokenMedios(r.Context(), datos.TenantID, r.PathValue("sesion_id"), claves.HMAC(h.clave.Revelar(), token), h.ahoraDePanel()); err != nil {
		cerrarMedios(conn, cierreToken, "token")
		return
	}
	if err := conn.Write(r.Context(), websocket.MessageText, eventoLista(r.PathValue("sesion_id"), modoSTT(h.prov.Transcriptor))); err != nil {
		return
	}
	// Recién acá se pueden llamar proveedores (eventos-sesion.md §1.4).
	h.atenderMedios(conn, r, datos.TenantID, r.PathValue("sesion_id"))
}

func (h *enlace) plazoDelHandshake() time.Duration {
	if h.plazoAutenticar > 0 {
		return h.plazoAutenticar
	}
	return plazoAutenticarMedios
}

func origenDeSesion(lista []string, origin string) bool {
	if len(lista) == 0 {
		return origin == ""
	}
	for _, o := range lista {
		if o == origin {
			return true
		}
	}
	return false
}

func cerrarMedios(c *websocket.Conn, codigo websocket.StatusCode, motivo string) {
	_ = c.Close(codigo, motivo)
}

// tokenDelHandshake exige el primer mensaje de texto. Un texto con < o > no
// se interpreta ni se devuelve: el cierre usa un motivo fijo.
func tokenDelHandshake(tipo websocket.MessageType, payload []byte) (string, bool) {
	if tipo != websocket.MessageText || len(payload) == 0 || bytes.ContainsAny(payload, "<>") {
		return "", false
	}
	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.DisallowUnknownFields()
	var ev struct {
		V     int     `json:"v"`
		Tipo  string  `json:"tipo"`
		Seq   *uint32 `json:"seq"`
		Ts    string  `json:"ts"`
		Datos struct {
			Token string `json:"token_medios"`
		} `json:"datos"`
	}
	if err := dec.Decode(&ev); err != nil || dec.More() {
		return "", false
	}
	ts, err := time.Parse(time.RFC3339, ev.Ts)
	if err != nil {
		return "", false
	}
	_, off := ts.Zone()
	if ev.V != 1 || ev.Tipo != "sesion.autenticar" || ev.Seq == nil || off != 0 || !reTokenMedios.MatchString(ev.Datos.Token) {
		return "", false
	}
	return ev.Datos.Token, true
}

// modoSTT dice quién transcribe la voz del cliente: "navegador" (el cliente
// manda texto.enviar) o "servidor" (el cliente manda tramas PCM16 0x01).
func modoSTT(t proveedores.Transcriptor) string {
	if v, ok := t.(proveedores.VozEnCliente); t == nil || ok && v.VozEnCliente() {
		return "navegador"
	}
	return "servidor"
}

func eventoLista(sesionID, stt string) []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(map[string]any{
		"v":    1,
		"tipo": "sesion.lista",
		"seq":  1,
		"ts":   time.Now().UTC().Format(time.RFC3339),
		"datos": map[string]any{
			"sesion_id": sesionID,
			"limites":   limitesProvisorios(),
			"stt":       stt,
		},
	})
	return buf.Bytes()
}
