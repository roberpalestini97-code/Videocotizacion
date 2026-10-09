package abuso

import (
	"strings"
	"testing"
	"time"

	"videocotizacion/backend/internal/credenciales"
	"videocotizacion/backend/internal/reloj"
)

var t0 = time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC)

func TestLimitadorRepone(t *testing.T) {
	r := reloj.NuevoFalso(t0)
	l := NuevoLimitador(r, 3, time.Minute) // una ficha cada 20 s
	for i := range 3 {
		if ok, _ := l.Permitir("a"); !ok {
			t.Fatalf("pedido %d debía pasar", i)
		}
	}
	ok, espera := l.Permitir("a")
	if ok || espera < time.Second || espera > 20*time.Second {
		t.Fatalf("4.º pedido: ok=%v espera=%v", ok, espera)
	}
	if ok, _ := l.Permitir("b"); !ok {
		t.Fatal("otra clave tiene su propio balde")
	}
	r.Avanzar(20 * time.Second)
	if ok, _ := l.Permitir("a"); !ok {
		t.Fatal("tras 20 s vuelve una ficha")
	}
	if ok, _ := l.Permitir("a"); ok {
		t.Fatal("solo una ficha")
	}
	r.Avanzar(time.Hour)
	for i := range 3 {
		if ok, _ := l.Permitir("a"); !ok {
			t.Fatalf("tras una hora el balde está lleno (%d)", i)
		}
	}
	if ok, _ := l.Permitir("a"); ok {
		t.Fatal("el balde no pasa de su capacidad")
	}
}

func TestLimitadorAcotado(t *testing.T) {
	r := reloj.NuevoFalso(t0)
	l := NuevoLimitador(r, 1, time.Minute)
	l.maxClaves = 10
	for i := range 50 {
		l.Permitir(string(rune('A' + i)))
	}
	r.Avanzar(time.Hour)
	l.Permitir("nueva")
	if len(l.baldes) > 11 {
		t.Fatalf("los baldes no se acotan: %d", len(l.baldes))
	}
}

func nuevo(t *testing.T, bits int) (*Desafios, *reloj.Falso) {
	r := reloj.NuevoFalso(t0)
	return NuevosDesafios(r, bits, time.Minute, credenciales.Aleatorio), r
}

func TestDesafioUnSoloUsoYLigado(t *testing.T) {
	d, r := nuevo(t, 10)
	emitir := func(clave, org string) string {
		e, err := d.Emitir(clave, org)
		if err != nil {
			t.Fatal(err)
		}
		if e.Dificultad != 10 || e.VidaS != 60 || !e.VenceEn.Equal(r.Ahora().Add(time.Minute)) {
			t.Fatalf("emitido: %+v", e)
		}
		return Resolver(e.Desafio, e.Dificultad)
	}
	h := emitir("cpw_A", "https://a.com")
	if err := d.Consumir(h, "cpw_A", "https://a.com"); err != nil {
		t.Fatalf("válido: %v", err)
	}
	if err := d.Consumir(h, "cpw_A", "https://a.com"); err != ErrDesafioDesconoc {
		t.Fatalf("reuso: %v", err)
	}
	h = emitir("cpw_A", "https://a.com")
	if err := d.Consumir(h, "cpw_B", "https://a.com"); err != ErrDesafioAjeno {
		t.Fatalf("otra clave: %v", err)
	}
	if err := d.Consumir(h, "cpw_A", "https://a.com"); err != ErrDesafioDesconoc {
		t.Fatalf("un intento fallido lo consume: %v", err)
	}
	h = emitir("cpw_A", "https://a.com")
	if err := d.Consumir(h, "cpw_A", "https://b.com"); err != ErrDesafioAjeno {
		t.Fatalf("otro Origin: %v", err)
	}
	h = emitir("cpw_A", "https://a.com")
	r.Avanzar(60 * time.Second)
	if err := d.Consumir(h, "cpw_A", "https://a.com"); err != ErrDesafioDesconoc {
		t.Fatalf("vencido (justo a los 60 s): %v", err)
	}
	for _, malo := range []string{"", "dsf_corto.00", strings.Repeat("x", 80), "dsf_" + strings.Repeat("A", 43) + ".zz"} {
		if err := d.Consumir(malo, "cpw_A", "https://a.com"); err != ErrDesafioFormato {
			t.Fatalf("%q: %v", malo, err)
		}
	}
}

func TestDesafioExigeTrabajo(t *testing.T) {
	d, _ := nuevo(t, 12)
	e, _ := d.Emitir("cpw_A", "https://a.com")
	var malo string
	for n := 0; ; n++ {
		nonce := strings.Repeat("0", 8) + string("0123456789abcdef"[n%16]) + strings.Repeat("0", 7)
		if n > 15 || CerosIniciales(e.Desafio, nonce) < 12 {
			malo = e.Desafio + "." + nonce
			break
		}
	}
	if err := d.Consumir(malo, "cpw_A", "https://a.com"); err != ErrDesafioTrabajo {
		t.Fatalf("sin trabajo: %v", err)
	}
	if got := CerosIniciales("x", "y"); got < 0 || got > 256 {
		t.Fatal(got)
	}
}

func TestDesafiosAcotados(t *testing.T) {
	d, r := nuevo(t, 8)
	d.max = 3
	for range 3 {
		if _, err := d.Emitir("c", "o"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := d.Emitir("c", "o"); err != ErrDesafiosLlenos {
		t.Fatalf("tope de pendientes: %v", err)
	}
	r.Avanzar(2 * time.Minute)
	if _, err := d.Emitir("c", "o"); err != nil {
		t.Fatalf("los vencidos se purgan: %v", err)
	}
}
