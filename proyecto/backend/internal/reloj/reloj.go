// Package reloj abstrae la hora para poder probar vencimientos, retención y
// cortes por tiempo sin esperar (ADR 0004: "prueba del job de retención con
// reloj falso").
package reloj

import (
	"sync"
	"time"
)

// Reloj da la hora actual.
type Reloj interface {
	Ahora() time.Time
}

// Sistema es el reloj real, siempre en UTC.
type Sistema struct{}

// Ahora devuelve la hora del sistema en UTC.
func (Sistema) Ahora() time.Time { return time.Now().UTC() }

// Falso es un reloj manual, seguro para uso concurrente.
type Falso struct {
	mu    sync.Mutex
	ahora time.Time
}

// NuevoFalso crea un reloj falso parado en t.
func NuevoFalso(t time.Time) *Falso { return &Falso{ahora: t.UTC()} }

// Ahora devuelve la hora fijada.
func (f *Falso) Ahora() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.ahora
}

// Avanzar mueve el reloj hacia adelante (o atrás con d negativo).
func (f *Falso) Avanzar(d time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ahora = f.ahora.Add(d)
}

// Fijar pone el reloj en t.
func (f *Falso) Fijar(t time.Time) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ahora = t.UTC()
}

var (
	_ Reloj = Sistema{}
	_ Reloj = (*Falso)(nil)
)
