package memoria

import (
	"context"
	"fmt"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// BuscarDatosMedios implementa almacen.Almacen. El id es único en la práctica
// (128 bits); si aparece en más de un tenant no se elige uno.
func (a *Almacen) BuscarDatosMedios(ctx context.Context, id string) (almacen.DatosMedios, error) {
	if !dominio.IDValido(id, dominio.PrefijoSesion) {
		return almacen.DatosMedios{}, noEncontrado("sesión")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return almacen.DatosMedios{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	if a.cerrado {
		return almacen.DatosMedios{}, errores.Envolver(errores.ServicioNoDisponible, fmt.Errorf("almacén cerrado"))
	}
	var hall almacen.DatosMedios
	n := 0
	for tid, d := range a.tenants {
		s, ok := d.sesiones[id]
		if !ok {
			continue
		}
		n++
		s = copiarSesion(s)
		hall = almacen.DatosMedios{TenantID: tid, Estado: s.Estado, ClaveID: s.ClaveID, Origenes: s.Origenes}
	}
	if n != 1 {
		return almacen.DatosMedios{}, noEncontrado("sesión")
	}
	return hall, nil
}

// ConsumirTokenMedios implementa almacen.Almacen. El candado ya cubre la
// carrera de dos usos. Un HMAC de otra sesión o de otro tenant no se toca.
func (a *Almacen) ConsumirTokenMedios(ctx context.Context, t dominio.TenantID, id string, hash []byte, ahora time.Time) error {
	hash = append([]byte(nil), hash...)
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if len(hash) != 32 || !dominio.IDValido(id, dominio.PrefijoSesion) {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("token de medios"))
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	tok, ok := d.tokens[claveHex(hash)]
	if !ok || tok.SesionID != id || !tokenMediosVigente(tok, ahora) {
		return errores.Envolver(errores.CredencialInvalida, fmt.Errorf("token de medios"))
	}
	cuando := dominio.Instante(ahora)
	tok.RevocadoEn = &cuando
	d.tokens[claveHex(hash)] = tok
	return nil
}

func tokenMediosVigente(tok dominio.TokenSesion, ahora time.Time) bool {
	if tok.RevocadoEn != nil {
		return false
	}
	ahora = dominio.Instante(ahora)
	if !tok.VenceEn.After(ahora) {
		return false
	}
	// El vc_ses_ dura una hora. Solo se consume el de medios (30 s).
	return !tok.VenceEn.After(tok.EmitidoEn.Add(dominio.VigenciaTokenMedios))
}
