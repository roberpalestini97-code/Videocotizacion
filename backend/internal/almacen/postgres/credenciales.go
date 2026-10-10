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

// Cupo implementa almacen.Credenciales: contadores (H2) y reservas vigentes,
// nunca vc.sesiones.
func (a *Almacen) Cupo(ctx context.Context, t dominio.TenantID, asesorID string, mes, ahora time.Time) (dominio.EstadoCupo, error) {
	var e dominio.EstadoCupo
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT
				t.segundos_mes_tope, t.simultaneas_tope, a.segundos_mes_tope, a.simultaneas_tope,
				coalesce(c.segundos_usados, 0), coalesce(c.segundos_reservados, 0),
				coalesce(ca.segundos_usados, 0), coalesce(ca.segundos_reservados, 0),
				(SELECT count(*) FROM vc.reservas_cupo r WHERE r.tenant_id = $1 AND r.liberada_en IS NULL AND r.vence_en > $4),
				(SELECT count(*) FROM vc.reservas_cupo r WHERE r.tenant_id = $1 AND r.asesor_id = $2
				   AND r.liberada_en IS NULL AND r.vence_en > $4)
			FROM vc.tenants t
			JOIN vc.asesores a ON a.tenant_id = t.tenant_id AND a.asesor_id = $2
			LEFT JOIN vc.consumo_mensual c ON c.tenant_id = t.tenant_id AND c.mes = $3
			LEFT JOIN vc.consumo_asesor_mensual ca ON ca.tenant_id = t.tenant_id AND ca.asesor_id = $2 AND ca.mes = $3
			WHERE t.tenant_id = $1`, string(t), asesorID, mes, ahora).
			Scan(&e.TopeSegundosTenant, &e.TopeSimultaneasTenant, &e.TopeSegundosAsesor, &e.TopeSimultaneasAsesor,
				&e.Tenant.SegundosUsados, &e.Tenant.SegundosReservados, &e.Asesor.SegundosUsados, &e.Asesor.SegundosReservados,
				&e.ActivasTenant, &e.ActivasAsesor)
	})
	return e, err
}

// ReservarCupo implementa almacen.Credenciales con vc.reservar_cupo. Orden de
// bloqueos: fila de la sesión y después global → tenant → asesor (adentro de
// la función), el mismo que CerrarSesion.
func (a *Almacen) ReservarCupo(ctx context.Context, t dominio.TenantID, p dominio.PedidoReserva) (dominio.ResultadoReserva, error) {
	var out dominio.ResultadoReserva
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		s, err := sesionParaActualizar(ctx, tx, t, p.SesionID)
		if err != nil {
			return err
		}
		if err := s.IniciarMedios(); err != nil {
			return err
		}
		var resultado string
		var segundos int
		var recortada bool
		var creada, vence *time.Time
		ahora := dominio.Instante(p.Ahora)
		if err := tx.QueryRow(ctx, `SELECT resultado, segundos, recortada, creada_en, vence_en
			FROM vc.reservar_cupo($1, $2, $3, $4, $5, $6)`, string(t), s.AsesorID, s.ID, dominio.MesCuota(ahora), ahora, p.SegundosMax).
			Scan(&resultado, &segundos, &recortada, &creada, &vence); err != nil {
			return err
		}
		switch resultado {
		case "cuota_agotada":
			return errores.Envolver(errores.CuotaAgotada, errors.New("vc.reservar_cupo: saldo efectivo < 60 s"))
		case "simultaneas_agotadas":
			return errores.Envolver(errores.SimultaneasAgotadas, errors.New("vc.reservar_cupo: sin simultánea libre"))
		}
		out.Reserva = dominio.Reserva{SesionID: s.ID, AsesorID: s.AsesorID, Mes: dominio.MesCuota(creada.UTC()), Segundos: segundos,
			Recortada: recortada, CreadaEn: creada.UTC(), VenceEn: vence.UTC()}
		switch resultado {
		case "reutilizada":
			out.Reutilizada = true
		case "vencida":
			// La llamada superó su límite: se cobró completa y la sesión se cierra.
			out.Vencida = true
			if err := s.Cerrar(motivoDeVencimiento(out.Reserva), ahora); err != nil {
				return err
			}
			if err := revocarTokensMedios(ctx, tx, t, s.ID, ahora); err != nil {
				return err
			}
		case "reservada":
		default:
			return fmt.Errorf("vc.reservar_cupo: resultado inesperado %q", resultado)
		}
		return actualizarSesion(ctx, tx, t, s)
	})
	return out, err
}

// motivoDeVencimiento: una reserva recortada por cuota vence por cuota; si no,
// por duración máxima.
func motivoDeVencimiento(r dominio.Reserva) dominio.MotivoCierre {
	if r.Recortada {
		return dominio.MotivoCuotaAgotada
	}
	return dominio.MotivoDuracionMaxima
}

// liberarCupo cobra la reserva de la sesión cerrada en la transacción del
// cierre (H2): vc.liberar_cupo suma lo real a los contadores (idempotente).
func liberarCupo(ctx context.Context, tx pgx.Tx, sesionID string, ahora time.Time) error {
	_, err := tx.Exec(ctx, "SELECT vc.liberar_cupo($1, $2)", sesionID, dominio.Instante(ahora))
	return err
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
