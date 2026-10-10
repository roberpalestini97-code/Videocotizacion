package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// RegistrarContacto implementa almacen.Almacen. La tabla no tiene UPDATE ni
// DELETE para vc_api: un segundo insert choca con la clave y no pisa la fila.
func (a *Almacen) RegistrarContacto(ctx context.Context, t dominio.TenantID, c dominio.Contacto, ahora time.Time) (dominio.Contacto, error) {
	var out dominio.Contacto
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		s, err := sesionParaActualizar(ctx, tx, t, c.SesionID)
		if err != nil {
			return err
		}
		var ya int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM vc.contactos
			WHERE tenant_id = $1 AND sesion_id = $2`, string(t), c.SesionID).Scan(&ya); err != nil {
			return err
		}
		if ya > 0 {
			return errores.Envolver(errores.ContactoYaRegistrado, fmt.Errorf("contacto ya registrado"))
		}
		var dias int
		if err := tx.QueryRow(ctx, `SELECT retencion_dias FROM vc.tenants WHERE tenant_id = $1`, string(t)).Scan(&dias); err != nil {
			return err
		}
		c.AsesorID = s.AsesorID
		c.RegistradoEn = dominio.Instante(ahora)
		c.BorrarDespuesDe = c.RegistradoEn.AddDate(0, 0, dias)
		if err := c.Validar(); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO vc.contactos
			(tenant_id, sesion_id, asesor_id, nombre, telefono, email, preferencia, aviso_version, registrado_en, borrar_despues_de)
			VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), $8, $9, $10)`,
			string(t), c.SesionID, c.AsesorID, c.Nombre, c.Telefono, c.Email, c.Preferencia,
			c.AvisoVersion, c.RegistradoEn, c.BorrarDespuesDe)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return errores.Envolver(errores.ContactoYaRegistrado, err)
			}
			return err
		}
		out = c
		return nil
	})
	return out, err
}

// LeerContacto implementa almacen.Almacen.
func (a *Almacen) LeerContacto(ctx context.Context, t dominio.TenantID, sesionID string) (dominio.Contacto, error) {
	var c dominio.Contacto
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var tel, email, pref *string
		err := tx.QueryRow(ctx, `SELECT sesion_id, asesor_id, nombre, telefono, email, preferencia,
			aviso_version, registrado_en, borrar_despues_de
			FROM vc.contactos WHERE tenant_id = $1 AND sesion_id = $2`, string(t), sesionID).
			Scan(&c.SesionID, &c.AsesorID, &c.Nombre, &tel, &email, &pref, &c.AvisoVersion, &c.RegistradoEn, &c.BorrarDespuesDe)
		if tel != nil {
			c.Telefono = *tel
		}
		if email != nil {
			c.Email = *email
		}
		if pref != nil {
			c.Preferencia = *pref
		}
		c.RegistradoEn, c.BorrarDespuesDe = dominio.Instante(c.RegistradoEn), dominio.Instante(c.BorrarDespuesDe)
		return err
	})
	return c, err
}
