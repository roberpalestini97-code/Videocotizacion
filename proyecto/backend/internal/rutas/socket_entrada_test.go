package rutas

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/falsos"
)

func TestTextoTurnoConProveedoresFalsos(t *testing.T) {
	c, tr, ex, si, me := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)
	t.Cleanup(func() {
		if tr.Llamadas() != 0 {
			t.Fatalf("STT llamado %d veces", tr.Llamadas())
		}
		if ex.Llamadas() != 1 || si.Llamadas() != 1 || me.Llamadas() != 0 {
			t.Fatalf("llm %d tts %d wa %d", ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)

	escribirTexto(t, conn, 2, "Quiero pintar el living")
	for _, want := range []string{"transcripcion.final", "pizarron.actualizado", "avatar.respuesta", "avatar.visemas"} {
		if ev := leerEvento(t, conn); ev.Tipo != want {
			t.Fatalf("esperaba %s: %+v", want, ev)
		}
	}
}

func TestAudioFinTurnoConProveedoresFalsos(t *testing.T) {
	c, tr, ex, si, me := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)
	t.Cleanup(func() {
		if tr.Llamadas() != 1 {
			t.Fatalf("STT llamado %d veces", tr.Llamadas())
		}
		if ex.Llamadas() != 1 || si.Llamadas() != 1 || me.Llamadas() != 0 {
			t.Fatalf("llm %d tts %d wa %d", ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)

	pcm := []byte{0, 0, 1, 0, 0, 0}
	escribirBinario(t, conn, tramaAudioPCM(2, pcm, true))
	for _, want := range []string{"transcripcion.final", "pizarron.actualizado", "avatar.respuesta", "avatar.visemas"} {
		if ev := leerEvento(t, conn); ev.Tipo != want {
			t.Fatalf("esperaba %s: %+v", want, ev)
		}
	}
}

func TestTextoTurnoMaterialPaisajismoEnSegundoTurno(t *testing.T) {
	c, _, ex, si, me := falsos.Conjunto()
	paisajismo, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "05-paisajismo-tecnico-planos-largo-plazo.json"))
	if err != nil {
		t.Fatal(err)
	}
	pintura, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(paisajismo)
	cap := &pedidoCaptor{Extractor: c.Extractor}
	c.Extractor = cap
	t.Cleanup(func() {
		if ex.Llamadas() != 2 || si.Llamadas() != 2 || me.Llamadas() != 0 {
			t.Fatalf("llm %d tts %d wa %d", ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)

	escribirTexto(t, conn, 2, "Quiero diseño de jardín con plano")
	for range 4 {
		leerEvento(t, conn)
	}

	ex.JSON = string(pintura)
	escribirTexto(t, conn, 6, "Son 1200 metros en Cobo")
	for range 4 {
		leerEvento(t, conn)
	}

	if cap.ultimo.VersionPrompt != "conducta_paisajismo@5cc33b65b089" {
		t.Fatalf("segundo turno debía usar prompt paisajismo: %+v", cap.ultimo)
	}
	if cap.ultimo.CuerpoPrompt == "" || !strings.Contains(cap.ultimo.CuerpoPrompt, "paisajismo") {
		t.Fatalf("cuerpo prompt: %.80q…", cap.ultimo.CuerpoPrompt)
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

func TestTextoTurnoPersisteRespuestaModelo(t *testing.T) {
	c, _, ex, _, _ := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)
	escribirTexto(t, conn, 2, "Quiero pintar el living")
	for range 4 {
		leerEvento(t, conn)
	}

	resps, err := g.a.ListarRespuestasModeloDeSesion(t.Context(), g.tenant, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(resps) != 1 || resps[0].Turno != 1 || len(resps[0].SalidaJSON) == 0 {
		t.Fatalf("respuestas: %+v", resps)
	}
	if !strings.Contains(string(resps[0].SalidaJSON), "pintura_interior") {
		t.Fatalf("salida: %s", resps[0].SalidaJSON)
	}
}

func TestTextoTurnoGuardaCotizacion(t *testing.T) {
	c, _, ex, _, _ := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "02-fachada-altura-emitir.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)
	cot := cotizadorDePrueba(t)
	g := nuevaFixtureSesionTopeProv(t, 5, c, cot)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, tokSes, tokMed := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tokMed)
	exigirLista(t, conn, id, tokMed)
	escribirTexto(t, conn, 2, "Fachada completa en Mar del Plata")
	for _, want := range []string{"transcripcion.final", "pizarron.actualizado", "avatar.respuesta", "avatar.visemas", "cotizacion.emitida"} {
		if ev := leerEvento(t, conn); ev.Tipo != want {
			t.Fatalf("esperaba %s: %+v", want, ev)
		}
	}
	rr := g.leer(tokSes, id)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET sesión: %d", rr.Code)
	}
	rr = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/sesiones/"+id+"/cotizacion", nil)
	req.SetPathValue("sesion_id", id)
	req.Header.Set("Authorization", "Bearer "+tokSes)
	g.h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET cotización: %d %s", rr.Code, rr.Body)
	}
}

func TestDescarteDeTextoYFotograma(t *testing.T) {
	_, tr, ex, si, me := falsos.Conjunto()
	t.Cleanup(func() {
		if tr.Llamadas() != 0 || ex.Llamadas() != 0 || si.Llamadas() != 0 || me.Llamadas() != 0 {
			t.Fatalf("proveedores llamados: stt %d llm %d tts %d whatsapp %d", tr.Llamadas(), ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})

	g := nuevaFixtureSesion(t)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)

	largo := strings.Repeat("a", caracteresMaxPorTurno+1)
	escribirTexto(t, conn, 2, largo)
	ev := leerEvento(t, conn)
	if ev.Tipo != "error" || ev.Datos.Codigo != string(errores.ValidacionFallida) || ev.Datos.Mensaje != errores.Buscar(errores.ValidacionFallida).Mensaje {
		t.Fatalf("texto largo: %+v", ev)
	}
	if strings.Contains(ev.crudo, largo) {
		t.Fatal("el error ecoa el texto")
	}
	leida, err := g.a.LeerSesion(t.Context(), g.tenant, id)
	if err != nil || leida.Estado != dominio.EstadoEnCurso {
		t.Fatalf("la sesión no sigue en curso: %v %+v", err, leida)
	}

	marca := "marca-unica-<no-volver"
	escribirTexto(t, conn, 3, marca)
	ev = leerEvento(t, conn)
	if ev.Tipo != "error" || ev.Datos.Codigo != "validacion_fallida" || strings.Contains(ev.crudo, "marca-unica") || strings.Contains(ev.crudo, "<") {
		t.Fatalf("texto con marca: %s", ev.crudo)
	}

	jpg := jpegDe1x1(t)
	escribirBinario(t, conn, tramaFotograma(1, jpg))
	ev = leerEvento(t, conn)
	if ev.Tipo != "camara.fotograma" || ev.Datos.Resultado != "aceptado" || ev.Datos.Motivo == "formato" {
		t.Fatalf("jpeg: %+v", ev)
	}
	escribirBinario(t, conn, tramaFotograma(2, jpg))
	ev = leerEvento(t, conn)
	if ev.Tipo != "camara.fotograma" || ev.Datos.Resultado != "descartado" || ev.Datos.Motivo != "frecuencia" {
		t.Fatalf("frecuencia: %+v", ev)
	}
	escribirBinario(t, conn, tramaFotograma(3, []byte("esto no es un jpeg")))
	ev = leerEvento(t, conn)
	if ev.Tipo != "camara.fotograma" || ev.Datos.Resultado != "descartado" || ev.Datos.Motivo != "formato" {
		t.Fatalf("formato: %+v", ev)
	}
}

func escribirTexto(t *testing.T, conn *websocket.Conn, seq int, texto string) string {
	t.Helper()
	cuerpo, err := json.Marshal(map[string]any{
		"v": 1, "tipo": "texto.enviar", "seq": seq,
		"ts":    time.Now().UTC().Format(time.RFC3339),
		"datos": map[string]string{"texto": texto},
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelar()
	if err := conn.Write(ctx, websocket.MessageText, cuerpo); err != nil {
		t.Fatal(err)
	}
	return string(cuerpo)
}

func escribirBinario(t *testing.T, conn *websocket.Conn, payload []byte) {
	t.Helper()
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelar()
	if err := conn.Write(ctx, websocket.MessageBinary, payload); err != nil {
		t.Fatal(err)
	}
}

func TestOpusFinTurnoConProveedoresFalsos(t *testing.T) {
	c, tr, ex, si, me := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)
	tr.Texto = "Quiero pintar desde opus"
	t.Cleanup(func() {
		if tr.Llamadas() != 1 {
			t.Fatalf("STT llamado %d veces", tr.Llamadas())
		}
		if ex.Llamadas() != 1 || si.Llamadas() != 1 || me.Llamadas() != 0 {
			t.Fatalf("llm %d tts %d wa %d", ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)
	escribirBinario(t, conn, tramaAudioOpus(2, []byte{0x4f, 0x70, 0x75, 0x73}, true))
	for _, want := range []string{"transcripcion.final", "pizarron.actualizado", "avatar.respuesta", "avatar.visemas"} {
		if ev := leerEvento(t, conn); ev.Tipo != want {
			t.Fatalf("esperaba %s: %+v", want, ev)
		}
	}
}

func TestPCMVariasTramasAntesFinTurno(t *testing.T) {
	c, tr, ex, si, me := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)
	tr.Texto = "Audio en dos tramas"
	t.Cleanup(func() {
		if tr.Llamadas() != 1 || ex.Llamadas() != 1 || si.Llamadas() != 1 || me.Llamadas() != 0 {
			t.Fatalf("stt %d llm %d tts %d wa %d", tr.Llamadas(), ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)
	escribirBinario(t, conn, tramaAudioPCM(2, []byte{0, 1}, false))
	escribirBinario(t, conn, tramaAudioPCM(3, []byte{2, 3, 4}, true))
	for _, want := range []string{"transcripcion.final", "pizarron.actualizado", "avatar.respuesta", "avatar.visemas"} {
		if ev := leerEvento(t, conn); ev.Tipo != want {
			t.Fatalf("esperaba %s: %+v", want, ev)
		}
	}
}

func TestPCMVariasTramasPersisteRespuestaModelo(t *testing.T) {
	c, _, ex, _, _ := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)
	escribirBinario(t, conn, tramaAudioPCM(2, []byte{0, 1}, false))
	escribirBinario(t, conn, tramaAudioPCM(3, []byte{2, 3}, true))
	for range 4 {
		leerEvento(t, conn)
	}

	resps, err := g.a.ListarRespuestasModeloDeSesion(t.Context(), g.tenant, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(resps) != 1 || resps[0].Turno != 1 {
		t.Fatalf("respuestas: %+v", resps)
	}
}

func TestOpusVariasTramasPersisteRespuestaModelo(t *testing.T) {
	c, _, ex, _, _ := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)
	escribirBinario(t, conn, tramaAudioOpus(2, []byte{1}, false))
	escribirBinario(t, conn, tramaAudioOpus(3, []byte{2, 3}, true))
	for range 4 {
		leerEvento(t, conn)
	}

	resps, err := g.a.ListarRespuestasModeloDeSesion(t.Context(), g.tenant, id)
	if err != nil || len(resps) != 1 || resps[0].Turno != 1 {
		t.Fatalf("respuestas: %+v %v", resps, err)
	}
}

func TestOpusVariasTramasAntesFinTurno(t *testing.T) {
	c, tr, ex, si, me := falsos.Conjunto()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	ex.JSON = string(raw)
	tr.Texto = "Opus en dos tramas"
	t.Cleanup(func() {
		if tr.Llamadas() != 1 || ex.Llamadas() != 1 || si.Llamadas() != 1 || me.Llamadas() != 0 {
			t.Fatalf("stt %d llm %d tts %d wa %d", tr.Llamadas(), ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})
	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)
	escribirBinario(t, conn, tramaAudioOpus(2, []byte{1, 2}, false))
	escribirBinario(t, conn, tramaAudioOpus(3, []byte{3, 4, 5}, true))
	for _, want := range []string{"transcripcion.final", "pizarron.actualizado", "avatar.respuesta", "avatar.visemas"} {
		if ev := leerEvento(t, conn); ev.Tipo != want {
			t.Fatalf("esperaba %s: %+v", want, ev)
		}
	}
}

func TestAudioCambiaTipoDescartaBuffer(t *testing.T) {
	c, tr, ex, si, me := falsos.Conjunto()
	t.Cleanup(func() {
		if tr.Llamadas() != 0 || ex.Llamadas() != 0 || si.Llamadas() != 0 || me.Llamadas() != 0 {
			t.Fatalf("stt %d llm %d tts %d wa %d", tr.Llamadas(), ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})
	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)
	escribirBinario(t, conn, tramaAudioPCM(2, []byte{0, 1}, false))
	escribirBinario(t, conn, tramaAudioOpus(3, []byte{0x4f}, true))
}

func TestOpusSinFinTurnoNoDisparaSTT(t *testing.T) {
	c, tr, ex, si, me := falsos.Conjunto()
	t.Cleanup(func() {
		if tr.Llamadas() != 0 || ex.Llamadas() != 0 || si.Llamadas() != 0 || me.Llamadas() != 0 {
			t.Fatalf("proveedores: stt %d llm %d tts %d wa %d", tr.Llamadas(), ex.Llamadas(), si.Llamadas(), me.Llamadas())
		}
	})

	g := nuevaFixtureSesionTopeProv(t, 5, c, nil)
	srv := httptest.NewServer(g.h)
	t.Cleanup(srv.Close)
	id, _, tok := sesionConMedios(t, g, true)
	conn := enviarToken(t, dialMedios(t, srv, id, g.origen, ""), tok)
	exigirLista(t, conn, id, tok)
	escribirBinario(t, conn, tramaAudioOpus(2, []byte{0x4f, 0x70, 0x75, 0x73}, false))
}

func tramaAudioOpus(seq uint32, opus []byte, finTurno bool) []byte {
	b := make([]byte, encabezadoTrama+len(opus))
	b[0], b[1], b[2], b[3] = 'V', 'C', 1, 0x02
	if finTurno {
		b[4] = 1
	}
	binary.BigEndian.PutUint32(b[8:12], seq)
	binary.BigEndian.PutUint32(b[16:20], uint32(len(opus)))
	copy(b[encabezadoTrama:], opus)
	return b
}

func tramaAudioPCM(seq uint32, pcm []byte, finTurno bool) []byte {
	b := make([]byte, encabezadoTrama+len(pcm))
	b[0], b[1], b[2], b[3] = 'V', 'C', 1, 0x01
	if finTurno {
		b[4] = 1
	}
	binary.BigEndian.PutUint32(b[8:12], seq)
	binary.BigEndian.PutUint32(b[16:20], uint32(len(pcm)))
	copy(b[encabezadoTrama:], pcm)
	return b
}

func tramaFotograma(seq uint32, carga []byte) []byte {
	b := make([]byte, encabezadoTrama+len(carga))
	b[0], b[1], b[2], b[3] = 'V', 'C', 1, 0x10
	binary.BigEndian.PutUint32(b[8:12], seq)
	binary.BigEndian.PutUint32(b[16:20], uint32(len(carga)))
	copy(b[encabezadoTrama:], carga)
	return b
}

func jpegDe1x1(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 1, 1)), &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

type eventoLeido struct {
	Tipo  string `json:"tipo"`
	crudo string
	Datos struct {
		Codigo    string `json:"codigo"`
		Mensaje   string `json:"mensaje"`
		Resultado string `json:"resultado"`
		Motivo    string `json:"motivo"`
		SeqFoto   uint32 `json:"seq_fotograma"`
	} `json:"datos"`
}

func leerEvento(t *testing.T, conn *websocket.Conn) eventoLeido {
	t.Helper()
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelar()
	tipo, p, err := conn.Read(ctx)
	if err != nil || tipo != websocket.MessageText {
		t.Fatalf("evento: %v %s", err, p)
	}
	var ev eventoLeido
	if err := json.Unmarshal(p, &ev); err != nil {
		t.Fatal(err)
	}
	ev.crudo = string(p)
	return ev
}
