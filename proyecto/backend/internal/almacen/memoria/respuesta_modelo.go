package memoria

import (
	"context"
	"slices"

	"videocotizacion/backend/internal/dominio"
)

func (a *Almacen) AnexarRespuestaModelo(ctx context.Context, t dominio.TenantID, r dominio.RespuestaModelo) error {
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if err := r.Validar(); err != nil {
		return err
	}
	if _, ok := d.sesiones[r.SesionID]; !ok {
		return noEncontrado("sesión")
	}
	for _, x := range d.respuestasModelo[r.SesionID] {
		if x.Turno == r.Turno {
			return duplicado("turno")
		}
	}
	d.respuestasModelo[r.SesionID] = append(d.respuestasModelo[r.SesionID], r)
	return nil
}

func (a *Almacen) ListarRespuestasModeloDeSesion(ctx context.Context, t dominio.TenantID, sesionID string) ([]dominio.RespuestaModelo, error) {
	d, err := a.tenant(ctx, t)
	if err != nil {
		return nil, err
	}
	if _, ok := d.sesiones[sesionID]; !ok {
		return nil, noEncontrado("sesión")
	}
	out := slices.Clone(d.respuestasModelo[sesionID])
	slices.SortFunc(out, func(a, b dominio.RespuestaModelo) int {
		if a.Turno < b.Turno {
			return -1
		}
		if a.Turno > b.Turno {
			return 1
		}
		return 0
	})
	return out, nil
}
