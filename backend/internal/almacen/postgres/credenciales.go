package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// CrearClaveAPI implementa almacen.Credenciales. Solo se guarda el HMAC (R1).
func (a *Almacen) CrearClaveAPI(ctx context.Context, t dominio.TenantID, c dominio.ClaveAPI) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	origenes := c.Origenes
	if origenes == nil {
		origenes = []string{}
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.claves_api
			(tenant_id, clave_id, tipo, hash, prefijo, origenes, creada_en, revocada_en)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			string(t), c.ID, string(c.Tipo), c.Hash, c.Prefijo, origenes, c.CreadaEn, c.RevocadaEn)
		return err
	})
}

// RevocarClaveAPI implementa almacen.Credenciales (idempotente).
func (a *Almacen) RevocarClaveAPI(ctx context.Context, t dominio.TenantID, id string, ahora time.Time) error {
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE vc.claves_api SET revocada_en = coalesce(revocada_en, $3)
			WHERE tenant_id = $1 AND clave_id = $2`, string(t), id, dominio.Instante(ahora))
		if err == nil && tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return err
	})
}

// CrearEnlace implementa almacen.Credenciales.
func (a *Almacen) CrearEnlace(ctx context.Context, t dominio.TenantID, e dominio.Enlace) error {
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

// LeerEnlace implementa almacen.Credenciales.
func (a *Almacen) LeerEnlace(ctx context.Context, t dominio.TenantID, id string) (dominio.Enlace, error) {
	var e dominio.Enlace
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT id_publico, asesor_id, creado_en, revocado_en FROM vc.enlaces
			WHERE tenant_id = $1 AND id_publico = $2`, string(t), id).Scan(&e.IDPublico, &e.AsesorID, &e.CreadoEn, &e.RevocadoEn)
	})
	e.CreadoEn = e.CreadoEn.UTC()
	e.RevocadoEn = utc(e.RevocadoEn)
	return e, err
}

// CrearSesionConToken implementa almacen.Credenciales: sesión y token en una
// sola transacción.
func (a *Almacen) CrearSesionConToken(ctx context.Context, t dominio.TenantID, s dominio.Sesion, tok dominio.TokenSesion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := s.Validar(); err != nil {
		return err
	}
	if err := tok.Validar(); err != nil {
		return err
	}
	if tok.SesionID != s.ID {
		return errores.Envolver(errores.ValidacionFallida, errors.New("el token es de otra sesión"))
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		if err := insertarSesion(ctx, tx, t, s); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO vc.tokens_sesion (tenant_id, hash, sesion_id, emitido_en, vence_en, revocado_en)
			VALUES ($1, $2, $3, $4, $5, $6)`, string(t), tok.Hash, tok.SesionID, tok.EmitidoEn, tok.VenceEn, tok.RevocadoEn)
		return err
	})
}

// RevocarTokensDeSesion implementa almacen.Credenciales.
func (a *Almacen) RevocarTokensDeSesion(ctx context.Context, t dominio.TenantID, sesionID string, ahora time.Time) error {
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var existe bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM vc.sesiones WHERE tenant_id = $1 AND sesion_id = $2)`,
			string(t), sesionID).Scan(&existe); err != nil {
			return err
		}
		if !existe {
			return pgx.ErrNoRows
		}
		_, err := tx.Exec(ctx, `UPDATE vc.tokens_sesion SET revocado_en = $3
			WHERE tenant_id = $1 AND sesion_id = $2 AND revocado_en IS NULL`, string(t), sesionID, dominio.Instante(ahora))
		return err
	})
}

// Consumo implementa almacen.Credenciales (usa sesiones_por_creacion).
func (a *Almacen) Consumo(ctx context.Context, t dominio.TenantID, inicioMes, inicioActivas time.Time) (dominio.Consumo, error) {
	var c dominio.Consumo
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT
				coalesce(sum(duracion_s) FILTER (WHERE creada_en >= $2), 0),
				count(*) FILTER (WHERE creada_en >= $3 AND estado IN ('consentida', 'en_curso'))
			FROM vc.sesiones WHERE tenant_id = $1 AND creada_en >= least($2::timestamptz, $3::timestamptz)`,
			string(t), inicioMes, inicioActivas).Scan(&c.SegundosMes, &c.Activas)
	})
	return c, err
}

// ObtenerDerivacion implementa almacen.Credenciales.
func (a *Almacen) ObtenerDerivacion(ctx context.Context, t dominio.TenantID, nueva dominio.Derivacion) (dominio.Derivacion, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.Derivacion{}, err
	}
	if err := nueva.Validar(); err != nil {
		return dominio.Derivacion{}, err
	}
	var d dominio.Derivacion
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO vc.derivaciones (tenant_id, sesion_id, codigo_referencia, generada_en)
			VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, sesion_id) DO NOTHING`,
			string(t), nueva.SesionID, nueva.CodigoReferencia, nueva.GeneradaEn); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `SELECT sesion_id, codigo_referencia, generada_en FROM vc.derivaciones
			WHERE tenant_id = $1 AND sesion_id = $2`, string(t), nueva.SesionID).Scan(&d.SesionID, &d.CodigoReferencia, &d.GeneradaEn)
	})
	d.GeneradaEn = d.GeneradaEn.UTC()
	return d, err
}

// global corre una consulta sin tenant (solo las funciones SECURITY DEFINER
// de autenticación) con el tiempo límite del almacén.
func (a *Almacen) global(ctx context.Context, fn func(ctx context.Context) error) error {
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	return traducir(fn(ctx))
}

// BuscarClaveAPI implementa almacen.Autenticacion vía vc.buscar_clave.
func (a *Almacen) BuscarClaveAPI(ctx context.Context, h []byte) (dominio.TenantID, dominio.ClaveAPI, error) {
	if len(h) != 32 {
		return "", dominio.ClaveAPI{}, errores.Nuevo(errores.NoEncontrado)
	}
	var tenant, tipo string
	c := dominio.ClaveAPI{Hash: h}
	err := a.global(ctx, func(ctx context.Context) error {
		return a.pool.QueryRow(ctx, `SELECT tenant_id::text, clave_id, tipo, prefijo, origenes, creada_en, revocada_en
			FROM vc.buscar_clave($1)`, h).Scan(&tenant, &c.ID, &tipo, &c.Prefijo, &c.Origenes, &c.CreadaEn, &c.RevocadaEn)
	})
	c.Tipo, c.CreadaEn, c.RevocadaEn = dominio.TipoClave(tipo), c.CreadaEn.UTC(), utc(c.RevocadaEn)
	if len(c.Origenes) == 0 {
		c.Origenes = nil
	}
	return dominio.TenantID(tenant), c, err
}

// BuscarTokenSesion implementa almacen.Autenticacion vía vc.buscar_token_sesion.
func (a *Almacen) BuscarTokenSesion(ctx context.Context, h []byte) (dominio.TenantID, dominio.TokenSesion, error) {
	if len(h) != 32 {
		return "", dominio.TokenSesion{}, errores.Nuevo(errores.NoEncontrado)
	}
	var tenant string
	tok := dominio.TokenSesion{Hash: h}
	err := a.global(ctx, func(ctx context.Context) error {
		return a.pool.QueryRow(ctx, `SELECT tenant_id::text, sesion_id, emitido_en, vence_en, revocado_en
			FROM vc.buscar_token_sesion($1)`, h).Scan(&tenant, &tok.SesionID, &tok.EmitidoEn, &tok.VenceEn, &tok.RevocadoEn)
	})
	tok.EmitidoEn, tok.VenceEn, tok.RevocadoEn = tok.EmitidoEn.UTC(), tok.VenceEn.UTC(), utc(tok.RevocadoEn)
	return dominio.TenantID(tenant), tok, err
}
