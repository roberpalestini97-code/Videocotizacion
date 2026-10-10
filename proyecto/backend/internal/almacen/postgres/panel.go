package postgres

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// GuardarContrasena implementa almacen.Almacen. La contraseña en claro no entra.
func (a *Almacen) GuardarContrasena(ctx context.Context, t dominio.TenantID, c dominio.ContrasenaAsesor) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	c.CreadaEn = dominio.Instante(c.CreadaEn)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.contrasenas_asesor
			(tenant_id, asesor_id, email, hash, sal, memoria_kib, iteraciones, paralelismo, creada_en)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			string(t), c.AsesorID, c.Email, c.Hash, c.Sal, c.MemoriaKiB, c.Iteraciones, c.Paralelismo, c.CreadaEn)
		return err
	})
}

// LeerContrasena implementa almacen.Almacen. Sin tenant la política no devuelve filas.
func (a *Almacen) LeerContrasena(ctx context.Context, t dominio.TenantID, asesorID string) (dominio.ContrasenaAsesor, error) {
	var c dominio.ContrasenaAsesor
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		return escanearContrasena(tx.QueryRow(ctx, `SELECT asesor_id, email, hash, sal, memoria_kib, iteraciones, paralelismo, creada_en
			FROM vc.contrasenas_asesor WHERE tenant_id = $1 AND asesor_id = $2`, string(t), asesorID), &c)
	})
	if err != nil {
		return dominio.ContrasenaAsesor{}, err
	}
	return c, nil
}

// BuscarContrasenaPorEmail implementa almacen.Almacen. No fija tenant: la
// función SECURITY DEFINER devuelve solo la fila del email.
func (a *Almacen) BuscarContrasenaPorEmail(ctx context.Context, email string) (dominio.ContrasenaHallada, error) {
	email, err := dominio.EmailDeLogin(email)
	if err != nil {
		return dominio.ContrasenaHallada{}, err
	}
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	var h dominio.ContrasenaHallada
	var idTenant string
	var memoria, iter int32
	var par int16
	err = a.pool.QueryRow(ctx, `SELECT tenant_id::text, asesor_id, email, hash, sal, memoria_kib, iteraciones, paralelismo, creada_en
		FROM vc.buscar_contrasena($1)`, email).
		Scan(&idTenant, &h.AsesorID, &h.Email, &h.Hash, &h.Sal, &memoria, &iter, &par, &h.CreadaEn)
	if err != nil {
		return dominio.ContrasenaHallada{}, traducir(err)
	}
	if err := aplicarParametros(&h.ContrasenaAsesor, memoria, iter, par); err != nil {
		return dominio.ContrasenaHallada{}, err
	}
	h.TenantID = dominio.TenantID(idTenant)
	return h, nil
}

// GuardarIngresoPanel implementa almacen.Almacen. Solo HMAC.
func (a *Almacen) GuardarIngresoPanel(ctx context.Context, t dominio.TenantID, p dominio.IngresoPanel) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := p.Validar(); err != nil {
		return err
	}
	p.EmitidaEn = dominio.Instante(p.EmitidaEn)
	p.VenceEn = dominio.Instante(p.VenceEn)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.ingresos_panel
			(tenant_id, hash_cookie, hash_csrf, asesor_id, emitida_en, vence_en, preliminar, revocada_en, vence_inactividad)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			string(t), p.HashCookie, p.HashCSRF, p.AsesorID, p.EmitidaEn, p.VenceEn,
			p.Preliminar, tiempoPtr(p.RevocadaEn), tiempoONull(p.VenceInactividad))
		return err
	})
}

// LeerIngresoPanel implementa almacen.Almacen.
func (a *Almacen) LeerIngresoPanel(ctx context.Context, t dominio.TenantID, hashCookie []byte) (dominio.IngresoPanel, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.IngresoPanel{}, err
	}
	if len(hashCookie) != 32 {
		return dominio.IngresoPanel{}, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	var p dominio.IngresoPanel
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var rev, inact, reauth *time.Time
		if err := tx.QueryRow(ctx, `SELECT asesor_id, hash_cookie, hash_csrf, csrf_cifrado, emitida_en, vence_en, preliminar, revocada_en, vence_inactividad, reautenticado_hasta
			FROM vc.ingresos_panel WHERE tenant_id = $1 AND hash_cookie = $2`, string(t), hashCookie).
			Scan(&p.AsesorID, &p.HashCookie, &p.HashCSRF, &p.CSRFCifrado, &p.EmitidaEn, &p.VenceEn, &p.Preliminar, &rev, &inact, &reauth); err != nil {
			return err
		}
		p.RevocadaEn = rev
		p.ReautenticadoHasta = reauth
		if inact != nil {
			p.VenceInactividad = *inact
		}
		return nil
	})
	if err != nil {
		return dominio.IngresoPanel{}, err
	}
	return normalizarIngreso(p), nil
}

// CerrarSesionPanel implementa almacen.Almacen. Solo puede escribir
// revocada_en, y únicamente en una sesión TOTP todavía vigente.
func (a *Almacen) CerrarSesionPanel(ctx context.Context, t dominio.TenantID, hashCookie []byte, ahora time.Time) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if len(hashCookie) != 32 {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	if ahora.IsZero() {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("ahora"))
	}
	ahora = dominio.Instante(ahora)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE vc.ingresos_panel SET revocada_en = $3
			WHERE tenant_id = $1 AND hash_cookie = $2 AND preliminar = false AND revocada_en IS NULL
			  AND vence_en > $3 AND vence_inactividad > $3`,
			string(t), hashCookie, ahora)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return errores.Nuevo(errores.SesionVencida)
		}
		return nil
	})
}

func normalizarIngreso(p dominio.IngresoPanel) dominio.IngresoPanel {
	p.HashCookie = bytes.Clone(p.HashCookie)
	p.HashCSRF = bytes.Clone(p.HashCSRF)
	p.CSRFCifrado = bytes.Clone(p.CSRFCifrado)
	p.EmitidaEn = dominio.Instante(p.EmitidaEn)
	p.VenceEn = dominio.Instante(p.VenceEn)
	if !p.VenceInactividad.IsZero() {
		p.VenceInactividad = dominio.Instante(p.VenceInactividad)
	}
	if p.RevocadaEn != nil {
		u := dominio.Instante(*p.RevocadaEn)
		p.RevocadaEn = &u
	}
	if p.ReautenticadoHasta != nil {
		u := dominio.Instante(*p.ReautenticadoHasta)
		p.ReautenticadoHasta = &u
	}
	return p
}

// CambiarContrasena implementa almacen.Almacen. Una transacción: sin ventana
// vigente no se reemplaza el hash ni se revoca ninguna cookie.
func (a *Almacen) CambiarContrasena(ctx context.Context, t dominio.TenantID, hashCookie []byte, nueva dominio.ContrasenaAsesor, ahora time.Time) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if len(hashCookie) != 32 {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("hash: largo inválido"))
	}
	if err := nueva.Validar(); err != nil {
		return err
	}
	if ahora.IsZero() {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("ahora"))
	}
	ahora = dominio.Instante(ahora)
	nueva.CreadaEn = dominio.Instante(nueva.CreadaEn)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var asesor string
		var preliminar bool
		var revocada, inact, reauth *time.Time
		var vence time.Time
		err := tx.QueryRow(ctx, `SELECT asesor_id, preliminar, revocada_en, vence_en, vence_inactividad, reautenticado_hasta
			FROM vc.ingresos_panel WHERE tenant_id = $1 AND hash_cookie = $2`,
			string(t), hashCookie).Scan(&asesor, &preliminar, &revocada, &vence, &inact, &reauth)
		var inactividad time.Time
		if inact != nil {
			inactividad = *inact
		}
		fila := dominio.IngresoPanel{
			AsesorID: asesor, Preliminar: preliminar, RevocadaEn: revocada,
			VenceEn: vence, VenceInactividad: inactividad, ReautenticadoHasta: reauth,
		}
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && (!fila.SesionVigente(ahora) || asesor != nueva.AsesorID)) {
			return errores.Nuevo(errores.SesionVencida)
		}
		if err != nil {
			return err
		}
		if fila.ReautenticadoHasta == nil || !ahora.Before(*fila.ReautenticadoHasta) {
			return errores.Nuevo(errores.ReautenticacionRequerida)
		}
		var email string
		err = tx.QueryRow(ctx, `SELECT email FROM vc.contrasenas_asesor
			WHERE tenant_id = $1 AND asesor_id = $2`, string(t), asesor).Scan(&email)
		if errors.Is(err, pgx.ErrNoRows) {
			return errores.Nuevo(errores.NoEncontrado)
		}
		if err != nil {
			return err
		}
		if email != nueva.Email {
			return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("email"))
		}
		tag, err := tx.Exec(ctx, `UPDATE vc.contrasenas_asesor
			SET hash = $3, sal = $4, memoria_kib = $5, iteraciones = $6, paralelismo = $7, creada_en = $8
			WHERE tenant_id = $1 AND asesor_id = $2`,
			string(t), asesor, nueva.Hash, nueva.Sal, nueva.MemoriaKiB, nueva.Iteraciones, nueva.Paralelismo, nueva.CreadaEn)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return errores.Nuevo(errores.NoEncontrado)
		}
		if _, err := tx.Exec(ctx, `UPDATE vc.ingresos_panel SET revocada_en = $3
			WHERE tenant_id = $1 AND asesor_id = $2 AND hash_cookie <> $4 AND revocada_en IS NULL`,
			string(t), asesor, ahora, hashCookie); err != nil {
			return err
		}
		tag, err = tx.Exec(ctx, `UPDATE vc.ingresos_panel SET reautenticado_hasta = NULL
			WHERE tenant_id = $1 AND hash_cookie = $2 AND preliminar = false AND revocada_en IS NULL
			  AND vence_en > $3 AND vence_inactividad > $3 AND reautenticado_hasta > $3`,
			string(t), hashCookie, ahora)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return errores.Nuevo(errores.ReautenticacionRequerida)
		}
		return nil
	})
}

func tiempoONull(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return dominio.Instante(t)
}

func tiempoPtr(t *time.Time) any {
	if t == nil {
		return nil
	}
	return dominio.Instante(*t)
}

func escanearContrasena(row pgx.Row, c *dominio.ContrasenaAsesor) error {
	var memoria, iter int32
	var par int16
	if err := row.Scan(&c.AsesorID, &c.Email, &c.Hash, &c.Sal, &memoria, &iter, &par, &c.CreadaEn); err != nil {
		return err
	}
	return aplicarParametros(c, memoria, iter, par)
}

func aplicarParametros(c *dominio.ContrasenaAsesor, memoria, iter int32, par int16) error {
	if memoria <= 0 || iter <= 0 || par <= 0 || par > 255 {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("parametros argon2"))
	}
	c.MemoriaKiB = uint32(memoria)
	c.Iteraciones = uint32(iter)
	c.Paralelismo = uint8(par)
	c.Hash = bytes.Clone(c.Hash)
	c.Sal = bytes.Clone(c.Sal)
	c.CreadaEn = dominio.Instante(c.CreadaEn)
	return nil
}
