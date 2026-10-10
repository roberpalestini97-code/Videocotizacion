package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// GuardarConsentimientoAsesor implementa almacen.Almacen. Solo INSERT.
func (a *Almacen) GuardarConsentimientoAsesor(ctx context.Context, t dominio.TenantID, c dominio.ConsentimientoAsesor) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	c.AceptadoEn = dominio.Instante(c.AceptadoEn)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM vc.asesores WHERE tenant_id = $1 AND asesor_id = $2`,
			string(t), c.AsesorID).Scan(&n); err != nil {
			return err
		}
		if n != 1 {
			return errores.Nuevo(errores.NoEncontrado)
		}
		_, err := tx.Exec(ctx, `INSERT INTO vc.consentimientos_asesor
			(tenant_id, asesor_id, aviso_version, aceptado_en) VALUES ($1, $2, $3, $4)`,
			string(t), c.AsesorID, c.Version, c.AceptadoEn)
		return err
	})
}

// LeerConsentimientoAsesor implementa almacen.Almacen.
func (a *Almacen) LeerConsentimientoAsesor(ctx context.Context, t dominio.TenantID, asesorID string) (dominio.ConsentimientoAsesor, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.ConsentimientoAsesor{}, err
	}
	var c dominio.ConsentimientoAsesor
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `SELECT asesor_id, aviso_version, aceptado_en
			FROM vc.consentimientos_asesor WHERE tenant_id = $1 AND asesor_id = $2`,
			string(t), asesorID).Scan(&c.AsesorID, &c.Version, &c.AceptadoEn)
		if errors.Is(err, pgx.ErrNoRows) {
			return errores.Nuevo(errores.NoEncontrado)
		}
		c.AceptadoEn = dominio.Instante(c.AceptadoEn)
		return err
	})
	return c, err
}

// AnexarLectura implementa almacen.Almacen. Solo INSERT. No hay columnas de datos personales.
func (a *Almacen) AnexarLectura(ctx context.Context, t dominio.TenantID, l dominio.Lectura) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := l.Validar(); err != nil {
		return err
	}
	l.OcurridoEn = dominio.Instante(l.OcurridoEn)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM vc.asesores WHERE tenant_id = $1 AND asesor_id = $2`,
			string(t), l.AsesorID).Scan(&n); err != nil {
			return err
		}
		if n != 1 {
			return errores.Nuevo(errores.NoEncontrado)
		}
		_, err := tx.Exec(ctx, `INSERT INTO vc.lecturas
			(tenant_id, registro_id, ocurrido_en, asesor_id, accion, recurso_id)
			VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))`,
			string(t), l.ID, l.OcurridoEn, l.AsesorID, string(l.Accion), l.RecursoID)
		return err
	})
}

// ListarLecturasDelAsesor implementa almacen.Almacen.
func (a *Almacen) ListarLecturasDelAsesor(ctx context.Context, t dominio.TenantID, asesorID string) ([]dominio.Lectura, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return nil, err
	}
	out := []dominio.Lectura{}
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		filas, err := tx.Query(ctx, `SELECT registro_id, ocurrido_en, asesor_id, accion, recurso_id
			FROM vc.lecturas
			WHERE tenant_id = $1 AND (
				asesor_id = $2
				OR recurso_id IN (SELECT sesion_id FROM vc.sesiones WHERE tenant_id = $1 AND asesor_id = $2)
			)
			ORDER BY ocurrido_en, registro_id
			LIMIT 10000`, string(t), asesorID)
		if err != nil {
			return err
		}
		defer filas.Close()
		for filas.Next() {
			var l dominio.Lectura
			var recurso *string
			if err := filas.Scan(&l.ID, &l.OcurridoEn, &l.AsesorID, &l.Accion, &recurso); err != nil {
				return err
			}
			l.OcurridoEn = dominio.Instante(l.OcurridoEn)
			if recurso != nil {
				l.RecursoID = *recurso
			}
			out = append(out, l)
		}
		return filas.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ConsumoDelAsesor implementa almacen.Almacen. Suma duracion_s del mes de este asesor.
func (a *Almacen) ConsumoDelAsesor(ctx context.Context, t dominio.TenantID, asesorID string, ahora time.Time) (almacen.ConsumoContado, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return almacen.ConsumoContado{}, err
	}
	inicio := time.Date(ahora.UTC().Year(), ahora.UTC().Month(), 1, 0, 0, 0, 0, time.UTC)
	fin := inicio.AddDate(0, 1, 0)
	var out almacen.ConsumoContado
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM vc.asesores WHERE tenant_id = $1 AND asesor_id = $2`,
			string(t), asesorID).Scan(&n); err != nil {
			return err
		}
		if n != 1 {
			return errores.Nuevo(errores.NoEncontrado)
		}
		if err := tx.QueryRow(ctx, `SELECT simultaneas_tope, segundos_mes_tope FROM vc.tenants WHERE tenant_id = $1`,
			string(t)).Scan(&out.SimultaneasTope, &out.SegundosTope); err != nil {
			return err
		}
		var segundos int64
		if err := tx.QueryRow(ctx, `SELECT coalesce(sum(duracion_s), 0) FROM vc.sesiones
			WHERE tenant_id = $1 AND asesor_id = $2 AND creada_en >= $3 AND creada_en < $4`,
			string(t), asesorID, inicio, fin).Scan(&segundos); err != nil {
			return err
		}
		if segundos > 100000000 {
			segundos = 100000000
		}
		out.SegundosUsados = int(segundos)
		return tx.QueryRow(ctx, `SELECT count(*) FROM vc.sesiones
			WHERE tenant_id = $1 AND asesor_id = $2 AND estado = 'en_curso'`,
			string(t), asesorID).Scan(&out.SimultaneasEnCurso)
	})
	return out, err
}
