package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// GuardarClave implementa almacen.Almacen.
func (a *Almacen) GuardarClave(ctx context.Context, t dominio.TenantID, c dominio.ClaveAPI) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	c.CreadaEn = dominio.Instante(c.CreadaEn)
	origenes := c.Origenes
	if origenes == nil {
		origenes = []string{}
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.claves_api
			(tenant_id, clave_id, tipo, hash, prefijo, nombre, origenes, creada_en, revocada_en)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			string(t), c.ID, string(c.Tipo), c.Hash, c.Prefijo, c.Nombre, origenes, c.CreadaEn, tiempoPtr(c.RevocadaEn))
		return err
	})
}

// BuscarClavePorHash implementa almacen.Almacen. No fija tenant.
func (a *Almacen) BuscarClavePorHash(ctx context.Context, hash []byte) (dominio.ClaveHallada, error) {
	if len(hash) != 32 {
		return dominio.ClaveHallada{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	var h dominio.ClaveHallada
	var idTenant, tipo string
	err := a.pool.QueryRow(ctx, `SELECT tenant_id::text, clave_id, tipo, origenes, revocada
		FROM vc.buscar_clave($1)`, hash).
		Scan(&idTenant, &h.ID, &tipo, &h.Origenes, &h.Revocada)
	if err != nil {
		return dominio.ClaveHallada{}, traducir(err)
	}
	h.TenantID, h.Tipo = dominio.TenantID(idTenant), dominio.TipoClave(tipo)
	return h, nil
}

// ListarClavesWidget implementa almacen.Almacen. No lee el HMAC.
func (a *Almacen) ListarClavesWidget(ctx context.Context, t dominio.TenantID) ([]dominio.ClaveAPI, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return nil, err
	}
	out := []dominio.ClaveAPI{}
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		filas, err := tx.Query(ctx, `SELECT clave_id, prefijo, nombre, origenes, creada_en, revocada_en
			FROM vc.claves_api WHERE tenant_id = $1 AND tipo = 'publica'
			ORDER BY creada_en, clave_id`, string(t))
		if err != nil {
			return err
		}
		defer filas.Close()
		for filas.Next() {
			var c dominio.ClaveAPI
			var rev *time.Time
			if err := filas.Scan(&c.ID, &c.Prefijo, &c.Nombre, &c.Origenes, &c.CreadaEn, &rev); err != nil {
				return err
			}
			c.Tipo = dominio.ClavePublica
			c.CreadaEn = dominio.Instante(c.CreadaEn)
			c.RevocadaEn = rev
			if rev != nil {
				u := dominio.Instante(*rev)
				c.RevocadaEn = &u
			}
			if c.Origenes == nil {
				c.Origenes = []string{}
			}
			out = append(out, c)
		}
		return filas.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// RevocarClaveWidget implementa almacen.Almacen. Solo puede escribir revocada_en.
func (a *Almacen) RevocarClaveWidget(ctx context.Context, t dominio.TenantID, claveID string, ahora time.Time) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if !dominio.IDValido(claveID, dominio.PrefijoClavePublica) || ahora.IsZero() {
		return errores.Nuevo(errores.NoEncontrado)
	}
	ahora = dominio.Instante(ahora)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE vc.claves_api SET revocada_en = $3
			WHERE tenant_id = $1 AND clave_id = $2 AND tipo = 'publica' AND revocada_en IS NULL`,
			string(t), claveID, ahora)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return errores.Nuevo(errores.NoEncontrado)
		}
		return nil
	})
}

// GuardarEnlace implementa almacen.Almacen.
func (a *Almacen) GuardarEnlace(ctx context.Context, t dominio.TenantID, e dominio.Enlace) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := e.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.enlaces (tenant_id, id_publico, asesor_id, creado_en, revocado_en)
			VALUES ($1, $2, $3, $4, $5)`, string(t), e.IDPublico, e.AsesorID, e.CreadoEn, e.RevocadoEn)
		return err
	})
}

// RotarEnlace implementa almacen.Almacen. Una transacción: si el asesor no
// está en el tenant, no se revoca nada.
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
	nuevo.CreadoEn = dominio.Instante(nuevo.CreadoEn)
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var id string
		err := tx.QueryRow(ctx, `SELECT asesor_id FROM vc.asesores WHERE tenant_id = $1 AND asesor_id = $2`,
			string(t), asesorID).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return errores.Nuevo(errores.NoEncontrado)
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE vc.enlaces SET revocado_en = $3
			WHERE tenant_id = $1 AND asesor_id = $2 AND revocado_en IS NULL`,
			string(t), asesorID, nuevo.CreadoEn); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO vc.enlaces (tenant_id, id_publico, asesor_id, creado_en)
			VALUES ($1, $2, $3, $4)`, string(t), nuevo.IDPublico, asesorID, nuevo.CreadoEn)
		return err
	})
	if err != nil {
		return dominio.Enlace{}, err
	}
	nuevo.RevocadoEn = nil
	return nuevo, nil
}

// LeerEnlace implementa almacen.Almacen.
func (a *Almacen) LeerEnlace(ctx context.Context, t dominio.TenantID, id string) (dominio.Enlace, error) {
	var e dominio.Enlace
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT id_publico, asesor_id, creado_en
			FROM vc.enlaces WHERE tenant_id = $1 AND id_publico = $2 AND revocado_en IS NULL`, string(t), id).
			Scan(&e.IDPublico, &e.AsesorID, &e.CreadoEn)
	})
	if err != nil {
		return dominio.Enlace{}, err
	}
	e.CreadoEn = e.CreadoEn.UTC()
	return e, nil
}

// GuardarTokenSesion implementa almacen.Almacen. La tabla y el INSERT ya
// están en la migración 0002; no se agregan privilegios.
func (a *Almacen) GuardarTokenSesion(ctx context.Context, t dominio.TenantID, tok dominio.TokenSesion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := tok.Validar(); err != nil {
		return err
	}
	emitido, vence := dominio.Instante(tok.EmitidoEn), dominio.Instante(tok.VenceEn)
	var rev *time.Time
	if tok.RevocadoEn != nil {
		u := dominio.Instante(*tok.RevocadoEn)
		rev = &u
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.tokens_sesion
			(tenant_id, hash, sesion_id, emitido_en, vence_en, revocado_en)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			string(t), tok.Hash, tok.SesionID, emitido, vence, rev)
		return err
	})
}

// BuscarTokenPorHash implementa almacen.Almacen. No fija tenant.
func (a *Almacen) BuscarTokenPorHash(ctx context.Context, hash []byte) (dominio.TokenHallado, error) {
	if len(hash) != 32 {
		return dominio.TokenHallado{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	var h dominio.TokenHallado
	var idTenant string
	err := a.pool.QueryRow(ctx, `SELECT tenant_id::text, sesion_id, vence_en, revocado
		FROM vc.buscar_token_sesion($1)`, hash).
		Scan(&idTenant, &h.SesionID, &h.VenceEn, &h.Revocado)
	if err != nil {
		return dominio.TokenHallado{}, traducir(err)
	}
	h.TenantID = dominio.TenantID(idTenant)
	h.VenceEn = dominio.Instante(h.VenceEn)
	return h, nil
}
