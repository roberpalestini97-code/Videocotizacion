package memoria

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

func clonarContrasena(c dominio.ContrasenaAsesor) dominio.ContrasenaAsesor {
	c.Hash = bytes.Clone(c.Hash)
	c.Sal = bytes.Clone(c.Sal)
	c.CreadaEn = dominio.Instante(c.CreadaEn)
	return c
}

func clonarIngreso(p dominio.IngresoPanel) dominio.IngresoPanel {
	p.HashCookie = bytes.Clone(p.HashCookie)
	p.HashCSRF = bytes.Clone(p.HashCSRF)
	p.CSRFCifrado = bytes.Clone(p.CSRFCifrado)
	p.EmitidaEn = dominio.Instante(p.EmitidaEn)
	p.VenceEn = dominio.Instante(p.VenceEn)
	if !p.VenceInactividad.IsZero() {
		p.VenceInactividad = dominio.Instante(p.VenceInactividad)
	}
	p.RevocadaEn = instantePtr(p.RevocadaEn)
	p.ReautenticadoHasta = instantePtr(p.ReautenticadoHasta)
	return p
}

// GuardarContrasena implementa almacen.Almacen. La contraseña en claro no entra.
func (a *Almacen) GuardarContrasena(ctx context.Context, t dominio.TenantID, c dominio.ContrasenaAsesor) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[c.AsesorID]; !ok {
		return noEncontrado("asesor")
	}
	if _, ok := d.contrasenas[c.AsesorID]; ok {
		return duplicado("contraseña")
	}
	if _, ok := a.contrasenaPorEmail[c.Email]; ok {
		return duplicado("contraseña")
	}
	d.contrasenas[c.AsesorID] = clonarContrasena(c)
	a.contrasenaPorEmail[c.Email] = refContrasena{tenant: t, asesor: c.AsesorID}
	return nil
}

// LeerContrasena implementa almacen.Almacen.
func (a *Almacen) LeerContrasena(ctx context.Context, t dominio.TenantID, asesorID string) (dominio.ContrasenaAsesor, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.ContrasenaAsesor{}, err
	}
	c, ok := d.contrasenas[asesorID]
	if !ok {
		return dominio.ContrasenaAsesor{}, noEncontrado("contraseña")
	}
	return clonarContrasena(c), nil
}

// BuscarContrasenaPorEmail implementa almacen.Almacen. No exige tenant.
func (a *Almacen) BuscarContrasenaPorEmail(ctx context.Context, email string) (dominio.ContrasenaHallada, error) {
	email, err := dominio.EmailDeLogin(email)
	if err != nil {
		return dominio.ContrasenaHallada{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return dominio.ContrasenaHallada{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	if a.cerrado {
		return dominio.ContrasenaHallada{}, errores.Envolver(errores.ServicioNoDisponible, fmt.Errorf("almacén cerrado"))
	}
	ref, ok := a.contrasenaPorEmail[email]
	if !ok {
		return dominio.ContrasenaHallada{}, noEncontrado("contraseña")
	}
	c, ok := a.tenants[ref.tenant].contrasenas[ref.asesor]
	if !ok {
		return dominio.ContrasenaHallada{}, noEncontrado("contraseña")
	}
	return dominio.ContrasenaHallada{TenantID: ref.tenant, ContrasenaAsesor: clonarContrasena(c)}, nil
}

// GuardarIngresoPanel implementa almacen.Almacen. Solo HMAC.
func (a *Almacen) GuardarIngresoPanel(ctx context.Context, t dominio.TenantID, p dominio.IngresoPanel) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := p.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[p.AsesorID]; !ok {
		return noEncontrado("asesor")
	}
	hx := claveHex(p.HashCookie)
	if _, ok := a.ingresoPorHash[hx]; ok {
		return duplicado("ingreso")
	}
	d.ingresos[hx] = clonarIngreso(p)
	a.ingresoPorHash[hx] = t
	return nil
}

// LeerIngresoPanel implementa almacen.Almacen.
func (a *Almacen) LeerIngresoPanel(ctx context.Context, t dominio.TenantID, hashCookie []byte) (dominio.IngresoPanel, error) {
	if len(hashCookie) != 32 {
		return dominio.IngresoPanel{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.IngresoPanel{}, err
	}
	p, ok := d.ingresos[claveHex(hashCookie)]
	if !ok {
		return dominio.IngresoPanel{}, noEncontrado("ingreso")
	}
	return clonarIngreso(p), nil
}

// CerrarSesionPanel implementa almacen.Almacen. No borra la fila: no hay
// privilegio de DELETE. La cookie preliminar no se revoca por acá.
func (a *Almacen) CerrarSesionPanel(ctx context.Context, t dominio.TenantID, hashCookie []byte, ahora time.Time) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if len(hashCookie) != 32 {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	if ahora.IsZero() {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("ahora"))
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	hx := claveHex(hashCookie)
	p, ok := d.ingresos[hx]
	if !ok || !p.SesionVigente(ahora) {
		return errores.Nuevo(errores.SesionVencida)
	}
	u := dominio.Instante(ahora)
	p.RevocadaEn = &u
	d.ingresos[hx] = p
	return nil
}

// CambiarContrasena implementa almacen.Almacen. El candado cubre el hash, la
// revocación de las otras cookies y el consumo de la ventana.
func (a *Almacen) CambiarContrasena(ctx context.Context, t dominio.TenantID, hashCookie []byte, nueva dominio.ContrasenaAsesor, ahora time.Time) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if len(hashCookie) != 32 {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	if err := nueva.Validar(); err != nil {
		return err
	}
	if ahora.IsZero() {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("ahora"))
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	hx := claveHex(hashCookie)
	p, ok := d.ingresos[hx]
	if !ok || !p.SesionVigente(ahora) || p.AsesorID != nueva.AsesorID {
		return errores.Nuevo(errores.SesionVencida)
	}
	if p.ReautenticadoHasta == nil || !ahora.Before(*p.ReautenticadoHasta) {
		return errores.Nuevo(errores.ReautenticacionRequerida)
	}
	prev, ok := d.contrasenas[p.AsesorID]
	if !ok {
		return noEncontrado("contraseña")
	}
	if nueva.Email != prev.Email {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("email"))
	}
	d.contrasenas[p.AsesorID] = clonarContrasena(nueva)
	cuando := dominio.Instante(ahora)
	for id, ing := range d.ingresos {
		if ing.AsesorID != p.AsesorID || id == hx || ing.RevocadaEn != nil {
			continue
		}
		u := cuando
		ing.RevocadaEn = &u
		d.ingresos[id] = ing
	}
	p.ReautenticadoHasta = nil
	d.ingresos[hx] = p
	return nil
}
