// Package abuso implementa las defensas contra abuso de costos que no
// dependen de la base (T40): límite de tasa por clave (R58) y el desafío
// anti-bots `X-Desafio` (R53, mecanismo PROVISORIO, P7).
//
// Ambos guardan su estado EN MEMORIA de la instancia: con varias instancias
// el límite es por instancia y un desafío emitido por una no lo reconoce otra
// (anotado en docs/review/T04b1-huecos-del-contrato.md, B4).
package abuso

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/bits"
	"regexp"
	"sync"
	"time"

	"videocotizacion/backend/internal/reloj"
)

// Limitador es un balde de fichas por clave: Capacidad pedidos que se
// reponen de a uno cada Periodo/Capacidad.
type Limitador struct {
	mu        sync.Mutex
	reloj     reloj.Reloj
	capacidad float64
	porFicha  time.Duration
	baldes    map[string]*balde
	maxClaves int
}

type balde struct {
	fichas float64
	ultimo time.Time
}

// NuevoLimitador crea un limitador de capacidad pedidos por periodo.
func NuevoLimitador(r reloj.Reloj, capacidad int, periodo time.Duration) *Limitador {
	if capacidad < 1 {
		capacidad = 1
	}
	return &Limitador{
		reloj: r, capacidad: float64(capacidad), porFicha: periodo / time.Duration(capacidad),
		baldes: map[string]*balde{}, maxClaves: 100_000,
	}
}

// Permitir consume una ficha de la clave. Si no hay, devuelve cuánto falta
// para la próxima (para Retry-After).
func (l *Limitador) Permitir(clave string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	ahora := l.reloj.Ahora()
	b, ok := l.baldes[clave]
	if !ok {
		if len(l.baldes) >= l.maxClaves {
			l.purgar(ahora)
		}
		b = &balde{fichas: l.capacidad, ultimo: ahora}
		l.baldes[clave] = b
	}
	b.recargar(ahora, l.capacidad, l.porFicha)
	if b.fichas >= 1 {
		b.fichas--
		return true, 0
	}
	falta := time.Duration((1 - b.fichas) * float64(l.porFicha))
	return false, max(falta, time.Second)
}

func (b *balde) recargar(ahora time.Time, capacidad float64, porFicha time.Duration) {
	if porFicha > 0 && ahora.After(b.ultimo) {
		b.fichas = min(capacidad, b.fichas+float64(ahora.Sub(b.ultimo))/float64(porFicha))
	}
	b.ultimo = ahora
}

// purgar descarta los baldes llenos (equivalen a no tener historia).
func (l *Limitador) purgar(ahora time.Time) {
	for k, b := range l.baldes {
		b.recargar(ahora, l.capacidad, l.porFicha)
		if b.fichas >= l.capacidad {
			delete(l.baldes, k)
		}
	}
}

// ---- Desafío (R53) ----

// Mecanismo del desafío (DesafioEmitido.mecanismo).
const Mecanismo = "prueba_de_trabajo_sha256"

var (
	reDesafio  = regexp.MustCompile(`^dsf_[A-Za-z0-9_-]{43}$`)
	reCabecera = regexp.MustCompile(`^(dsf_[A-Za-z0-9_-]{43})\.([0-9a-f]{16})$`)
)

// Errores del desafío (todos se responden 403 desafio_invalido).
var (
	ErrDesafioFormato  = errors.New("X-Desafio mal formado")
	ErrDesafioDesconoc = errors.New("desafío desconocido, vencido o ya usado")
	ErrDesafioAjeno    = errors.New("desafío de otra clave u otro Origin")
	ErrDesafioTrabajo  = errors.New("prueba de trabajo insuficiente")
	ErrDesafiosLlenos  = errors.New("demasiados desafíos pendientes")
)

// Emitido es lo que se responde en emitirDesafio.
type Emitido struct {
	Desafio    string
	Dificultad int
	VenceEn    time.Time
	VidaS      int
}

type pendiente struct {
	claveID, origin string
	vence           time.Time
}

// Desafios emite y consume desafíos de un solo uso.
type Desafios struct {
	mu         sync.Mutex
	reloj      reloj.Reloj
	dificultad int
	vida       time.Duration
	max        int
	pendientes map[string]pendiente
	aleatorio  func(int) (string, error)
}

// NuevosDesafios: dificultad 8..32 bits, vida 10..120 s (DesafioEmitido).
func NuevosDesafios(r reloj.Reloj, dificultad int, vida time.Duration, aleatorio func(int) (string, error)) *Desafios {
	dificultad = min(max(dificultad, 8), 32)
	vida = min(max(vida, 10*time.Second), 120*time.Second)
	return &Desafios{reloj: r, dificultad: dificultad, vida: vida, max: 100_000, pendientes: map[string]pendiente{}, aleatorio: aleatorio}
}

// Emitir crea un desafío ligado a la clave pública y al Origin.
func (d *Desafios) Emitir(claveID, origin string) (Emitido, error) {
	v, err := d.aleatorio(32)
	if err != nil {
		return Emitido{}, err
	}
	id := "dsf_" + v
	d.mu.Lock()
	defer d.mu.Unlock()
	ahora := d.reloj.Ahora()
	if len(d.pendientes) >= d.max {
		for k, p := range d.pendientes {
			if !ahora.Before(p.vence) {
				delete(d.pendientes, k)
			}
		}
		if len(d.pendientes) >= d.max {
			return Emitido{}, ErrDesafiosLlenos
		}
	}
	vence := ahora.Add(d.vida)
	d.pendientes[id] = pendiente{claveID: claveID, origin: origin, vence: vence}
	return Emitido{Desafio: id, Dificultad: d.dificultad, VenceEn: vence, VidaS: int(d.vida / time.Second)}, nil
}

// Consumir valida la cabecera X-Desafio. El desafío se borra en el primer
// intento, salga bien o mal (un solo uso, R53).
func (d *Desafios) Consumir(cabecera, claveID, origin string) error {
	m := reCabecera.FindStringSubmatch(cabecera)
	if m == nil {
		return ErrDesafioFormato
	}
	d.mu.Lock()
	p, ok := d.pendientes[m[1]]
	delete(d.pendientes, m[1])
	ahora := d.reloj.Ahora()
	d.mu.Unlock()
	switch {
	case !ok || !ahora.Before(p.vence):
		return ErrDesafioDesconoc
	case p.claveID != claveID || p.origin != origin:
		return ErrDesafioAjeno
	case CerosIniciales(m[1], m[2]) < d.dificultad:
		return ErrDesafioTrabajo
	}
	return nil
}

// CerosIniciales cuenta los bits en cero al comienzo de
// SHA-256(desafio + "." + nonce).
func CerosIniciales(desafio, nonce string) int {
	s := sha256.Sum256([]byte(desafio + "." + nonce))
	n := 0
	for _, b := range s {
		if b == 0 {
			n += 8
			continue
		}
		return n + bits.LeadingZeros8(b)
	}
	return n
}

// Resolver busca un nonce que cumpla la dificultad (lo hace el widget; acá
// sirve para pruebas y como referencia).
func Resolver(desafio string, dificultad int) string {
	if !reDesafio.MatchString(desafio) {
		return ""
	}
	var b [8]byte
	for i := uint64(0); ; i++ {
		for j := range b {
			b[j] = byte(i >> (56 - 8*j))
		}
		nonce := hex.EncodeToString(b[:])
		if CerosIniciales(desafio, nonce) >= dificultad {
			return desafio + "." + nonce
		}
	}
}
