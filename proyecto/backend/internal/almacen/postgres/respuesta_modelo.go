package postgres

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

func (a *Almacen) AnexarRespuestaModelo(ctx context.Context, t dominio.TenantID, r dominio.RespuestaModelo) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := r.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT 1 FROM vc.sesiones WHERE tenant_id = $1 AND sesion_id = $2`, string(t), r.SesionID).Scan(new(int)); err != nil {
			if err == pgx.ErrNoRows {
				return errores.Nuevo(errores.NoEncontrado)
			}
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO vc.respuestas_modelo
			(tenant_id, sesion_id, turno, registrada_en, salida)
			VALUES ($1, $2, $3, $4, $5)`,
			string(t), r.SesionID, r.Turno, r.RegistradaEn, r.SalidaJSON)
		if err != nil {
			if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
				return errores.Nuevo(errores.EstadoInvalido)
			}
			return err
		}
		return nil
	})
}

func (a *Almacen) ListarRespuestasModeloDeSesion(ctx context.Context, t dominio.TenantID, sesionID string) ([]dominio.RespuestaModelo, error) {
	var out []dominio.RespuestaModelo
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT sesion_id, turno, registrada_en, salida
			FROM vc.respuestas_modelo WHERE tenant_id = $1 AND sesion_id = $2 ORDER BY turno`,
			string(t), sesionID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r dominio.RespuestaModelo
			if err := rows.Scan(&r.SesionID, &r.Turno, &r.RegistradaEn, &r.SalidaJSON); err != nil {
				return err
			}
			r.RegistradaEn = r.RegistradaEn.UTC()
			out = append(out, r)
		}
		if len(out) == 0 {
			if err := tx.QueryRow(ctx, `SELECT 1 FROM vc.sesiones WHERE tenant_id = $1 AND sesion_id = $2`, string(t), sesionID).Scan(new(int)); err != nil {
				if err == pgx.ErrNoRows {
					return errores.Nuevo(errores.NoEncontrado)
				}
				return err
			}
		}
		return rows.Err()
	})
	return out, err
}
