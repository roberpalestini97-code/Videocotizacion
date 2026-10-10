package memoria

import (
	"context"
	"fmt"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// ReservarTokenMedios implementa almacen.Almacen. El candado único hace
// atómicos el cupo y el cambio de estado: o se guardan los dos, o ninguno.
// El tope de gasto mensual de Rober sigue sin cifra; no se inventa un importe.
func (a *Almacen) ReservarTokenMedios(ctx context.Context, t dominio.TenantID, id string, hash []byte, ahora time.Time) (dominio.Sesion, error) {
	hash = append([]byte(nil), hash...)
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Sesion{}, err
	}
	if len(hash) != 32 {
		return dominio.Sesion{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	s, ok := d.sesiones[id]
	if !ok {
		return dominio.Sesion{}, noEncontrado("sesión")
	}
	s = copiarSesion(s)
	if suma, tope := duracionAcumulada(d), int64(d.tenant.SegundosMesTope); suma >= tope {
		return dominio.Sesion{}, errores.Nuevo(errores.CuotaAgotada)
	}
	entrar := false
	switch s.Estado {
	case dominio.EstadoCerrada:
		return dominio.Sesion{}, errores.Envolver(errores.SesionCerrada, fmt.Errorf("token de medios de sesión cerrada"))
	case dominio.EstadoCreada:
		return dominio.Sesion{}, errores.Nuevo(errores.ConsentimientoRequerido)
	case dominio.EstadoConsentida:
		if enCurso(d) >= d.tenant.SimultaneasTope {
			return dominio.Sesion{}, errores.Nuevo(errores.CuotaAgotada)
		}
		entrar = true
	case dominio.EstadoEnCurso:
	default:
		return dominio.Sesion{}, errores.Envolver(errores.EstadoInvalido, fmt.Errorf("estado %s", s.Estado))
	}
	tok := dominio.TokenSesion{
		Hash: hash, SesionID: s.ID, EmitidoEn: dominio.Instante(ahora),
		VenceEn: dominio.Instante(ahora.Add(dominio.VigenciaTokenMedios)),
	}
	if err := tok.Validar(); err != nil {
		return dominio.Sesion{}, err
	}
	hx := claveHex(hash)
	if _, ok := a.tokenPorHash[hx]; ok {
		return dominio.Sesion{}, duplicado("token de medios")
	}
	if entrar {
		if err := s.Comenzar(); err != nil {
			return dominio.Sesion{}, err
		}
		d.marchas[id] = marchaSesion{enCursoEn: dominio.Instante(ahora)}
		d.sesiones[id] = s
	}
	revocarTokensMedios(d, id, ahora)
	d.tokens[hx] = tok
	a.tokenPorHash[hx] = t
	return copiarSesion(s), nil
}

func duracionAcumulada(d *datosTenant) int64 {
	var suma int64
	for _, s := range d.sesiones {
		suma += int64(s.DuracionS)
	}
	return suma
}

func enCurso(d *datosTenant) int {
	n := 0
	for _, s := range d.sesiones {
		if s.Estado == dominio.EstadoEnCurso {
			n++
		}
	}
	return n
}

// revocarTokensMedios deja sin vigencia los HMAC de medios de la sesión.
// No toca el vc_ses_: ese vence mucho después de VigenciaTokenMedios.
// El candado del almacén ya está tomado.
func revocarTokensMedios(d *datosTenant, sesionID string, ahora time.Time) {
	limite := dominio.VigenciaTokenMedios
	for hx, tok := range d.tokens {
		if tok.SesionID != sesionID || tok.RevocadoEn != nil {
			continue
		}
		if tok.VenceEn.After(tok.EmitidoEn.Add(limite)) {
			continue
		}
		cuando := ahora
		tok.RevocadoEn = instantePtr(&cuando)
		d.tokens[hx] = tok
	}
}
