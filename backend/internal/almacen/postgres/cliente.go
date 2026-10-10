package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// GuardarTokenMedios implementa almacen.ClienteFinal.
func (a *Almacen) GuardarTokenMedios(ctx context.Context, t dominio.TenantID, tok dominio.TokenMedios) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := tok.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.tokens_medios (tenant_id, hash, sesion_id, emitido_en, vence_en)
			VALUES ($1, $2, $3, $4, $5)`, string(t), tok.Hash, tok.SesionID, tok.EmitidoEn, tok.VenceEn)
		return err
	})
}

// revocarTokensMedios anula los tokens de medios sin usar (cierre de sesión).
func revocarTokensMedios(ctx context.Context, tx pgx.Tx, t dominio.TenantID, sesionID string, ahora time.Time) error {
	_, err := tx.Exec(ctx, `UPDATE vc.tokens_medios SET revocado_en = $3
		WHERE tenant_id = $1 AND sesion_id = $2 AND revocado_en IS NULL AND usado_en IS NULL`,
		string(t), sesionID, dominio.Instante(ahora))
	return err
}

// RegistrarContacto implementa almacen.ClienteFinal.
func (a *Almacen) RegistrarContacto(ctx context.Context, t dominio.TenantID, c dominio.Contacto) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		s, err := sesionParaActualizar(ctx, tx, t, c.SesionID)
		if err != nil {
			return err
		}
		if err := s.AdmiteContacto(); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `INSERT INTO vc.contactos
			(tenant_id, sesion_id, nombre, telefono, email, preferencia, aviso_version, finalidad, consentido_en, borrar_despues_de)
			VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), $7, $8, $9, $10)
			ON CONFLICT (tenant_id, sesion_id) DO NOTHING`,
			string(t), c.SesionID, c.Nombre, c.Telefono, c.Email, c.Preferencia, c.AvisoVersion, dominio.FinalidadContacto,
			c.ConsentidoEn, c.BorrarDespuesDe)
		if err == nil && tag.RowsAffected() == 0 {
			return errores.Nuevo(errores.ContactoYaRegistrado)
		}
		return err
	})
}

// AtenderArco implementa almacen.ClienteFinal.
func (a *Almacen) AtenderArco(ctx context.Context, t dominio.TenantID, p dominio.PedidoArco, s dominio.SolicitudArco) (dominio.SolicitudArco, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.SolicitudArco{}, err
	}
	out := s
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var sesionID, telefono, email string
		err := tx.QueryRow(ctx, `SELECT d.sesion_id, coalesce(c.telefono, ''), coalesce(c.email, '')
			FROM vc.derivaciones d JOIN vc.contactos c ON c.tenant_id = d.tenant_id AND c.sesion_id = d.sesion_id
			WHERE d.tenant_id = $1 AND d.codigo_referencia = $2`,
			string(t), p.CodigoReferencia).Scan(&sesionID, &telefono, &email)
		coincide := err == nil && p.Coincide(dominio.Contacto{Telefono: telefono, Email: email})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		out = dominio.ResolverArco(s, p, coincide, sesionID)
		if coincide && p.Tipo == dominio.ArcoSupresion {
			// Consulta, consentimiento, cotización, ítems, tokens, derivación y
			// contacto caen en cascada (R23). El consumo mensual no (H2).
			if _, err := tx.Exec(ctx, "DELETE FROM vc.sesiones WHERE tenant_id = $1 AND sesion_id = $2", string(t), sesionID); err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, `INSERT INTO vc.solicitudes_arco
			(tenant_id, solicitud_id, tipo, recibida_en, plazo_vence_en, resultado, sesion_id, detalle)
			VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), NULLIF($8, ''))`,
			string(t), out.ID, string(out.Tipo), out.RecibidaEn, out.PlazoVenceEn, out.Resultado, out.SesionID, out.Detalle)
		return err
	})
	if err != nil {
		return dominio.SolicitudArco{}, err
	}
	return out, nil
}
