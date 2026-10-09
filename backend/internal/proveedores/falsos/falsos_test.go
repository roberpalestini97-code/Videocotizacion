package falsos

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/proveedores"
)

func TestDeterministasYCuentan(t *testing.T) {
	ctx := context.Background()
	c, tr, ex, si, me := Conjunto()
	if !c.Completo() {
		t.Fatal("conjunto incompleto")
	}
	falsos := c.Falsos()
	sort.Strings(falsos)
	if strings.Join(falsos, ",") != "llm,stt,tts,whatsapp" {
		t.Fatalf("Falsos() = %v", falsos)
	}
	tr.Texto = "pintar un living"
	for range 2 {
		r, err := c.Transcriptor.Transcribir(ctx, proveedores.Audio{PCM: make([]byte, 32000), FrecuenciaHz: 16000, Final: true})
		if err != nil || r.Texto != "pintar un living" || r.MilisegsAudio != 1000 || !r.Final {
			t.Fatalf("transcripción = %+v, %v", r, err)
		}
	}
	if tr.Llamadas() != 2 || tr.Unidades() != 2000 {
		t.Fatalf("contador STT = %d llamadas, %d ms", tr.Llamadas(), tr.Unidades())
	}
	r1, _ := c.Extractor.Extraer(ctx, proveedores.PedidoExtraccion{Transcripcion: "hola"})
	r2, _ := c.Extractor.Extraer(ctx, proveedores.PedidoExtraccion{Transcripcion: "hola"})
	if string(r1.JSON) != string(r2.JSON) || r1.TokensEntrada != 1 || ex.Llamadas() != 2 {
		t.Fatalf("extractor no determinista: %+v %+v", r1, r2)
	}
	ex.RespuestaInvalida = true
	r3, _ := c.Extractor.Extraer(ctx, proveedores.PedidoExtraccion{})
	if !strings.Contains(string(r3.JSON), "precio") {
		t.Fatal("la respuesta inválida debe traer un monto para probar el rechazo")
	}
	v, err := c.Sintetizador.Sintetizar(ctx, "dos palabras")
	if err != nil || len(v.Marcas) != 2 || v.Caracteres != 12 || si.Unidades() != 12 {
		t.Fatalf("voz = %+v, %v", v, err)
	}
	enlace, err := c.Mensajeria.EnlaceDerivacion(ctx, "+5492235551234", "Código VC-1")
	if err != nil || enlace != "https://wa.me/5492235551234?text=C%C3%B3digo%20VC-1" || me.Llamadas() != 1 {
		t.Fatalf("enlace = %q, %v", enlace, err)
	}
	if _, err := c.Mensajeria.EnlaceDerivacion(ctx, "2235551234", "x"); !errores.Es(err, errores.ValidacionFallida) {
		t.Fatalf("teléfono inválido: %v", err)
	}
}

func TestFallasInyectables(t *testing.T) {
	falla := errors.New("caído")
	tr := &Transcriptor{Fallas: Fallas{Error: falla}}
	_, err := tr.Transcribir(context.Background(), proveedores.Audio{})
	if !errores.Es(err, errores.ProveedorNoDisponible) || !errors.Is(err, falla) {
		t.Fatalf("err = %v", err)
	}
	if tr.Llamadas() != 0 {
		t.Fatal("una llamada fallida no debe contar consumo")
	}
	ex := &Extractor{Fallas: Fallas{Latencia: time.Hour}}
	ctx, cancelar := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancelar()
	inicio := time.Now()
	_, err = ex.Extraer(ctx, proveedores.PedidoExtraccion{})
	if !errores.Es(err, errores.ProveedorNoDisponible) || time.Since(inicio) > time.Second {
		t.Fatalf("la latencia debe respetar el contexto: %v", err)
	}
}

func TestConcurrencia(t *testing.T) {
	si := &Sintetizador{}
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = si.Sintetizar(context.Background(), "abc")
		}()
	}
	wg.Wait()
	if si.Llamadas() != 20 || si.Unidades() != 60 {
		t.Fatalf("contador = %d/%d", si.Llamadas(), si.Unidades())
	}
}
