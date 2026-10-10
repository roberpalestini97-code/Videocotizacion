package memoria

import (
	"context"
	"fmt"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// RegistrarContacto implementa almacen.Almacen. Solo anexa: el segundo
// registro no pisa al primero.
func (a *Almacen) RegistrarContacto(ctx context.Context, t dominio.TenantID, c dominio.Contacto, ahora time.Time) (dominio.Contacto, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.Contacto{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Contacto{}, err
	}
	s, ok := d.sesiones[c.SesionID]
	if !ok {
		return dominio.Contacto{}, noEncontrado("sesión del contacto")
	}
	if _, ok := d.contactos[c.SesionID]; ok {
		return dominio.Contacto{}, errores.Envolver(errores.ContactoYaRegistrado, fmt.Errorf("contacto ya registrado"))
	}
	c.AsesorID = s.AsesorID
	c.RegistradoEn = dominio.Instante(ahora)
	c.BorrarDespuesDe = c.RegistradoEn.AddDate(0, 0, d.tenant.RetencionDias)
	if err := c.Validar(); err != nil {
		return dominio.Contacto{}, err
	}
	d.contactos[c.SesionID] = c
	return c, nil
}

// LeerContacto implementa almacen.Almacen.
func (a *Almacen) LeerContacto(ctx context.Context, t dominio.TenantID, sesionID string) (dominio.Contacto, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Contacto{}, err
	}
	c, ok := d.contactos[sesionID]
	if !ok {
		return dominio.Contacto{}, noEncontrado("contacto")
	}
	return c, nil
}
