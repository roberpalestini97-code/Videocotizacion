package memoria

import (
	"cmp"
	"context"
	"slices"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
)

// GuardarConsentimientoAsesor implementa almacen.Almacen.
func (a *Almacen) GuardarConsentimientoAsesor(ctx context.Context, t dominio.TenantID, c dominio.ConsentimientoAsesor) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	c.AceptadoEn = dominio.Instante(c.AceptadoEn)
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[c.AsesorID]; !ok {
		return noEncontrado("asesor")
	}
	if _, ok := d.consentimientoAsesor[c.AsesorID]; ok {
		return duplicado("consentimiento del asesor")
	}
	d.consentimientoAsesor[c.AsesorID] = c
	return nil
}

// LeerConsentimientoAsesor implementa almacen.Almacen.
func (a *Almacen) LeerConsentimientoAsesor(ctx context.Context, t dominio.TenantID, asesorID string) (dominio.ConsentimientoAsesor, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.ConsentimientoAsesor{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.ConsentimientoAsesor{}, err
	}
	c, ok := d.consentimientoAsesor[asesorID]
	if !ok {
		return dominio.ConsentimientoAsesor{}, noEncontrado("consentimiento del asesor")
	}
	c.AceptadoEn = dominio.Instante(c.AceptadoEn)
	return c, nil
}

// AnexarLectura implementa almacen.Almacen.
func (a *Almacen) AnexarLectura(ctx context.Context, t dominio.TenantID, l dominio.Lectura) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := l.Validar(); err != nil {
		return err
	}
	l.OcurridoEn = dominio.Instante(l.OcurridoEn)
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[l.AsesorID]; !ok {
		return noEncontrado("asesor")
	}
	for _, ya := range d.lecturas {
		if ya.ID == l.ID {
			return duplicado("lectura")
		}
	}
	d.lecturas = append(d.lecturas, l)
	return nil
}

// ListarLecturasDelAsesor implementa almacen.Almacen.
func (a *Almacen) ListarLecturasDelAsesor(ctx context.Context, t dominio.TenantID, asesorID string) ([]dominio.Lectura, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return nil, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return nil, err
	}
	out := []dominio.Lectura{}
	for _, l := range d.lecturas {
		if !lecturaVisible(d, asesorID, l) {
			continue
		}
		l.OcurridoEn = dominio.Instante(l.OcurridoEn)
		out = append(out, l)
	}
	slices.SortFunc(out, func(x, y dominio.Lectura) int {
		if c := x.OcurridoEn.Compare(y.OcurridoEn); c != 0 {
			return c
		}
		return cmp.Compare(x.ID, y.ID)
	})
	return out, nil
}

func lecturaVisible(d *datosTenant, asesorID string, l dominio.Lectura) bool {
	if l.AsesorID == asesorID {
		return true
	}
	s, ok := d.sesiones[l.RecursoID]
	return ok && s.AsesorID == asesorID
}

// ConsumoDelAsesor implementa almacen.Almacen.
func (a *Almacen) ConsumoDelAsesor(ctx context.Context, t dominio.TenantID, asesorID string, ahora time.Time) (almacen.ConsumoContado, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return almacen.ConsumoContado{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return almacen.ConsumoContado{}, err
	}
	if _, ok := d.asesores[asesorID]; !ok {
		return almacen.ConsumoContado{}, noEncontrado("asesor")
	}
	inicio := time.Date(ahora.UTC().Year(), ahora.UTC().Month(), 1, 0, 0, 0, 0, time.UTC)
	fin := inicio.AddDate(0, 1, 0)
	var segundos int64
	enCurso := 0
	for _, s := range d.sesiones {
		if s.AsesorID != asesorID {
			continue
		}
		if s.Estado == dominio.EstadoEnCurso {
			enCurso++
		}
		if !s.CreadaEn.Before(inicio) && s.CreadaEn.Before(fin) {
			segundos += int64(s.DuracionS)
		}
	}
	if segundos > 100000000 {
		segundos = 100000000
	}
	return almacen.ConsumoContado{
		SegundosUsados: int(segundos), SegundosTope: d.tenant.SegundosMesTope,
		SimultaneasEnCurso: enCurso, SimultaneasTope: d.tenant.SimultaneasTope,
	}, nil
}
