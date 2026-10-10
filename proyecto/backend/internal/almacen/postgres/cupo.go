package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// ReservarTokenMedios implementa almacen.Almacen. Dentro de la transacción
// de enTenant se bloquean las sesiones del tenant y el estado solo cambia
// con un UPDATE condicionado al cupo. Si el INSERT del HMAC falla, la
// transacción deshace el cambio de estado.
// El tope de gasto mensual de Rober sigue sin cifra; no se inventa un importe.
// Esta ruta no está abierta al público.
func (a *Almacen) ReservarTokenMedios(ctx context.Context, t dominio.TenantID, id string, hash []byte, ahora time.Time) (dominio.Sesion, error) {
	hash = append([]byte(nil), hash...)
	var out dominio.Sesion
	var entro bool
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		if len(hash) != 32 {
			return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
		}
		if err := bloquearSesiones(ctx, tx, t); err != nil {
			return err
		}
		s, err := sesionParaActualizar(ctx, tx, t, id)
		if err != nil {
			return err
		}
		var simultaneas, segundos int
		if err := tx.QueryRow(ctx, `SELECT simultaneas_tope, segundos_mes_tope
			FROM vc.tenants WHERE tenant_id = $1`, string(t)).Scan(&simultaneas, &segundos); err != nil {
			return err
		}
		var suma int64
		if err := tx.QueryRow(ctx, `SELECT coalesce(sum(duracion_s), 0)
			FROM vc.sesiones WHERE tenant_id = $1`, string(t)).Scan(&suma); err != nil {
			return err
		}
		if suma >= int64(segundos) {
			return errores.Nuevo(errores.CuotaAgotada)
		}
		switch s.Estado {
		case dominio.EstadoCerrada:
			return errores.Envolver(errores.SesionCerrada, fmt.Errorf("token de medios de sesión cerrada"))
		case dominio.EstadoCreada:
			return errores.Nuevo(errores.ConsentimientoRequerido)
		case dominio.EstadoConsentida:
			tag, err := tx.Exec(ctx, `UPDATE vc.sesiones SET estado = $3
				WHERE tenant_id = $1 AND sesion_id = $2 AND estado = $4
				  AND (SELECT count(*) FROM vc.sesiones WHERE tenant_id = $1 AND estado = $3) < $5`,
				string(t), s.ID, string(dominio.EstadoEnCurso), string(dominio.EstadoConsentida), simultaneas)
			if err != nil {
				return err
			}
			if tag.RowsAffected() != 1 {
				return errores.Nuevo(errores.CuotaAgotada)
			}
			if err := s.Comenzar(); err != nil {
				return err
			}
			entro = true
		case dominio.EstadoEnCurso:
		default:
			return errores.Envolver(errores.EstadoInvalido, fmt.Errorf("estado %s", s.Estado))
		}
		if err := revocarTokensMedios(ctx, tx, t, s.ID, ahora); err != nil {
			return err
		}
		emitido := dominio.Instante(ahora)
		vence := dominio.Instante(ahora.Add(dominio.VigenciaTokenMedios))
		if _, err := tx.Exec(ctx, `INSERT INTO vc.tokens_sesion
			(tenant_id, hash, sesion_id, emitido_en, vence_en)
			VALUES ($1, $2, $3, $4, $5)`,
			string(t), hash, s.ID, emitido, vence); err != nil {
			return err
		}
		out = s
		return nil
	})
	if err != nil {
		return dominio.Sesion{}, err
	}
	if entro {
		a.anotarEnCurso(t, id, ahora)
	}
	return out, nil
}

// bloquearSesiones toma las filas del tenant en un orden fijo para que dos
// reservas no cuenten el mismo cupo. No bloquea vc.tenants: ese UPDATE no
// está concedido.
func bloquearSesiones(ctx context.Context, tx pgx.Tx, t dominio.TenantID) error {
	filas, err := tx.Query(ctx, `SELECT sesion_id FROM vc.sesiones
		WHERE tenant_id = $1 ORDER BY sesion_id FOR UPDATE`, string(t))
	if err != nil {
		return err
	}
	defer filas.Close()
	for filas.Next() {
		var id string
		if err := filas.Scan(&id); err != nil {
			return err
		}
	}
	return filas.Err()
}

// revocarTokensMedios marca los HMAC cuya vida es la del token de medios.
// El vc_ses_ dura una hora y no entra en el predicado.
func revocarTokensMedios(ctx context.Context, tx pgx.Tx, t dominio.TenantID, sesionID string, ahora time.Time) error {
	_, err := tx.Exec(ctx, `UPDATE vc.tokens_sesion SET revocado_en = $3
		WHERE tenant_id = $1 AND sesion_id = $2 AND revocado_en IS NULL
		  AND vence_en <= emitido_en + ($4::int * interval '1 second')`,
		string(t), sesionID, dominio.Instante(ahora), int(dominio.VigenciaTokenMedios/time.Second))
	return err
}
