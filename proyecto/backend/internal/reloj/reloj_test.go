package reloj

import (
	"sync"
	"testing"
	"time"
)

func TestFalsoAvanzaYEsConcurrente(t *testing.T) {
	base := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	f := NuevoFalso(base)
	var wg sync.WaitGroup
	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f.Avanzar(time.Second)
			_ = f.Ahora()
		}()
	}
	wg.Wait()
	if got := f.Ahora(); !got.Equal(base.Add(50 * time.Second)) {
		t.Fatalf("hora = %v, quería %v", got, base.Add(50*time.Second))
	}
	f.Fijar(base)
	if !f.Ahora().Equal(base) {
		t.Fatal("Fijar no fijó la hora")
	}
}

func TestSistemaEnUTC(t *testing.T) {
	if (Sistema{}).Ahora().Location() != time.UTC {
		t.Fatal("el reloj del sistema debe devolver UTC")
	}
}
