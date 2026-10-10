package memoria

import (
	"bytes"
	"cmp"
	"context"
	"fmt"
	"slices"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

func claveHex(hash []byte) string {
	const h = "0123456789abcdef"
	out := make([]byte, len(hash)*2)
	for i, c := range hash {
		out[i*2], out[i*2+1] = h[c>>4], h[c&0x0f]
	}
	return string(out)
}

func instantePtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := dominio.Instante(*t)
	return &u
}

// GuardarClave implementa almacen.Almacen.
func (a *Almacen) GuardarClave(ctx context.Context, t dominio.TenantID, c dominio.ClaveAPI) error {
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
	if _, ok := d.claves[c.ID]; ok {
		return duplicado("clave")
	}
	hx := claveHex(c.Hash)
	if _, ok := a.clavePorHash[hx]; ok {
		return duplicado("clave")
	}
	c.CreadaEn = dominio.Instante(c.CreadaEn)
	c.RevocadaEn = instantePtr(c.RevocadaEn)
	c.Hash = append([]byte(nil), c.Hash...)
	d.claves[c.ID] = c
	a.clavePorHash[hx] = t
	return nil
}

// BuscarClavePorHash implementa almacen.Almacen.
func (a *Almacen) BuscarClavePorHash(ctx context.Context, hash []byte) (dominio.ClaveHallada, error) {
	if len(hash) != 32 {
		return dominio.ClaveHallada{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return dominio.ClaveHallada{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	if a.cerrado {
		return dominio.ClaveHallada{}, errores.Envolver(errores.ServicioNoDisponible, fmt.Errorf("almacén cerrado"))
	}
	t, ok := a.clavePorHash[claveHex(hash)]
	if !ok {
		return dominio.ClaveHallada{}, noEncontrado("clave")
	}
	for _, c := range a.tenants[t].claves {
		if string(c.Hash) == string(hash) {
			return dominio.ClaveHallada{
				TenantID: t, ID: c.ID, Tipo: c.Tipo, Origenes: append([]string(nil), c.Origenes...),
				Revocada: c.RevocadaEn != nil,
			}, nil
		}
	}
	return dominio.ClaveHallada{}, noEncontrado("clave")
}

// ListarClavesWidget implementa almacen.Almacen. No devuelve el HMAC.
func (a *Almacen) ListarClavesWidget(ctx context.Context, t dominio.TenantID) ([]dominio.ClaveAPI, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return nil, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return nil, err
	}
	out := []dominio.ClaveAPI{}
	for _, c := range d.claves {
		if c.Tipo != dominio.ClavePublica {
			continue
		}
		out = append(out, copiaClavePublica(c))
	}
	slices.SortFunc(out, func(x, y dominio.ClaveAPI) int {
		if c := x.CreadaEn.Compare(y.CreadaEn); c != 0 {
			return c
		}
		return cmp.Compare(x.ID, y.ID)
	})
	return out, nil
}

// RevocarClaveWidget implementa almacen.Almacen.
func (a *Almacen) RevocarClaveWidget(ctx context.Context, t dominio.TenantID, claveID string, ahora time.Time) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if !dominio.IDValido(claveID, dominio.PrefijoClavePublica) || ahora.IsZero() {
		return errores.Nuevo(errores.NoEncontrado)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	c, ok := d.claves[claveID]
	if !ok || c.Tipo != dominio.ClavePublica || c.RevocadaEn != nil {
		return noEncontrado("clave")
	}
	u := dominio.Instante(ahora)
	c.RevocadaEn = &u
	d.claves[claveID] = c
	return nil
}

func copiaClavePublica(c dominio.ClaveAPI) dominio.ClaveAPI {
	c.Hash = nil
	c.Origenes = append([]string(nil), c.Origenes...)
	c.CreadaEn = dominio.Instante(c.CreadaEn)
	c.RevocadaEn = instantePtr(c.RevocadaEn)
	return c
}

// GuardarEnlace implementa almacen.Almacen.
func (a *Almacen) GuardarEnlace(ctx context.Context, t dominio.TenantID, e dominio.Enlace) error {
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
		return noEncontrado("asesor")
	}
	if _, ok := d.enlaces[e.IDPublico]; ok {
		return duplicado("enlace")
	}
	e.CreadoEn = dominio.Instante(e.CreadoEn)
	e.RevocadoEn = instantePtr(e.RevocadoEn)
	d.enlaces[e.IDPublico] = e
	return nil
}

// RotarEnlace implementa almacen.Almacen. El candado cubre la revocación de
// los vigentes y el alta del nuevo.
func (a *Almacen) RotarEnlace(ctx context.Context, t dominio.TenantID, asesorID string, nuevo dominio.Enlace) (dominio.Enlace, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.Enlace{}, err
	}
	if nuevo.AsesorID != asesorID || nuevo.RevocadoEn != nil {
		return dominio.Enlace{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("enlace"))
	}
	if err := nuevo.Validar(); err != nil {
		return dominio.Enlace{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Enlace{}, err
	}
	if _, ok := d.asesores[asesorID]; !ok {
		return dominio.Enlace{}, noEncontrado("asesor")
	}
	if _, ok := d.enlaces[nuevo.IDPublico]; ok {
		return dominio.Enlace{}, duplicado("enlace")
	}
	cuando := dominio.Instante(nuevo.CreadoEn)
	for id, e := range d.enlaces {
		if e.AsesorID != asesorID || e.RevocadoEn != nil {
			continue
		}
		u := cuando
		e.RevocadoEn = &u
		d.enlaces[id] = e
	}
	nuevo.CreadoEn = cuando
	nuevo.RevocadoEn = nil
	d.enlaces[nuevo.IDPublico] = nuevo
	return nuevo, nil
}

// LeerEnlace implementa almacen.Almacen.
func (a *Almacen) LeerEnlace(ctx context.Context, t dominio.TenantID, id string) (dominio.Enlace, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Enlace{}, err
	}
	e, ok := d.enlaces[id]
	if !ok || e.RevocadoEn != nil {
		return dominio.Enlace{}, noEncontrado("enlace")
	}
	return e, nil
}

// GuardarTokenSesion implementa almacen.Almacen. Guarda solo el HMAC.
func (a *Almacen) GuardarTokenSesion(ctx context.Context, t dominio.TenantID, tok dominio.TokenSesion) error {
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
		return noEncontrado("sesión del token")
	}
	tok.Hash = append([]byte(nil), tok.Hash...)
	hx := claveHex(tok.Hash)
	if _, ok := a.tokenPorHash[hx]; ok {
		return duplicado("token de sesión")
	}
	tok.EmitidoEn = dominio.Instante(tok.EmitidoEn)
	tok.VenceEn = dominio.Instante(tok.VenceEn)
	tok.RevocadoEn = instantePtr(tok.RevocadoEn)
	d.tokens[hx] = tok
	a.tokenPorHash[hx] = t
	return nil
}

// BuscarTokenPorHash implementa almacen.Almacen.
func (a *Almacen) BuscarTokenPorHash(ctx context.Context, hash []byte) (dominio.TokenHallado, error) {
	if len(hash) != 32 {
		return dominio.TokenHallado{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return dominio.TokenHallado{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	if a.cerrado {
		return dominio.TokenHallado{}, errores.Envolver(errores.ServicioNoDisponible, fmt.Errorf("almacén cerrado"))
	}
	t, ok := a.tokenPorHash[claveHex(hash)]
	if !ok {
		return dominio.TokenHallado{}, noEncontrado("token de sesión")
	}
	tok, ok := a.tenants[t].tokens[claveHex(hash)]
	if !ok || !bytes.Equal(tok.Hash, hash) {
		return dominio.TokenHallado{}, noEncontrado("token de sesión")
	}
	return dominio.TokenHallado{
		TenantID: t, SesionID: tok.SesionID, VenceEn: tok.VenceEn, Revocado: tok.RevocadoEn != nil,
	}, nil
}

// quitarTokens imita el ON DELETE CASCADE de vc.tokens_sesion. El candado ya está tomado.
func (a *Almacen) quitarTokens(d *datosTenant, sesionID string) {
	for hx, tok := range d.tokens {
		if tok.SesionID == sesionID {
			delete(d.tokens, hx)
			delete(a.tokenPorHash, hx)
		}
	}
}
