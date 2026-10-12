package rutas

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/proveedores/falsos"
)

func TestHandshakeMedios(t *testing.T) {
	_, tr, ex, si, me := falsos.Conjunto()
	t.Cleanup(func() {
		if tr.Llamadas() != 0 || ex.Llamadas() != 0 || si.Llamadas() != 0 || me.Llamadas() != 0 {
			t.Fatalf("proveedores llamados: stt %d llm %d tts %d whatsapp %d", tr.Llamadas(), ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})

	g := nuevaFixtureSesion(t)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)

	idA, _, tokA := sesionConMedios(t, g, true)
	idB, sesB, tokB := sesionConMedios(t, g, true)
	leida, err := g.alm.LeerSesion(t.Context(), g.tenant, idA)
	if err != nil || !strings.HasPrefix(leida.ClaveID, "cpw_") || len(leida.Origenes) != 1 || leida.Origenes[0] != g.origen {
		t.Fatalf("la sesión no guardó la clave pública: %+v %v", leida, err)
	}

	exigirCierreMedios(t, dialMedios(t, srv, idA, "https://otro.ejemplo.local", ""), cierreOrigin)
	if revocado(t, g, tokA) {
		t.Fatal("un Origin ajeno consumió el token")
	}

	exigirCierreMedios(t, enviarToken(t, dialMedios(t, srv, idA, g.origen, "token_medios="+tokA), "vc_med_"+strings.Repeat("a", 43)), cierreToken)
	if revocado(t, g, tokA) {
		t.Fatal("el token de la URL se usó")
	}

	exigirCierreMedios(t, enviarToken(t, dialMedios(t, srv, idA, g.origen, ""), tokB), cierreToken)
	if revocado(t, g, tokB) {
		t.Fatal("se consumió el token de la otra sesión")
	}

	conn := enviarToken(t, dialMedios(t, srv, idA, g.origen, ""), tokA)
	exigirLista(t, conn, idA, tokA)
	conn.CloseNow()
	if !revocado(t, g, tokA) {
		t.Fatal("el token válido tiene que quedar de un solo uso")
	}
	exigirCierreMedios(t, enviarToken(t, dialMedios(t, srv, idA, g.origen, ""), tokA), cierreToken)

	conn = enviarToken(t, dialMedios(t, srv, idB, g.origen, ""), tokB)
	exigirLista(t, conn, idB, tokB)
	conn.CloseNow()

	if rr := g.cerrar(sesB, idB, "cliente_cerro"); rr.Code != http.StatusOK {
		t.Fatalf("cerrar: %d %s", rr.Code, rr.Body)
	}
	exigirCierreMedios(t, dialMedios(t, srv, idB, g.origen, ""), cierreCerrada)

	idS, _, tokS := sesionConMedios(t, g, false)
	leida, err = g.alm.LeerSesion(t.Context(), g.tenant, idS)
	if err != nil || !strings.HasPrefix(leida.ClaveID, "cse_") || leida.Origenes != nil {
		t.Fatalf("la secreta no debía guardar Origin: %+v %v", leida, err)
	}
	conn = enviarToken(t, dialMedios(t, srv, idS, "", ""), tokS)
	exigirLista(t, conn, idS, tokS)
	conn.CloseNow()
	exigirCierreMedios(t, dialMedios(t, srv, idS, g.origen, ""), cierreOrigin)

	idT, _, _ := sesionConMedios(t, g, true)
	g.hdl.plazoAutenticar = 40 * time.Millisecond
	exigirCierreMedios(t, dialMedios(t, srv, idT, g.origen, ""), cierreTiempo)
	g.hdl.plazoAutenticar = 0

	malo := []byte(`{"v":1,"tipo":"sesion.autenticar","seq":1,"ts":"2026-10-08T13:00:00Z","datos":{"token_medios":"<script>"}}`)
	c := dialMedios(t, srv, idT, g.origen, "")
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	if err := c.Write(ctx, websocket.MessageText, malo); err != nil {
		cancelar()
		t.Fatal(err)
	}
	cancelar()
	exigirCierreMedios(t, c, cierreToken)
}

func sesionConMedios(t *testing.T, g *fixSesion, publica bool) (sesionID, tokenSesion, tokenMedios string) {
	t.Helper()
	var rr *httptest.ResponseRecorder
	if publica {
		rr = g.pedir(g.pub, g.origen, g.desafioResuelto(t), "", g.cuerpo("3d"), false)
	} else {
		rr = g.pedir(g.sec, "", "", "", g.cuerpo("3d"), true)
	}
	creada := exigirCreada(t, g, rr)
	if c := g.consentir(creada.Token.Valor, creada.SesionID, consentimientoValido()); c.Code != http.StatusCreated {
		t.Fatalf("consentir: %d %s", c.Code, c.Body)
	}
	m := exigirTokenMedios(t, g.medios(creada.Token.Valor, creada.SesionID), creada.SesionID)
	return creada.SesionID, creada.Token.Valor, m.Token
}

func dialMedios(t *testing.T, srv *httptest.Server, sesionID, origin, rawQuery string) *websocket.Conn {
	t.Helper()
	u := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/sesiones/" + sesionID + "/medios"
	if rawQuery != "" {
		u += "?" + rawQuery
	}
	ctx, cancelar := context.WithTimeout(context.Background(), 3*time.Second)
	t.Cleanup(cancelar)
	var hdr http.Header
	if origin != "" {
		hdr = http.Header{"Origin": {origin}}
	}
	conn, _, err := websocket.Dial(ctx, u, &websocket.DialOptions{HTTPHeader: hdr})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { conn.CloseNow() })
	return conn
}

func enviarToken(t *testing.T, conn *websocket.Conn, token string) *websocket.Conn {
	t.Helper()
	cuerpo, err := json.Marshal(map[string]any{
		"v": 1, "tipo": "sesion.autenticar", "seq": 1,
		"ts":    time.Now().UTC().Format(time.RFC3339),
		"datos": map[string]string{"token_medios": token},
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelar()
	if err := conn.Write(ctx, websocket.MessageText, cuerpo); err != nil {
		t.Fatal(err)
	}
	return conn
}

func exigirCierreMedios(t *testing.T, conn *websocket.Conn, codigo websocket.StatusCode) {
	t.Helper()
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelar()
	_, _, err := conn.Read(ctx)
	if websocket.CloseStatus(err) != codigo {
		t.Fatalf("cierre %d: %v", codigo, err)
	}
	var ce websocket.CloseError
	if errors.As(err, &ce) && (strings.ContainsAny(ce.Reason, "<>") || strings.Contains(ce.Reason, "vc_")) {
		t.Fatal("el cierre ecoa datos")
	}
}

func exigirLista(t *testing.T, conn *websocket.Conn, sesionID, token string) {
	t.Helper()
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelar()
	tipo, p, err := conn.Read(ctx)
	if err != nil || tipo != websocket.MessageText {
		t.Fatalf("lista: %v", err)
	}
	if strings.Contains(string(p), token) || strings.Contains(string(p), "telefono") || strings.Contains(string(p), "email") {
		t.Fatal("sesion.lista incluye datos que no van")
	}
	var ev struct {
		V     int    `json:"v"`
		Tipo  string `json:"tipo"`
		Seq   int    `json:"seq"`
		Ts    string `json:"ts"`
		Datos struct {
			SesionID string `json:"sesion_id"`
			Limites  struct {
				SinVoz     int `json:"sin_voz_s"`
				Duracion   int `json:"duracion_maxima_s"`
				Caracteres int `json:"caracteres_max_por_turno"`
				Turnos     int `json:"turnos_llm_max"`
				Fotograma  struct {
					Formato   string `json:"formato"`
					Lado      int    `json:"lado_max_px"`
					Bytes     int    `json:"bytes_max"`
					Intervalo int    `json:"intervalo_min_ms"`
					Max       int    `json:"max_por_sesion"`
				} `json:"fotograma"`
			} `json:"limites"`
		} `json:"datos"`
	}
	if err := json.Unmarshal(p, &ev); err != nil {
		t.Fatal(err)
	}
	ts, err := time.Parse(time.RFC3339, ev.Ts)
	if err != nil || !strings.HasSuffix(ev.Ts, "Z") || ts.Location() != time.UTC {
		t.Fatalf("ts: %s", ev.Ts)
	}
	f := ev.Datos.Limites.Fotograma
	if ev.V != 1 || ev.Tipo != "sesion.lista" || ev.Seq != 1 || ev.Datos.SesionID != sesionID ||
		ev.Datos.Limites.SinVoz != sinVozProvisorioS || ev.Datos.Limites.Duracion != 900 ||
		ev.Datos.Limites.Caracteres != 500 || ev.Datos.Limites.Turnos != 60 ||
		f.Formato != "image/jpeg" || f.Lado != 1024 || f.Bytes != 131072 || f.Intervalo != 3000 || f.Max != 400 {
		t.Fatalf("evento: %+v", ev)
	}
}

func revocado(t *testing.T, g *fixSesion, token string) bool {
	t.Helper()
	hall, err := g.alm.BuscarTokenPorHash(t.Context(), claves.HMAC(g.claveSrv, token))
	if err != nil {
		t.Fatal(err)
	}
	return hall.Revocado
}
