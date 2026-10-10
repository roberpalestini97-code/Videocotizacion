// Package desafio emite y consume el desafío anti-bots (R53). El mecanismo es
// la prueba de trabajo SHA-256 provisoria (P7): vive en memoria del proceso,
// vence a los 120 s y es de un solo uso. No se abre crearSesion al público
// hasta probarlo contra el contrato.
package desafio

import (
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"sync"
	"time"
)

const (
	// DificultadBits es el costo provisorio: 16 bits cero al inicio del SHA-256.
	DificultadBits = 16
	// Vigencia es el máximo que admite el contrato.
	Vigencia = 120 * time.Second
	alfa     = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
)

// Emitido es lo que ve el widget.
type Emitido struct {
	Desafio    string
	Dificultad int
	Vence      time.Time
}

type registro struct {
	claveID, origin string
	vence           time.Time
	dificultad      int
	usado           bool
}

// Libro guarda los desafíos vigentes de este proceso.
type Libro struct {
	mu    sync.Mutex
	items map[string]registro
}

// Nuevo crea un libro vacío.
func Nuevo() *Libro { return &Libro{items: map[string]registro{}} }

// Emitir crea un desafío ligado a la clave pública y al Origin.
func (l *Libro) Emitir(claveID, origin string, ahora time.Time) (Emitido, error) {
	id, err := nuevoID()
	if err != nil {
		return Emitido{}, err
	}
	ahora = ahora.UTC()
	l.mu.Lock()
	defer l.mu.Unlock()
	l.purgar(ahora)
	l.items[id] = registro{claveID: claveID, origin: origin, vence: ahora.Add(Vigencia), dificultad: DificultadBits}
	return Emitido{Desafio: id, Dificultad: DificultadBits, Vence: ahora.Add(Vigencia)}, nil
}

// FijarDificultad cambia el costo de un desafío ya emitido. Lo usan las
// pruebas de crearSesion para bajar un registro a 8 bits; Emitir sigue
// usando DificultadBits y esta ruta no baja ese valor.
func (l *Libro) FijarDificultad(id string, bits int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	r, ok := l.items[id]
	if !ok {
		return false
	}
	r.dificultad = bits
	l.items[id] = r
	return true
}

// ErrInvalido es un desafío ausente, vencido, reusado, de otra clave o de otro Origin.
var ErrInvalido = errors.New("desafío inválido")

// Consumir marca el desafío como usado si el nonce cumple la prueba de trabajo.
// El encabezado es `<desafio>.<nonce hex de 16>`.
func (l *Libro) Consumir(encabezado, claveID, origin string, ahora time.Time) error {
	desafio, nonce, ok := partir(encabezado)
	if !ok {
		return ErrInvalido
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	r, existe := l.items[desafio]
	if !existe || r.usado || !ahora.Before(r.vence) || r.claveID != claveID || r.origin != origin {
		return ErrInvalido
	}
	if cerosIniciales(sha256.Sum256([]byte(encabezado))) < r.dificultad {
		return ErrInvalido
	}
	r.usado = true
	l.items[desafio] = r
	_ = nonce
	return nil
}

func (l *Libro) purgar(ahora time.Time) {
	for id, r := range l.items {
		if !ahora.Before(r.vence) {
			delete(l.items, id)
		}
	}
}

func nuevoID() (string, error) { return NuevoOpaco("dsf_") }

// NuevoOpaco devuelve prefijo + 43 caracteres del alfabeto del desafío
// (A–Z, a–z, 0–9, _ y -). Sirve para dsf_ y para el valor opaco vc_ses_.
func NuevoOpaco(prefijo string) (string, error) {
	var b [43]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = alfa[int(b[i])%len(alfa)]
	}
	return prefijo + string(b[:]), nil
}

func partir(encabezado string) (desafio, nonce string, ok bool) {
	if len(encabezado) != len("dsf_")+43+1+16 {
		return "", "", false
	}
	if encabezado[len("dsf_")+43] != '.' {
		return "", "", false
	}
	desafio, nonce = encabezado[:len("dsf_")+43], encabezado[len("dsf_")+44:]
	if len(desafio) < 4 || desafio[:4] != "dsf_" {
		return "", "", false
	}
	for _, c := range nonce {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return "", "", false
		}
	}
	return desafio, nonce, true
}

func cerosIniciales(sum [32]byte) int {
	n := 0
	for _, b := range sum {
		if b == 0 {
			n += 8
			continue
		}
		for m := byte(0x80); m > 0; m >>= 1 {
			if b&m != 0 {
				return n
			}
			n++
		}
	}
	return n
}
