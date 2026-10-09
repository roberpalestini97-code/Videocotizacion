package memoria

import (
	"bytes"
	"context"
	"slices"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

func (a *Almacen) hashUsado(h []byte) bool {
	for _, d := range a.tenants {
		for _, c := range d.claves {
			if bytes.Equal(c.Hash, h) {
				return true
			}
		}
		if _, ok := d.tokens[string(h)]; ok {
			return true
		}
	}
	return false
}

// CrearClaveAPI implementa almacen.Credenciales.
func (a *Almacen) CrearClaveAPI(ctx context.Context, t dominio.TenantID, c dominio.ClaveAPI) error {
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
	if _, ok := d.claves[c.ID]; ok || a.hashUsado(c.Hash) {
		return duplicado("clave")
	}
	c.Hash, c.Origenes = bytes.Clone(c.Hash), slices.Clone(c.Origenes)
	c.CreadaEn = dominio.Instante(c.CreadaEn)
	d.claves[c.ID] = c
	return nil
}

// RevocarClaveAPI implementa almacen.Credenciales (idempotente).
func (a *Almacen) RevocarClaveAPI(ctx context.Context, t dominio.TenantID, id string, ahora time.Time) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	c, ok := d.claves[id]
	if !ok {
		return noEncontrado("clave")
	}
	if c.RevocadaEn == nil {
		r := dominio.Instante(ahora)
		c.RevocadaEn = &r
		d.claves[id] = c
	}
	return nil
}

// CrearEnlace implementa almacen.Credenciales.
func (a *Almacen) CrearEnlace(ctx context.Context, t dominio.TenantID, e dominio.Enlace) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := e.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[e.AsesorID]; !ok {
		return noEncontrado("asesor del enlace")
	}
	if _, ok := d.enlaces[e.IDPublico]; ok {
		return duplicado("enlace")
	}
	e.CreadoEn = dominio.Instante(e.CreadoEn)
	d.enlaces[e.IDPublico] = e
	return nil
}

// LeerEnlace implementa almacen.Credenciales.
func (a *Almacen) LeerEnlace(ctx context.Context, t dominio.TenantID, id string) (dominio.Enlace, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Enlace{}, err
	}
	e, ok := d.enlaces[id]
	if !ok {
		return dominio.Enlace{}, noEncontrado("enlace")
	}
	return e, nil
}

// CrearSesionConToken implementa almacen.Credenciales (todo o nada).
func (a *Almacen) CrearSesionConToken(ctx context.Context, t dominio.TenantID, s dominio.Sesion, tok dominio.TokenSesion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := s.Validar(); err != nil {
		return err
	}
	if err := tok.Validar(); err != nil {
		return err
	}
	if tok.SesionID != s.ID {
		return errores.Nuevo(errores.ValidacionFallida)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[s.AsesorID]; !ok {
		return noEncontrado("asesor de la sesión")
	}
	if _, ok := d.sesiones[s.ID]; ok || a.hashUsado(tok.Hash) {
		return duplicado("sesión o token")
	}
	d.sesiones[s.ID] = copiarSesion(s)
	tok.Hash = bytes.Clone(tok.Hash)
	tok.EmitidoEn, tok.VenceEn = dominio.Instante(tok.EmitidoEn), dominio.Instante(tok.VenceEn)
	d.tokens[string(tok.Hash)] = tok
	return nil
}

// RevocarTokensDeSesion implementa almacen.Credenciales.
func (a *Almacen) RevocarTokensDeSesion(ctx context.Context, t dominio.TenantID, sesionID string, ahora time.Time) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.sesiones[sesionID]; !ok {
		return noEncontrado("sesión")
	}
	r := dominio.Instante(ahora)
	for h, tok := range d.tokens {
		if tok.SesionID == sesionID && tok.RevocadoEn == nil {
			tok.RevocadoEn = &r
			d.tokens[h] = tok
		}
	}
	return nil
}

// Consumo implementa almacen.Credenciales.
func (a *Almacen) Consumo(ctx context.Context, t dominio.TenantID, inicioMes, inicioActivas time.Time) (dominio.Consumo, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Consumo{}, err
	}
	var c dominio.Consumo
	for _, s := range d.sesiones {
		if !s.CreadaEn.Before(inicioMes) {
			c.SegundosMes += int64(s.DuracionS)
		}
		if !s.CreadaEn.Before(inicioActivas) && (s.Estado == dominio.EstadoConsentida || s.Estado == dominio.EstadoEnCurso) {
			c.Activas++
		}
	}
	return c, nil
}

// ObtenerDerivacion implementa almacen.Credenciales.
func (a *Almacen) ObtenerDerivacion(ctx context.Context, t dominio.TenantID, nueva dominio.Derivacion) (dominio.Derivacion, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.Derivacion{}, err
	}
	if err := nueva.Validar(); err != nil {
		return dominio.Derivacion{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Derivacion{}, err
	}
	if _, ok := d.sesiones[nueva.SesionID]; !ok {
		return dominio.Derivacion{}, noEncontrado("sesión")
	}
	if ya, ok := d.derivaciones[nueva.SesionID]; ok {
		return ya, nil
	}
	for _, otra := range d.derivaciones {
		if otra.CodigoReferencia == nueva.CodigoReferencia {
			return dominio.Derivacion{}, duplicado("código de referencia")
		}
	}
	nueva.GeneradaEn = dominio.Instante(nueva.GeneradaEn)
	d.derivaciones[nueva.SesionID] = nueva
	return nueva, nil
}

// BuscarClaveAPI implementa almacen.Autenticacion.
func (a *Almacen) BuscarClaveAPI(ctx context.Context, h []byte) (dominio.TenantID, dominio.ClaveAPI, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return "", dominio.ClaveAPI{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	for id, d := range a.tenants {
		for _, c := range d.claves {
			if len(h) == 32 && bytes.Equal(c.Hash, h) {
				return id, c, nil
			}
		}
	}
	return "", dominio.ClaveAPI{}, noEncontrado("clave")
}

// BuscarTokenSesion implementa almacen.Autenticacion.
func (a *Almacen) BuscarTokenSesion(ctx context.Context, h []byte) (dominio.TenantID, dominio.TokenSesion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return "", dominio.TokenSesion{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	for id, d := range a.tenants {
		if tok, ok := d.tokens[string(h)]; ok && len(h) == 32 {
			return id, tok, nil
		}
	}
	return "", dominio.TokenSesion{}, noEncontrado("token")
}
