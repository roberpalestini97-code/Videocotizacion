package postgres

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// BuscarIngresoPorHash implementa almacen.Almacen. No fija tenant.
func (a *Almacen) BuscarIngresoPorHash(ctx context.Context, hashCookie []byte) (dominio.IngresoHallado, error) {
	if len(hashCookie) != 32 {
		return dominio.IngresoHallado{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	var h dominio.IngresoHallado
	var idTenant string
	var revocada bool
	var inact *time.Time
	err := a.pool.QueryRow(ctx, `SELECT tenant_id::text, asesor_id, hash_csrf, emitida_en, vence_en, preliminar, revocada, vence_inactividad
		FROM vc.buscar_ingreso_panel($1)`, hashCookie).
		Scan(&idTenant, &h.AsesorID, &h.HashCSRF, &h.EmitidaEn, &h.VenceEn, &h.Preliminar, &revocada, &inact)
	if err != nil {
		return dominio.IngresoHallado{}, traducir(err)
	}
	if revocada {
		u := h.VenceEn
		h.RevocadaEn = &u
	}
	if inact != nil {
		h.VenceInactividad = *inact
	}
	h.TenantID = dominio.TenantID(idTenant)
	h.HashCookie = bytes.Clone(hashCookie)
	h.IngresoPanel = normalizarIngreso(h.IngresoPanel)
	if revocada && h.RevocadaEn == nil {
		u := h.EmitidaEn
		h.RevocadaEn = &u
	}
	return h, nil
}

// GuardarSecretoTOTP implementa almacen.Almacen.
func (a *Almacen) GuardarSecretoTOTP(ctx context.Context, t dominio.TenantID, s dominio.SecretoTOTP) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := s.Validar(); err != nil {
		return err
	}
	s.CreadaEn = dominio.Instante(s.CreadaEn)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.secretos_totp (tenant_id, asesor_id, cifrado, creada_en)
			VALUES ($1, $2, $3, $4)`, string(t), s.AsesorID, s.Cifrado, s.CreadaEn)
		return err
	})
}

// LeerSecretoTOTP implementa almacen.Almacen.
func (a *Almacen) LeerSecretoTOTP(ctx context.Context, t dominio.TenantID, asesorID string) (dominio.SecretoTOTP, error) {
	var s dominio.SecretoTOTP
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT asesor_id, cifrado, creada_en FROM vc.secretos_totp
			WHERE tenant_id = $1 AND asesor_id = $2`, string(t), asesorID).
			Scan(&s.AsesorID, &s.Cifrado, &s.CreadaEn)
	})
	if err != nil {
		return dominio.SecretoTOTP{}, err
	}
	s.Cifrado = bytes.Clone(s.Cifrado)
	s.CreadaEn = dominio.Instante(s.CreadaEn)
	return s, nil
}

// GuardarCodigoRecuperacion implementa almacen.Almacen.
func (a *Almacen) GuardarCodigoRecuperacion(ctx context.Context, t dominio.TenantID, c dominio.CodigoRecuperacion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.codigos_recuperacion (tenant_id, asesor_id, hash, metodo)
			VALUES ($1, $2, $3, $4)`, string(t), c.AsesorID, c.Hash, c.Metodo)
		return err
	})
}

// ListarCodigosRecuperacion implementa almacen.Almacen.
func (a *Almacen) ListarCodigosRecuperacion(ctx context.Context, t dominio.TenantID, asesorID string) ([]dominio.CodigoRecuperacion, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return nil, err
	}
	var out []dominio.CodigoRecuperacion
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		filas, err := tx.Query(ctx, `SELECT asesor_id, hash, metodo, usado_en IS NOT NULL
			FROM vc.codigos_recuperacion WHERE tenant_id = $1 AND asesor_id = $2 ORDER BY hash`,
			string(t), asesorID)
		if err != nil {
			return err
		}
		defer filas.Close()
		for filas.Next() {
			var c dominio.CodigoRecuperacion
			if err := filas.Scan(&c.AsesorID, &c.Hash, &c.Metodo, &c.Usado); err != nil {
				return err
			}
			c.Hash = bytes.Clone(c.Hash)
			out = append(out, c)
		}
		return filas.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// AbrirSesionPanel implementa almacen.Almacen. Una transacción: si el factor
// ya se usó, no se revoca la cookie.
func (a *Almacen) AbrirSesionPanel(ctx context.Context, t dominio.TenantID, ap dominio.AperturaPanel) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := ap.Validar(); err != nil {
		return err
	}
	ap.Nueva.EmitidaEn = dominio.Instante(ap.Nueva.EmitidaEn)
	ap.Nueva.VenceEn = dominio.Instante(ap.Nueva.VenceEn)
	ahora := dominio.Instante(ap.Ahora)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var asesor string
		var preliminar bool
		var revocada *time.Time
		var vence time.Time
		err := tx.QueryRow(ctx, `SELECT asesor_id, preliminar, revocada_en, vence_en
			FROM vc.ingresos_panel WHERE tenant_id = $1 AND hash_cookie = $2`,
			string(t), ap.HashPrevio).Scan(&asesor, &preliminar, &revocada, &vence)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && (!preliminar || revocada != nil || !ahora.Before(vence) || asesor != ap.Nueva.AsesorID)) {
			return errores.Nuevo(errores.SesionVencida)
		}
		if err != nil {
			return err
		}
		if ap.Paso != nil {
			_, err = tx.Exec(ctx, `INSERT INTO vc.pasos_totp (tenant_id, asesor_id, paso, usado_en)
				VALUES ($1, $2, $3, $4)`, string(t), asesor, *ap.Paso, ahora)
			if err != nil {
				var pgErr *pgconn.PgError
				if errors.As(err, &pgErr) && pgErr.Code == "23505" {
					return errores.Nuevo(errores.TotpInvalido)
				}
				return err
			}
		} else {
			tag, err := tx.Exec(ctx, `UPDATE vc.codigos_recuperacion SET usado_en = $4
				WHERE tenant_id = $1 AND asesor_id = $2 AND hash = $3 AND usado_en IS NULL`,
				string(t), asesor, ap.HashRecuperacion, ahora)
			if err != nil {
				return err
			}
			if tag.RowsAffected() != 1 {
				return errores.Nuevo(errores.TotpInvalido)
			}
		}
		tag, err := tx.Exec(ctx, `UPDATE vc.ingresos_panel SET revocada_en = $3
			WHERE tenant_id = $1 AND hash_cookie = $2 AND revocada_en IS NULL`,
			string(t), ap.HashPrevio, ahora)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return errores.Nuevo(errores.SesionVencida)
		}
		_, err = tx.Exec(ctx, `INSERT INTO vc.ingresos_panel
			(tenant_id, hash_cookie, hash_csrf, asesor_id, emitida_en, vence_en, preliminar, vence_inactividad, csrf_cifrado)
			VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8)`,
			string(t), ap.Nueva.HashCookie, ap.Nueva.HashCSRF, asesor,
			ap.Nueva.EmitidaEn, ap.Nueva.VenceEn, tiempoONull(ap.Nueva.VenceInactividad), ap.Nueva.CSRFCifrado)
		return err
	})
}

// OtorgarReautenticacion implementa almacen.Almacen. Una transacción: si el
// paso ya se usó, no se guarda la ventana. Si la sesión no está vigente, no
// se consume el paso.
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
	ahora = dominio.Instante(ahora)
	hasta = dominio.Instante(hasta)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var asesor string
		var preliminar bool
		var revocada *time.Time
		var vence time.Time
		var inact *time.Time
		err := tx.QueryRow(ctx, `SELECT asesor_id, preliminar, revocada_en, vence_en, vence_inactividad
			FROM vc.ingresos_panel WHERE tenant_id = $1 AND hash_cookie = $2`,
			string(t), hashCookie).Scan(&asesor, &preliminar, &revocada, &vence, &inact)
		var inactividad time.Time
		if inact != nil {
			inactividad = *inact
		}
		fila := dominio.IngresoPanel{
			Preliminar: preliminar, RevocadaEn: revocada, VenceEn: vence, VenceInactividad: inactividad,
		}
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !fila.SesionVigente(ahora)) {
			return errores.Nuevo(errores.SesionVencida)
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO vc.pasos_totp (tenant_id, asesor_id, paso, usado_en)
			VALUES ($1, $2, $3, $4)`, string(t), asesor, paso, ahora)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return errores.Nuevo(errores.TotpInvalido)
			}
			return err
		}
		tag, err := tx.Exec(ctx, `UPDATE vc.ingresos_panel SET reautenticado_hasta = $3
			WHERE tenant_id = $1 AND hash_cookie = $2 AND preliminar = false AND revocada_en IS NULL
			  AND vence_en > $4 AND vence_inactividad > $4`,
			string(t), hashCookie, hasta, ahora)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return errores.Nuevo(errores.SesionVencida)
		}
		return nil
	})
}
