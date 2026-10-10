package rutas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/proveedores/falsos"
)

func TestCortePorSilencioYDuracion(t *testing.T) {
	stt := &falsos.Transcriptor{}
	llm := &falsos.Extractor{}
	tts := &falsos.Sintetizador{}
	wa := &falsos.Mensajeria{}

	f := nuevaFixtureSesionTope(t, 1)
	base := time.Date(2026, 10, 9, 15, 0, 0, 0, time.UTC)
	silencio := time.Duration(sinVozProvisorioS) * time.Second
	maxima := time.Duration(duracionMaximaProvisoriaS) * time.Second
	f.relojPanel(base)

	muda := exigirCreada(t, f, f.pedir(f.sec, "", "", "", f.cuerpo("3d"), true))
	aID, aTok := f.ponerEnCurso(t)
	b := exigirCreada(t, f, f.pedir(f.sec, "", "", "", f.cuerpo("3d"), true))
	if rr := f.consentir(b.Token.Valor, b.SesionID, consentimientoValido()); rr.Code != http.StatusCreated {
		t.Fatalf("consentir la segunda: %d %s", rr.Code, rr.Body)
	}
	rr := f.medios(b.Token.Valor, b.SesionID)
	if rr.Code != http.StatusTooManyRequests || codigoDe(t, rr) != "cuota_agotada" {
		t.Fatalf("el cupo estaba libre: %d %s", rr.Code, rr.Body)
	}
	for _, motivo := range []string{"sin_voz", "duracion_maxima"} {
		rr = f.cerrar(aTok, aID, motivo)
		if rr.Code != http.StatusUnprocessableEntity || codigoDe(t, rr) != "validacion_fallida" {
			t.Fatalf("el cliente pidió %s: %d %s", motivo, rr.Code, rr.Body)
		}
	}
	rr = f.leer(f.sec, aID)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET en curso: %d %s", rr.Code, rr.Body)
	}
	exigirLectura(t, rr.Body.Bytes(), aID, "en_curso", true)

	f.relojPanel(base.Add(silencio))
	if n := f.barrer(t); n != 1 {
		t.Fatalf("barrido de silencio: %d", n)
	}
	rr = f.leer(f.sec, aID)
	exigirCorte(t, rr, "sin_voz", int(silencio/time.Second))
	rr = f.medios(b.Token.Valor, b.SesionID)
	if rr.Code != http.StatusCreated {
		t.Fatalf("el cupo no se liberó: %d %s", rr.Code, rr.Body)
	}
	if rr = f.cerrar(b.Token.Valor, b.SesionID, "cliente_cerro"); rr.Code != http.StatusOK {
		t.Fatalf("liberar la segunda: %d %s", rr.Code, rr.Body)
	}

	vozBase := base.Add(silencio)
	f.relojPanel(vozBase)
	cID, _ := f.ponerEnCurso(t)
	if err := f.a.MarcarVoz(t.Context(), f.tenant, cID, vozBase.Add(silencio-time.Second)); err != nil {
		t.Fatal(err)
	}
	f.relojPanel(vozBase.Add(silencio))
	if n := f.barrer(t); n != 0 {
		t.Fatalf("la voz reciente cerró la sesión: %d", n)
	}
	rr = f.leer(f.sec, cID)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET con voz: %d %s", rr.Code, rr.Body)
	}
	exigirLectura(t, rr.Body.Bytes(), cID, "en_curso", true)

	f.relojPanel(vozBase.Add(silencio - time.Second).Add(silencio))
	if n := f.barrer(t); n != 1 {
		t.Fatalf("barrido desde la voz: %d", n)
	}
	rr = f.leer(f.sec, cID)
	exigirCorte(t, rr, "sin_voz", int((silencio-time.Second+silencio)/time.Second))

	durBase := vozBase.Add(silencio - time.Second).Add(silencio)
	f.relojPanel(durBase)
	dID, _ := f.ponerEnCurso(t)
	if err := f.a.MarcarVoz(t.Context(), f.tenant, dID, durBase.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	f.relojPanel(durBase.Add(maxima))
	if n := f.barrer(t); n != 1 {
		t.Fatalf("barrido de duración: %d", n)
	}
	rr = f.leer(f.sec, dID)
	exigirCorte(t, rr, "duracion_maxima", int(maxima/time.Second))

	rr = f.leer(f.sec, muda.SesionID)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET creada: %d %s", rr.Code, rr.Body)
	}
	exigirLectura(t, rr.Body.Bytes(), muda.SesionID, "creada", false)

	if stt.Llamadas() != 0 || llm.Llamadas() != 0 || tts.Llamadas() != 0 || wa.Llamadas() != 0 {
		t.Fatalf("proveedores: stt %d llm %d tts %d wa %d", stt.Llamadas(), llm.Llamadas(), tts.Llamadas(), wa.Llamadas())
	}
}

func (f *fixSesion) ponerEnCurso(t *testing.T) (string, string) {
	t.Helper()
	c := exigirCreada(t, f, f.pedir(f.sec, "", "", "", f.cuerpo("3d"), true))
	if rr := f.consentir(c.Token.Valor, c.SesionID, consentimientoValido()); rr.Code != http.StatusCreated {
		t.Fatalf("consentir: %d %s", rr.Code, rr.Body)
	}
	if rr := f.medios(c.Token.Valor, c.SesionID); rr.Code != http.StatusCreated {
		t.Fatalf("medios: %d %s", rr.Code, rr.Body)
	}
	return c.SesionID, c.Token.Valor
}

func (f *fixSesion) barrer(t *testing.T) int {
	t.Helper()
	n, err := f.a.BarrerLimites(t.Context(), f.tenant, f.hdl.ahoraDePanel(), sinVozProvisorioS, duracionMaximaProvisoriaS)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func exigirCorte(t *testing.T, rr *httptest.ResponseRecorder, motivo string, duracion int) {
	t.Helper()
	if rr.Code != http.StatusOK {
		t.Fatalf("GET cerrada: %d %s", rr.Code, rr.Body)
	}
	var m map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	cerrada, _ := m["cerrada_en"].(string)
	d, ok := m["duracion_s"].(float64)
	if m["estado"] != "cerrada" || m["motivo_cierre"] != motivo || !strings.HasSuffix(cerrada, "Z") || !ok || int(d) != duracion {
		t.Fatalf("corte %s (%ds): %s", motivo, duracion, rr.Body)
	}
}
