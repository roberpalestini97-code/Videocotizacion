package memoria

import (
	"bytes"
	"context"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// GuardarTokenMedios implementa almacen.ClienteFinal.
func (a *Almacen) GuardarTokenMedios(ctx context.Context, t dominio.TenantID, tok dominio.TokenMedios) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := tok.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.sesiones[tok.SesionID]; !ok {
		return noEncontrado("sesión del token de medios")
	}
	for _, otro := range a.tenants {
		if _, ok := otro.medios[string(tok.Hash)]; ok {
			return duplicado("token de medios")
		}
	}
	tok.Hash = bytes.Clone(tok.Hash)
	tok.EmitidoEn, tok.VenceEn = dominio.Instante(tok.EmitidoEn), dominio.Instante(tok.VenceEn)
	d.medios[string(tok.Hash)] = tokenMedios{TokenMedios: tok}
	return nil
}

// revocarTokensMedios anula los tokens sin usar de la sesión (cierre).
func (d *datosTenant) revocarTokensMedios(sesionID string, ahora time.Time) {
	r := dominio.Instante(ahora)
	for h, tok := range d.medios {
		if tok.SesionID == sesionID && tok.revocadoEn == nil && tok.usadoEn == nil {
			tok.revocadoEn = &r
			d.medios[h] = tok
		}
	}
}

// RegistrarContacto implementa almacen.ClienteFinal.
func (a *Almacen) RegistrarContacto(ctx context.Context, t dominio.TenantID, c dominio.Contacto) error {
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
	s, ok := d.sesiones[c.SesionID]
	if !ok {
		return noEncontrado("sesión del contacto")
	}
	if err := s.AdmiteContacto(); err != nil {
		return err
	}
	if _, ok := d.contactos[c.SesionID]; ok {
		return errores.Nuevo(errores.ContactoYaRegistrado)
	}
	c.ConsentidoEn, c.BorrarDespuesDe = dominio.Instante(c.ConsentidoEn), dominio.Instante(c.BorrarDespuesDe)
	d.contactos[c.SesionID] = c
	return nil
}

// AtenderArco implementa almacen.ClienteFinal.
func (a *Almacen) AtenderArco(ctx context.Context, t dominio.TenantID, p dominio.PedidoArco, s dominio.SolicitudArco) (dominio.SolicitudArco, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.SolicitudArco{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.SolicitudArco{}, err
	}
	sesionID, coincide := "", false
	for id, der := range d.derivaciones {
		if der.CodigoReferencia == p.CodigoReferencia {
			if c, ok := d.contactos[id]; ok && p.Coincide(c) {
				sesionID, coincide = id, true
			}
		}
	}
	out := dominio.ResolverArco(s, p, coincide, sesionID)
	if coincide && p.Tipo == dominio.ArcoSupresion {
		d.borrarSesion(sesionID)
	}
	out.RecibidaEn, out.PlazoVenceEn = dominio.Instante(out.RecibidaEn), dominio.Instante(out.PlazoVenceEn)
	d.arco = append(d.arco, out)
	return out, nil
}

// borrarSesion borra la sesión y todo lo que cuelga de ella (como la cascada
// de la base). No toca el consumo ni las reservas (H2).
func (d *datosTenant) borrarSesion(id string) {
	delete(d.consentimientos, id)
	delete(d.cotizaciones, id)
	delete(d.derivaciones, id)
	delete(d.contactos, id)
	for h, tok := range d.tokens {
		if tok.SesionID == id {
			delete(d.tokens, h)
		}
	}
	for h, tok := range d.medios {
		if tok.SesionID == id {
			delete(d.medios, h)
		}
	}
	delete(d.sesiones, id)
}

// SolicitudesArco devuelve las solicitudes guardadas de un tenant. Solo para
// pruebas.
func (a *Almacen) SolicitudesArco(t dominio.TenantID) []dominio.SolicitudArco {
	a.mu.Lock()
	defer a.mu.Unlock()
	if d, ok := a.tenants[t]; ok {
		return append([]dominio.SolicitudArco(nil), d.arco...)
	}
	return nil
}
