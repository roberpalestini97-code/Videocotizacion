package memoria

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// BuscarIngresoPorHash implementa almacen.Almacen. No exige tenant.
func (a *Almacen) BuscarIngresoPorHash(ctx context.Context, hashCookie []byte) (dominio.IngresoHallado, error) {
	if len(hashCookie) != 32 {
		return dominio.IngresoHallado{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return dominio.IngresoHallado{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	if a.cerrado {
		return dominio.IngresoHallado{}, errores.Envolver(errores.ServicioNoDisponible, fmt.Errorf("almacén cerrado"))
	}
	t, ok := a.ingresoPorHash[claveHex(hashCookie)]
	if !ok {
		return dominio.IngresoHallado{}, noEncontrado("ingreso")
	}
	p, ok := a.tenants[t].ingresos[claveHex(hashCookie)]
	if !ok {
		return dominio.IngresoHallado{}, noEncontrado("ingreso")
	}
	return dominio.IngresoHallado{TenantID: t, IngresoPanel: clonarIngreso(p)}, nil
}

// GuardarSecretoTOTP implementa almacen.Almacen. El secreto en claro no entra.
func (a *Almacen) GuardarSecretoTOTP(ctx context.Context, t dominio.TenantID, s dominio.SecretoTOTP) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := s.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[s.AsesorID]; !ok {
		return noEncontrado("asesor")
	}
	if _, ok := d.secretos[s.AsesorID]; ok {
		return duplicado("secreto totp")
	}
	s.Cifrado = bytes.Clone(s.Cifrado)
	s.CreadaEn = dominio.Instante(s.CreadaEn)
	d.secretos[s.AsesorID] = s
	return nil
}

// LeerSecretoTOTP implementa almacen.Almacen.
func (a *Almacen) LeerSecretoTOTP(ctx context.Context, t dominio.TenantID, asesorID string) (dominio.SecretoTOTP, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.SecretoTOTP{}, err
	}
	s, ok := d.secretos[asesorID]
	if !ok {
		return dominio.SecretoTOTP{}, noEncontrado("secreto totp")
	}
	s.Cifrado = bytes.Clone(s.Cifrado)
	s.CreadaEn = dominio.Instante(s.CreadaEn)
	return s, nil
}

// GuardarCodigoRecuperacion implementa almacen.Almacen. Solo el HMAC.
func (a *Almacen) GuardarCodigoRecuperacion(ctx context.Context, t dominio.TenantID, c dominio.CodigoRecuperacion) error {
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
	for _, otro := range d.codigos[c.AsesorID] {
		if bytes.Equal(otro.Hash, c.Hash) {
			return duplicado("código de recuperación")
		}
	}
	c.Hash = bytes.Clone(c.Hash)
	d.codigos[c.AsesorID] = append(d.codigos[c.AsesorID], c)
	return nil
}

// ListarCodigosRecuperacion implementa almacen.Almacen.
func (a *Almacen) ListarCodigosRecuperacion(ctx context.Context, t dominio.TenantID, asesorID string) ([]dominio.CodigoRecuperacion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return nil, err
	}
	var out []dominio.CodigoRecuperacion
	for _, c := range d.codigos[asesorID] {
		c.Hash = bytes.Clone(c.Hash)
		out = append(out, c)
	}
	return out, nil
}

// AbrirSesionPanel implementa almacen.Almacen. El candado cubre el consumo
// del factor, la revocación de la cookie vieja y el alta de la nueva.
func (a *Almacen) AbrirSesionPanel(ctx context.Context, t dominio.TenantID, ap dominio.AperturaPanel) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := ap.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	hx := claveHex(ap.HashPrevio)
	p, ok := d.ingresos[hx]
	if !ok || !p.Preliminar || p.RevocadaEn != nil || !ap.Ahora.Before(p.VenceEn) || p.AsesorID != ap.Nueva.AsesorID {
		return errores.Nuevo(errores.SesionVencida)
	}
	if _, ok := d.asesores[p.AsesorID]; !ok {
		return noEncontrado("asesor")
	}
	nuevoHex := claveHex(ap.Nueva.HashCookie)
	if _, ok := a.ingresoPorHash[nuevoHex]; ok {
		return duplicado("ingreso")
	}
	if ap.Paso != nil {
		if _, usado := d.pasos[p.AsesorID][*ap.Paso]; usado {
			return errores.Nuevo(errores.TotpInvalido)
		}
	} else if indiceCodigo(d.codigos[p.AsesorID], ap.HashRecuperacion) < 0 {
		return errores.Nuevo(errores.TotpInvalido)
	}
	if ap.Paso != nil {
		if d.pasos[p.AsesorID] == nil {
			d.pasos[p.AsesorID] = map[int64]struct{}{}
		}
		d.pasos[p.AsesorID][*ap.Paso] = struct{}{}
	} else {
		i := indiceCodigo(d.codigos[p.AsesorID], ap.HashRecuperacion)
		if !d.codigos[p.AsesorID][i].Reutilizable {
			d.codigos[p.AsesorID][i].Usado = true
		}
	}
	cuando := dominio.Instante(ap.Ahora)
	p.RevocadaEn = &cuando
	d.ingresos[hx] = p
	nueva := clonarIngreso(ap.Nueva)
	nueva.AsesorID = p.AsesorID
	nueva.Preliminar = false
	d.ingresos[nuevoHex] = nueva
	a.ingresoPorHash[nuevoHex] = t
	return nil
}

// OtorgarReautenticacion implementa almacen.Almacen. El candado cubre el
// consumo del paso y el fin de la ventana. Un paso usado no mueve la sesión.
func (a *Almacen) OtorgarReautenticacion(ctx context.Context, t dominio.TenantID, hashCookie []byte, paso int64, hasta, ahora time.Time) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if len(hashCookie) != 32 {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	if ahora.IsZero() || !hasta.After(ahora) {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("ventana"))
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
	if usados := d.pasos[p.AsesorID]; usados != nil {
		if _, usado := usados[paso]; usado {
			return errores.Nuevo(errores.TotpInvalido)
		}
	} else {
		d.pasos[p.AsesorID] = map[int64]struct{}{}
	}
	d.pasos[p.AsesorID][paso] = struct{}{}
	u := dominio.Instante(hasta)
	p.ReautenticadoHasta = &u
	d.ingresos[hx] = p
	return nil
}

func indiceCodigo(lista []dominio.CodigoRecuperacion, hash []byte) int {
	encontrado := -1
	for i := range lista {
		if !lista[i].Usado && bytes.Equal(lista[i].Hash, hash) {
			encontrado = i
		}
	}
	return encontrado
}
