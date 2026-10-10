package desafio

import (
	"crypto/sha256"
	"fmt"
	"testing"
	"time"
)

func TestEmitirYConsumirUnaVez(t *testing.T) {
	l := Nuevo()
	ahora := time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC)
	em, err := l.Emitir("cpw_x", "https://cotizar.videocotizacion.local", ahora)
	if err != nil {
		t.Fatal(err)
	}
	if em.Dificultad != DificultadBits || em.Vence.Sub(ahora) != Vigencia {
		t.Fatalf("%+v", em)
	}
	enc := resolver(t, em.Desafio, 8)
	l.mu.Lock()
	r := l.items[em.Desafio]
	r.dificultad = 8
	l.items[em.Desafio] = r
	l.mu.Unlock()
	if err := l.Consumir(enc, "cpw_x", "https://cotizar.videocotizacion.local", ahora); err != nil {
		t.Fatal(err)
	}
	if err := l.Consumir(enc, "cpw_x", "https://cotizar.videocotizacion.local", ahora); err == nil {
		t.Fatal("un desafío usado tiene que rechazarse")
	}
}

func TestConsumirRechazaVencidoYOriginAjeno(t *testing.T) {
	l := Nuevo()
	ahora := time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC)
	em, err := l.Emitir("cpw_x", "https://cotizar.videocotizacion.local", ahora)
	if err != nil {
		t.Fatal(err)
	}
	l.mu.Lock()
	r := l.items[em.Desafio]
	r.dificultad = 8
	l.items[em.Desafio] = r
	l.mu.Unlock()
	enc := resolver(t, em.Desafio, 8)
	if err := l.Consumir(enc, "cpw_x", "https://otro.ejemplo.local", ahora); err == nil {
		t.Fatal("otro Origin tenía que fallar")
	}
	if err := l.Consumir(enc, "cpw_x", "https://cotizar.videocotizacion.local", ahora.Add(Vigencia)); err == nil {
		t.Fatal("vencido tenía que fallar")
	}
}

func resolver(t *testing.T, desafio string, bits int) string {
	t.Helper()
	for i := uint64(0); i < 1<<20; i++ {
		nonce := fmt.Sprintf("%016x", i)
		enc := desafio + "." + nonce
		if cerosIniciales(sha256.Sum256([]byte(enc))) >= bits {
			return enc
		}
	}
	t.Fatal("no encontré nonce")
	return ""
}
