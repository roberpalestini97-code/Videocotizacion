package memoria

import (
	"context"
	"fmt"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// marchaSesion guarda, en el proceso, cuándo pasó a en_curso y la última voz.
// No hay columna para eso: el barrido no necesita una migración.
type marchaSesion struct {
	enCursoEn time.Time
	ultimaVoz time.Time
}

// MarcarVoz implementa almacen.Almacen. Solo anota una sesión en_curso.
// No llama proveedores ni cambia el estado.
func (a *Almacen) MarcarVoz(ctx context.Context, t dominio.TenantID, id string, ahora time.Time) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	s, ok := d.sesiones[id]
	if !ok {
		return noEncontrado("sesión")
	}
	if s.Estado != dominio.EstadoEnCurso {
		return errores.Envolver(errores.EstadoInvalido, fmt.Errorf("marcar voz en %s", s.Estado))
	}
	m := d.marchas[id]
	if m.enCursoEn.IsZero() {
		return errores.Envolver(errores.EstadoInvalido, fmt.Errorf("sin inicio de en_curso"))
	}
	m.ultimaVoz = dominio.Instante(ahora)
	d.marchas[id] = m
	return nil
}

// BarrerLimites implementa almacen.Almacen. Cierra las en_curso que cumplieron
// el silencio o la duración máxima y revoca sus tokens de medios, igual que
// un cierre con cliente_cerro. El cupo cuenta sesiones en_curso: al cerrar
// queda libre. No llama proveedores.
func (a *Almacen) BarrerLimites(ctx context.Context, t dominio.TenantID, ahora time.Time, sinVozS, duracionMaxS int) (int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return 0, err
	}
	n := 0
	for id, s := range d.sesiones {
		if s.Estado != dominio.EstadoEnCurso {
			continue
		}
		m := d.marchas[id]
		motivo, ok := dominio.MotivoDeLimites(m.enCursoEn, m.ultimaVoz, ahora, sinVozS, duracionMaxS)
		if !ok {
			continue
		}
		s = copiarSesion(s)
		if err := s.Cerrar(motivo, ahora); err != nil {
			return n, err
		}
		d.sesiones[id] = s
		revocarTokensMedios(d, id, ahora)
		n++
	}
	return n, nil
}
