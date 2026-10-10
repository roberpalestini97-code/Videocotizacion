package dominio

import (
	"fmt"
	"time"

	"videocotizacion/backend/internal/errores"
)

// ZonaCuota define el mes de la cuota: hora de Argentina (UTC−3, sin horario
// de verano). Es la ÚNICA fuente del mes para el servicio y los almacenes (M18
// de T04b1: el mes no se calcula en UTC en ningún lado). La base recibe el mes
// ya calculado por Go.
var ZonaCuota = time.FixedZone("ART", -3*3600)

// MesCuota devuelve el mes de la cuota al que pertenece el instante, como la
// fecha del día 1 (00:00 UTC, que es como se guarda en una columna date).
func MesCuota(t time.Time) time.Time {
	l := t.In(ZonaCuota)
	return time.Date(l.Year(), l.Month(), 1, 0, 0, 0, 0, time.UTC)
}

// DiaCuota devuelve el día calendario argentino del instante (como fecha).
func DiaCuota(t time.Time) time.Time {
	l := t.In(ZonaCuota)
	return time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, time.UTC)
}

// FinMesCuota devuelve el instante en que empieza el mes siguiente (00:00 ART
// del día 1): cuándo se repone la cuota mensual (Retry-After de cuota_agotada).
func FinMesCuota(t time.Time) time.Time {
	l := t.In(ZonaCuota)
	return time.Date(l.Year(), l.Month()+1, 1, 0, 0, 0, 0, ZonaCuota).UTC()
}

// Reglas de la reserva de cupo (ADR 0005 §4).
const (
	// MinimoReservaS: con menos saldo efectivo, cuota_agotada.
	MinimoReservaS = 60
	// MargenReserva: la reserva vence en inicio + segundos reservados + margen.
	MargenReserva = 60 * time.Second
)

// Contador es una fila de los contadores mensuales (ADR 0004 §10): segundos de
// llamadas cerradas y segundos reservados por llamadas en curso.
type Contador struct {
	SegundosUsados     int64
	SegundosReservados int64
}

// Total = usados + reservados (lo que se descuenta del tope).
func (c Contador) Total() int64 { return c.SegundosUsados + c.SegundosReservados }

// EstadoCupo es lo que lee crearSesion para VERIFICAR (sin reservar) que haya
// saldo y lugar: contadores del tenant y del asesor del enlace, reservas
// vigentes y topes. El tope global no se lee acá (vc_api no tiene acceso):
// se aplica al reservar.
type EstadoCupo struct {
	Tenant, Asesor               Contador
	ActivasTenant, ActivasAsesor int
	TopeSegundosTenant           int64
	TopeSimultaneasTenant        int
	TopeSegundosAsesor           *int64 // nil = sin tope propio
	TopeSimultaneasAsesor        *int
}

// Saldo efectivo de tenant y asesor.
func (e EstadoCupo) Saldo() int64 {
	s := e.TopeSegundosTenant - e.Tenant.Total()
	if e.TopeSegundosAsesor != nil {
		s = min(s, *e.TopeSegundosAsesor-e.Asesor.Total())
	}
	return s
}

// Verificar aplica el orden del contrato: cuota (saldo < 60 s) y después
// simultáneas; el mismo código para tenant y asesor (no se revela cuál).
func (e EstadoCupo) Verificar() error {
	if s := e.Saldo(); s < MinimoReservaS {
		return errores.Envolver(errores.CuotaAgotada, fmt.Errorf("saldo efectivo %d s", s))
	}
	if e.ActivasTenant >= e.TopeSimultaneasTenant ||
		(e.TopeSimultaneasAsesor != nil && e.ActivasAsesor >= *e.TopeSimultaneasAsesor) {
		return errores.Envolver(errores.SimultaneasAgotadas, fmt.Errorf("activas %d/%d", e.ActivasTenant, e.ActivasAsesor))
	}
	return nil
}

// Topes globales (vc.topes_globales; ADR 0005 §4). No se exponen a tenants.
type TopesGlobales struct {
	SegundosMes int64
	Simultaneas int
}

// PedidoReserva: reservar cupo para la llamada de una sesión.
type PedidoReserva struct {
	SesionID    string
	Ahora       time.Time
	SegundosMax int // LimitesSesion.duracion_maxima_s
}

// Reserva es el lugar y el saldo que ocupa una llamada (TokenMedios.reserva).
type Reserva struct {
	SesionID  string
	AsesorID  string
	Mes       time.Time
	Segundos  int  // reservados = límite efectivo de la llamada
	Recortada bool // el saldo era menor que la duración máxima
	CreadaEn  time.Time
	VenceEn   time.Time // CreadaEn + Segundos + MargenReserva
}

// ResultadoReserva distingue la reconexión y la reserva vencida (la sesión
// superó su límite: el almacén la cerró y se cobró completa).
type ResultadoReserva struct {
	Reserva     Reserva
	Reutilizada bool
	Vencida     bool
}

// DecidirReserva aplica los topes con los contadores leídos BAJO BLOQUEO:
// saldo efectivo = mínimo de los saldos; < 60 s → cuota_agotada; si alguna
// cuenta de reservas vigentes llegó a su tope → simultaneas_agotadas; si no,
// se reserva min(duración máxima, saldo) (recorte). Un tope de simultáneas < 0
// significa "sin tope". Es la regla que replica vc.reservar_cupo.
func DecidirReserva(segundosMax int, saldos []int64, activas, topesSimultaneas []int) (int, bool, error) {
	saldo := int64(segundosMax)
	for _, s := range saldos {
		saldo = min(saldo, s)
	}
	if saldo < MinimoReservaS {
		return 0, false, errores.Envolver(errores.CuotaAgotada, fmt.Errorf("saldo efectivo %d s", saldo))
	}
	for i, a := range activas {
		if topesSimultaneas[i] >= 0 && a >= topesSimultaneas[i] {
			return 0, false, errores.Envolver(errores.SimultaneasAgotadas, fmt.Errorf("activas %d de %d (nivel %d)", a, topesSimultaneas[i], i))
		}
	}
	return int(saldo), int(saldo) < segundosMax, nil
}

// SegundosCobrados: reales redondeados hacia arriba, entre 0 y lo reservado.
func SegundosCobrados(r Reserva, cierre time.Time) int {
	d := cierre.Sub(r.CreadaEn)
	s := int((d + time.Second - 1) / time.Second)
	return min(max(s, 0), r.Segundos)
}

// IniciarMedios pasa la sesión a "en_curso" (emitirTokenMedios). Desde
// "en_curso" es una reconexión. Sin consentimiento → consentimiento_requerido
// (R10); cerrada → sesion_cerrada.
func (s *Sesion) IniciarMedios() error {
	switch s.Estado {
	case EstadoConsentida:
		s.Estado = EstadoEnCurso
		return nil
	case EstadoEnCurso:
		return nil
	case EstadoCerrada:
		return errores.Envolver(errores.SesionCerrada, fmt.Errorf("medios con la sesión cerrada"))
	default:
		return errores.Envolver(errores.ConsentimientoRequerido, fmt.Errorf("medios sin consentimiento"))
	}
}
