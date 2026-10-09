// Package postgres implementa almacen.Almacen sobre PostgreSQL 16 con RLS
// forzada (ADR 0004). Reglas:
//   - toda operación corre en una transacción que primero hace
//     set_config('app.tenant_id', $1, true) (equivale a SET LOCAL), así el
//     pool no arrastra el tenant entre pedidos (R6);
//   - además de la política RLS, cada consulta filtra por tenant_id en el
//     WHERE (segunda capa, ADR 0004 "alternativas");
//   - Abrir verifica el rol y el esquema y se niega a seguir si el rol es
//     superusuario, tiene BYPASSRLS, es dueño de algo o falta RLS (R4, S02);
//   - consultas siempre parametrizadas (S08).
package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/secreto"
)

// Opciones de conexión.
type Opciones struct {
	ConexionesMax int32
	Timeout       time.Duration // por operación (G03)
	ExigirTLS     bool          // producción: la conexión debe ir cifrada (R27)
	// VersionEsquema es la última migración que este binario conoce; la base
	// debe estar exactamente en esa versión.
	VersionEsquema string
}

// Almacen sobre PostgreSQL.
type Almacen struct {
	pool    *pgxpool.Pool
	timeout time.Duration
}

var _ almacen.Completo = (*Almacen)(nil)

// Abrir crea el pool y verifica el arranque seguro. Si algo falla, no
// devuelve el almacén.
func Abrir(ctx context.Context, dsn secreto.Secreto, o Opciones) (*Almacen, error) {
	if dsn.Vacio() {
		return nil, errors.New("postgres: falta la URL de conexión")
	}
	cfg, err := pgxpool.ParseConfig(dsn.Revelar())
	if err != nil {
		// El error de pgx puede incluir el DSN: no se propaga.
		return nil, errors.New("postgres: URL de conexión inválida")
	}
	if o.ConexionesMax > 0 {
		cfg.MaxConns = o.ConexionesMax
	}
	if o.Timeout <= 0 {
		o.Timeout = 5 * time.Second
	}
	cfg.ConnConfig.RuntimeParams["application_name"] = "videocotizacion-api"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("postgres: crear pool: %w", err)
	}
	a := &Almacen{pool: pool, timeout: o.Timeout}
	vctx, cancelar := context.WithTimeout(ctx, 2*o.Timeout)
	defer cancelar()
	if err := a.VerificarArranque(vctx, o.ExigirTLS, o.VersionEsquema); err != nil {
		pool.Close()
		return nil, err
	}
	return a, nil
}

// ErrArranqueInseguro marca las fallas de la verificación de arranque.
var ErrArranqueInseguro = errors.New("arranque inseguro")

// VerificarArranque comprueba rol, propiedad, RLS, TLS y versión del esquema.
func (a *Almacen) VerificarArranque(ctx context.Context, exigirTLS bool, version string) error {
	inseguro := func(formato string, args ...any) error {
		return fmt.Errorf("%w: "+formato, append([]any{ErrArranqueInseguro}, args...)...)
	}
	var rol string
	var super, bypass, duenoBase bool
	err := a.pool.QueryRow(ctx, `
		SELECT r.rolname, r.rolsuper, r.rolbypassrls,
		       pg_has_role(current_user, d.datdba, 'MEMBER')
		FROM pg_roles r, pg_database d
		WHERE r.rolname = current_user AND d.datname = current_database()`).Scan(&rol, &super, &bypass, &duenoBase)
	if err != nil {
		return fmt.Errorf("postgres: leer el rol: %w", err)
	}
	switch {
	case super:
		return inseguro("el rol %s es superusuario", rol)
	case bypass:
		return inseguro("el rol %s tiene BYPASSRLS", rol)
	case duenoBase:
		return inseguro("el rol %s es (o hereda) el dueño de la base", rol)
	}
	var propios []string
	if err := juntar(ctx, a.pool, &propios, `
		SELECT n.nspname || '.' || coalesce(c.relname, '')
		FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid
		     AND pg_has_role(current_user, c.relowner, 'MEMBER')
		WHERE n.nspname IN ('vc', 'vc_meta')
		  AND (c.oid IS NOT NULL OR pg_has_role(current_user, n.nspowner, 'MEMBER'))`); err != nil {
		return err
	}
	if len(propios) > 0 {
		return inseguro("el rol %s es dueño (o miembro del dueño) de %v; la API no puede ser dueña (H3)", rol, propios)
	}
	var sinRLS []string
	if err := juntar(ctx, a.pool, &sinRLS, `
		SELECT c.relname FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'vc' AND c.relkind IN ('r', 'p')
		  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
		       OR NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
		                      AND a.attname = 'tenant_id' AND NOT a.attisdropped AND a.attnotnull))`); err != nil {
		return err
	}
	if len(sinRLS) > 0 {
		return inseguro("tablas sin tenant_id NOT NULL o sin RLS forzada: %v", sinRLS)
	}
	var tablas int
	if err := a.pool.QueryRow(ctx, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'vc' AND c.relkind IN ('r', 'p')`).Scan(&tablas); err != nil {
		return fmt.Errorf("postgres: contar tablas: %w", err)
	}
	if tablas == 0 {
		return inseguro("el esquema vc no existe o no tiene tablas: correr `api migrar`")
	}
	for _, verificar := range []func(context.Context) error{a.verificarPrivilegios, a.verificarPoliticas, a.verificarFunciones} {
		if err := verificar(ctx); err != nil {
			return err
		}
	}
	if exigirTLS {
		var tls bool
		if err := a.pool.QueryRow(ctx, "SELECT coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false)").Scan(&tls); err != nil {
			return fmt.Errorf("postgres: leer pg_stat_ssl: %w", err)
		}
		if !tls {
			return inseguro("la conexión a la base no usa TLS (R27)")
		}
	}
	if version != "" {
		var actual *string
		if err := a.pool.QueryRow(ctx, "SELECT max(version) FROM vc_meta.migraciones").Scan(&actual); err != nil {
			return fmt.Errorf("postgres: leer la versión del esquema: %w", err)
		}
		if actual == nil || *actual != version {
			v := "ninguna"
			if actual != nil {
				v = *actual
			}
			return inseguro("la base está en la migración %s y este binario espera %s: correr `api migrar`", v, version)
		}
	}
	return nil
}

func juntar(ctx context.Context, pool *pgxpool.Pool, destino *[]string, sql string) error {
	filas, err := pool.Query(ctx, sql)
	if err != nil {
		return fmt.Errorf("postgres: verificación de arranque: %w", err)
	}
	v, err := pgx.CollectRows(filas, pgx.RowTo[string])
	if err != nil {
		return fmt.Errorf("postgres: verificación de arranque: %w", err)
	}
	*destino = v
	return nil
}

// Ping implementa almacen.Almacen.
func (a *Almacen) Ping(ctx context.Context) error {
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	return traducir(a.pool.Ping(ctx))
}

// Cerrar implementa almacen.Almacen.
func (a *Almacen) Cerrar() { a.pool.Close() }

// enTenant corre fn en una transacción con SET LOCAL app.tenant_id.
func (a *Almacen) enTenant(ctx context.Context, t dominio.TenantID, fn func(ctx context.Context, tx pgx.Tx) error) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	err := pgx.BeginFunc(ctx, a.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", string(t)); err != nil {
			return err
		}
		return fn(ctx, tx)
	})
	return traducir(err)
}

// traducir lleva los errores de PostgreSQL al catálogo (sin filtrar detalles
// al cliente: la causa queda solo para el log).
func traducir(err error) error {
	if err == nil {
		return nil
	}
	var e *errores.Error
	if errors.As(err, &e) {
		return err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return errores.Envolver(errores.NoEncontrado, err)
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return errores.Envolver(errores.ServicioNoDisponible, err)
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch {
		case pgErr.Code == "23505": // unique_violation
			return errores.Envolver(errores.EstadoInvalido, err)
		case pgErr.Code == "23503": // foreign_key_violation: el padre no existe (o es de otro tenant)
			return errores.Envolver(errores.NoEncontrado, err)
		case pgErr.Code == "23514", pgErr.Code == "23502", pgErr.Code[:2] == "22": // check, not null, datos
			return errores.Envolver(errores.ValidacionFallida, err)
		case pgErr.Code == "40001", pgErr.Code == "40P01", pgErr.Code == "57014", pgErr.Code == "55P03",
			pgErr.Code[:2] == "08", pgErr.Code[:2] == "53", pgErr.Code[:2] == "57":
			return errores.Envolver(errores.ServicioNoDisponible, err)
		}
		// 42501 (privilegio o política RLS) y el resto: error interno.
		return errores.Envolver(errores.ErrorInterno, err)
	}
	var connErr *pgconn.ConnectError
	if errors.As(err, &connErr) || pgconn.SafeToRetry(err) || pgconn.Timeout(err) {
		return errores.Envolver(errores.ServicioNoDisponible, err)
	}
	return errores.Envolver(errores.ErrorInterno, err)
}

// CrearTenant implementa almacen.Almacen. Corre con app.tenant_id = el tenant
// nuevo, así la política WITH CHECK lo admite.
func (a *Almacen) CrearTenant(ctx context.Context, t dominio.Tenant) error {
	if err := t.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t.ID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.tenants
			(tenant_id, nombre, simultaneas_tope, segundos_mes_tope, retencion_dias, creado_en)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			string(t.ID), t.Nombre, t.SimultaneasTope, t.SegundosMesTope, t.RetencionDias, t.CreadoEn)
		return err
	})
}

// LeerTenant implementa almacen.Almacen.
func (a *Almacen) LeerTenant(ctx context.Context, t dominio.TenantID) (dominio.Tenant, error) {
	var out dominio.Tenant
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var id string
		err := tx.QueryRow(ctx, `SELECT tenant_id::text, nombre, simultaneas_tope, segundos_mes_tope, retencion_dias, creado_en
			FROM vc.tenants WHERE tenant_id = $1`, string(t)).
			Scan(&id, &out.Nombre, &out.SimultaneasTope, &out.SegundosMesTope, &out.RetencionDias, &out.CreadoEn)
		out.ID, out.CreadoEn = dominio.TenantID(id), out.CreadoEn.UTC()
		return err
	})
	return out, err
}

// CrearAsesor implementa almacen.Almacen.
func (a *Almacen) CrearAsesor(ctx context.Context, t dominio.TenantID, as dominio.Asesor) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := as.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO vc.asesores
			(tenant_id, asesor_id, rol, nombre_visible, email, whatsapp, oficios, zonas, creado_en, borrar_despues_de)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			string(t), as.ID, string(as.Rol), as.NombreVisible, as.Email, as.WhatsApp,
			textos(as.Oficios), textos(as.Zonas), as.CreadoEn, as.BorrarDespuesDe)
		return err
	})
}

// LeerAsesor implementa almacen.Almacen.
func (a *Almacen) LeerAsesor(ctx context.Context, t dominio.TenantID, id string) (dominio.Asesor, error) {
	var out dominio.Asesor
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var rol string
		var oficios, zonas []string
		err := tx.QueryRow(ctx, `SELECT asesor_id, rol, nombre_visible, email, whatsapp, oficios, zonas, creado_en, borrar_despues_de
			FROM vc.asesores WHERE tenant_id = $1 AND asesor_id = $2`, string(t), id).
			Scan(&out.ID, &rol, &out.NombreVisible, &out.Email, &out.WhatsApp, &oficios, &zonas, &out.CreadoEn, &out.BorrarDespuesDe)
		if err != nil {
			return err
		}
		out.Rol, out.CreadoEn = dominio.RolAsesor(rol), out.CreadoEn.UTC()
		out.Oficios, out.Zonas = convertir[dominio.Oficio](oficios), convertir[dominio.Zona](zonas)
		out.BorrarDespuesDe = utc(out.BorrarDespuesDe)
		return nil
	})
	return out, err
}

const columnasSesion = `sesion_id, asesor_id, estado, modo_avatar, creada_en, consentida_en, cerrada_en,
	coalesce(motivo_cierre, ''), duracion_s, borrar_despues_de`

func escanearSesion(f pgx.Row) (dominio.Sesion, error) {
	var s dominio.Sesion
	var estado, modo, motivo string
	if err := f.Scan(&s.ID, &s.AsesorID, &estado, &modo, &s.CreadaEn, &s.ConsentidaEn, &s.CerradaEn,
		&motivo, &s.DuracionS, &s.BorrarDespuesDe); err != nil {
		return dominio.Sesion{}, err
	}
	s.Estado, s.ModoAvatar, s.MotivoCierre = dominio.EstadoSesion(estado), dominio.ModoAvatar(modo), dominio.MotivoCierre(motivo)
	s.CreadaEn, s.BorrarDespuesDe = s.CreadaEn.UTC(), s.BorrarDespuesDe.UTC()
	s.ConsentidaEn, s.CerradaEn = utc(s.ConsentidaEn), utc(s.CerradaEn)
	return s, nil
}

// CrearSesion implementa almacen.Almacen.
func (a *Almacen) CrearSesion(ctx context.Context, t dominio.TenantID, s dominio.Sesion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := s.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		return insertarSesion(ctx, tx, t, s)
	})
}

func insertarSesion(ctx context.Context, tx pgx.Tx, t dominio.TenantID, s dominio.Sesion) error {
	_, err := tx.Exec(ctx, `INSERT INTO vc.sesiones
		(tenant_id, sesion_id, asesor_id, estado, modo_avatar, creada_en, consentida_en, cerrada_en, motivo_cierre, duracion_s, borrar_despues_de)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10, $11)`,
		string(t), s.ID, s.AsesorID, string(s.Estado), string(s.ModoAvatar), s.CreadaEn, s.ConsentidaEn,
		s.CerradaEn, string(s.MotivoCierre), s.DuracionS, s.BorrarDespuesDe)
	return err
}

// LeerSesion implementa almacen.Almacen.
func (a *Almacen) LeerSesion(ctx context.Context, t dominio.TenantID, id string) (dominio.Sesion, error) {
	var out dominio.Sesion
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var err error
		out, err = escanearSesion(tx.QueryRow(ctx, `SELECT `+columnasSesion+`
			FROM vc.sesiones WHERE tenant_id = $1 AND sesion_id = $2`, string(t), id))
		return err
	})
	return out, err
}

// Consultas del listado por clave (keyset). La prueba de plan analiza las que prepara pgx.
const (
	listadoPrimeraPagina = `SELECT ` + columnasSesion + `
		FROM vc.sesiones WHERE tenant_id = $1 AND asesor_id = $2
		ORDER BY creada_en DESC, sesion_id DESC LIMIT $3`
	listadoSiguientePagina = `SELECT ` + columnasSesion + `
		FROM vc.sesiones WHERE tenant_id = $1 AND asesor_id = $2 AND (creada_en, sesion_id) < ($3, $4)
		ORDER BY creada_en DESC, sesion_id DESC LIMIT $5`
)

// ListarSesionesDeAsesor implementa almacen.Almacen (keyset, sin OFFSET).
func (a *Almacen) ListarSesionesDeAsesor(ctx context.Context, t dominio.TenantID, asesorID string, p almacen.Pagina) ([]dominio.Sesion, string, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return nil, "", err
	}
	desdeT, desdeID, err := almacen.DecodificarCursor(p.Despues)
	if err != nil {
		return nil, "", err
	}
	limite := almacen.LimitePagina(p.Limite)
	out := []dominio.Sesion{}
	siguiente := ""
	err = a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		// Dos consultas fijas (H5 de T43): con un OR sobre un parámetro, el plan
		// genérico deja el cursor fuera de la condición de índice.
		var filas pgx.Rows
		var err error
		if p.Despues == "" {
			filas, err = tx.Query(ctx, listadoPrimeraPagina, string(t), asesorID, limite+1)
		} else {
			filas, err = tx.Query(ctx, listadoSiguientePagina, string(t), asesorID, desdeT, desdeID, limite+1)
		}
		if err != nil {
			return err
		}
		defer filas.Close()
		for filas.Next() {
			s, err := escanearSesion(filas)
			if err != nil {
				return err
			}
			out = append(out, s)
		}
		return filas.Err()
	})
	if err != nil {
		return nil, "", err
	}
	if len(out) > limite {
		out = out[:limite]
		u := out[limite-1]
		siguiente = almacen.CodificarCursor(u.CreadaEn, u.ID)
	}
	return out, siguiente, nil
}

// sesionParaActualizar lee la sesión con bloqueo de fila.
func sesionParaActualizar(ctx context.Context, tx pgx.Tx, t dominio.TenantID, id string) (dominio.Sesion, error) {
	return escanearSesion(tx.QueryRow(ctx, `SELECT `+columnasSesion+`
		FROM vc.sesiones WHERE tenant_id = $1 AND sesion_id = $2 FOR UPDATE`, string(t), id))
}

func actualizarSesion(ctx context.Context, tx pgx.Tx, t dominio.TenantID, s dominio.Sesion) error {
	tag, err := tx.Exec(ctx, `UPDATE vc.sesiones
		SET estado = $3, consentida_en = $4, cerrada_en = $5, motivo_cierre = NULLIF($6, ''), duracion_s = $7
		WHERE tenant_id = $1 AND sesion_id = $2`,
		string(t), s.ID, string(s.Estado), s.ConsentidaEn, s.CerradaEn, string(s.MotivoCierre), s.DuracionS)
	if err == nil && tag.RowsAffected() != 1 {
		err = pgx.ErrNoRows
	}
	return err
}

// RegistrarConsentimiento implementa almacen.Almacen.
func (a *Almacen) RegistrarConsentimiento(ctx context.Context, t dominio.TenantID, c dominio.Consentimiento, ahora time.Time) (dominio.Sesion, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.Sesion{}, err
	}
	if err := c.Validar(); err != nil {
		return dominio.Sesion{}, err
	}
	var out dominio.Sesion
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		s, err := sesionParaActualizar(ctx, tx, t, c.SesionID)
		if err != nil {
			return err
		}
		if err := s.Consentir(ahora); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO vc.consentimientos
			(tenant_id, consentimiento_id, sesion_id, aviso_version, registrado_en, borrar_despues_de)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			string(t), c.ID, c.SesionID, c.AvisoVersion, c.RegistradoEn, c.BorrarDespuesDe); err != nil {
			return err
		}
		out = s
		return actualizarSesion(ctx, tx, t, s)
	})
	return out, err
}

// LeerConsentimiento implementa almacen.Almacen.
func (a *Almacen) LeerConsentimiento(ctx context.Context, t dominio.TenantID, sesionID string) (dominio.Consentimiento, error) {
	var out dominio.Consentimiento
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `SELECT consentimiento_id, sesion_id, aviso_version, registrado_en, borrar_despues_de
			FROM vc.consentimientos WHERE tenant_id = $1 AND sesion_id = $2`, string(t), sesionID).
			Scan(&out.ID, &out.SesionID, &out.AvisoVersion, &out.RegistradoEn, &out.BorrarDespuesDe)
		out.RegistradoEn, out.BorrarDespuesDe = out.RegistradoEn.UTC(), out.BorrarDespuesDe.UTC()
		return err
	})
	return out, err
}

// CerrarSesion implementa almacen.Almacen.
func (a *Almacen) CerrarSesion(ctx context.Context, t dominio.TenantID, id string, motivo dominio.MotivoCierre, ahora time.Time) (dominio.Sesion, error) {
	var out dominio.Sesion
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		s, err := sesionParaActualizar(ctx, tx, t, id)
		if err != nil {
			return err
		}
		if err := s.Cerrar(motivo, ahora); err != nil {
			return err
		}
		out = s
		return actualizarSesion(ctx, tx, t, s)
	})
	return out, err
}

// GuardarCotizacion implementa almacen.Almacen.
func (a *Almacen) GuardarCotizacion(ctx context.Context, t dominio.TenantID, c dominio.Cotizacion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO vc.cotizaciones
			(tenant_id, cotizacion_id, sesion_id, emitida_en, moneda, oficio, zona, fuera_de_zona,
			 total_min_centavos, total_max_centavos, tarifas_version, tarifas_estado, validez_dias, leyenda, borrar_despues_de)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
			string(t), c.ID, c.SesionID, c.EmitidaEn, string(c.Moneda), string(c.Oficio), string(c.Zona), c.FueraDeZona,
			int64(c.TotalMinCentavos), int64(c.TotalMaxCentavos), c.Tarifas.Version, string(c.Tarifas.Estado),
			c.ValidezDias, c.Leyenda, c.BorrarDespuesDe); err != nil {
			return err
		}
		// COPY FROM no está soportado en tablas con RLS: se usa un lote de INSERT.
		lote := &pgx.Batch{}
		for i, it := range c.Items {
			lote.Queue(`INSERT INTO vc.items_cotizacion
				(tenant_id, cotizacion_id, orden, tipo, codigo_tarea, descripcion, unidad, cantidad_centesimas,
				 precio_unitario_min_centavos, precio_unitario_max_centavos, importe_min_centavos, importe_max_centavos)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
				string(t), c.ID, int16(i), string(it.Tipo), it.CodigoTarea, it.Descripcion, string(it.Unidad),
				it.CantidadCentesimas, int64(it.PrecioUnitarioMinCentavos), int64(it.PrecioUnitarioMaxCentavos),
				int64(it.ImporteMinCentavos), int64(it.ImporteMaxCentavos))
		}
		err := tx.SendBatch(ctx, lote).Close()
		return err
	})
}

// LeerCotizacionDeSesion implementa almacen.Almacen.
func (a *Almacen) LeerCotizacionDeSesion(ctx context.Context, t dominio.TenantID, sesionID string) (dominio.Cotizacion, error) {
	var c dominio.Cotizacion
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		var moneda, oficio, zona, estado string
		var tmin, tmax int64
		err := tx.QueryRow(ctx, `SELECT cotizacion_id, sesion_id, emitida_en, moneda, oficio, zona, fuera_de_zona,
			       total_min_centavos, total_max_centavos, tarifas_version, tarifas_estado, validez_dias, leyenda, borrar_despues_de
			FROM vc.cotizaciones WHERE tenant_id = $1 AND sesion_id = $2`, string(t), sesionID).
			Scan(&c.ID, &c.SesionID, &c.EmitidaEn, &moneda, &oficio, &zona, &c.FueraDeZona, &tmin, &tmax,
				&c.Tarifas.Version, &estado, &c.ValidezDias, &c.Leyenda, &c.BorrarDespuesDe)
		if err != nil {
			return err
		}
		c.Moneda, c.Oficio, c.Zona, c.Tarifas.Estado = dominio.Moneda(moneda), dominio.Oficio(oficio), dominio.Zona(zona), dominio.EstadoTarifas(estado)
		c.TotalMinCentavos, c.TotalMaxCentavos = dominio.Centavos(tmin), dominio.Centavos(tmax)
		c.EmitidaEn, c.BorrarDespuesDe = c.EmitidaEn.UTC(), c.BorrarDespuesDe.UTC()
		filas, err := tx.Query(ctx, `SELECT tipo, codigo_tarea, descripcion, unidad, cantidad_centesimas,
			       precio_unitario_min_centavos, precio_unitario_max_centavos, importe_min_centavos, importe_max_centavos
			FROM vc.items_cotizacion WHERE tenant_id = $1 AND cotizacion_id = $2 ORDER BY orden`, string(t), c.ID)
		if err != nil {
			return err
		}
		defer filas.Close()
		for filas.Next() {
			var it dominio.ItemCotizacion
			var tipo, unidad string
			var pmin, pmax, imin, imax int64
			if err := filas.Scan(&tipo, &it.CodigoTarea, &it.Descripcion, &unidad, &it.CantidadCentesimas,
				&pmin, &pmax, &imin, &imax); err != nil {
				return err
			}
			it.Tipo, it.Unidad = dominio.TipoItem(tipo), dominio.Unidad(unidad)
			it.PrecioUnitarioMinCentavos, it.PrecioUnitarioMaxCentavos = dominio.Centavos(pmin), dominio.Centavos(pmax)
			it.ImporteMinCentavos, it.ImporteMaxCentavos = dominio.Centavos(imin), dominio.Centavos(imax)
			c.Items = append(c.Items, it)
		}
		return filas.Err()
	})
	return c, err
}

// BorrarVencidos implementa almacen.Almacen. Borra las cotizaciones vencidas
// y las sesiones vencidas (consentimientos, cotizaciones e ítems caen en
// cascada) y deja constancia solo con cantidades.
func (a *Almacen) BorrarVencidos(ctx context.Context, t dominio.TenantID, ahora time.Time) (almacen.Borrados, error) {
	var b almacen.Borrados
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
			WITH sv AS (SELECT sesion_id FROM vc.sesiones WHERE tenant_id = $1 AND borrar_despues_de <= $2),
			     cv AS (SELECT cotizacion_id FROM vc.cotizaciones
			            WHERE tenant_id = $1 AND (borrar_despues_de <= $2 OR sesion_id IN (SELECT sesion_id FROM sv)))
			SELECT (SELECT count(*) FROM sv),
			       (SELECT count(*) FROM vc.consentimientos WHERE tenant_id = $1 AND sesion_id IN (SELECT sesion_id FROM sv)),
			       (SELECT count(*) FROM cv),
			       (SELECT count(*) FROM vc.items_cotizacion WHERE tenant_id = $1 AND cotizacion_id IN (SELECT cotizacion_id FROM cv))`,
			string(t), ahora).Scan(&b.Sesiones, &b.Consentimientos, &b.Cotizaciones, &b.Items)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "DELETE FROM vc.cotizaciones WHERE tenant_id = $1 AND borrar_despues_de <= $2", string(t), ahora); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "DELETE FROM vc.sesiones WHERE tenant_id = $1 AND borrar_despues_de <= $2", string(t), ahora); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO vc.registro_borrados
			(tenant_id, ejecutado_en, sesiones, consentimientos, cotizaciones, items) VALUES ($1, $2, $3, $4, $5, $6)`,
			string(t), ahora, b.Sesiones, b.Consentimientos, b.Cotizaciones, b.Items)
		return err
	})
	if err != nil {
		return almacen.Borrados{}, err
	}
	return b, nil
}

// TenantsParaRetencion implementa almacen.Global con la función SECURITY
// DEFINER de la migración 0001: solo ids, ningún otro dato.
func (a *Almacen) TenantsParaRetencion(ctx context.Context) ([]dominio.TenantID, error) {
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	filas, err := a.pool.Query(ctx, "SELECT t::text FROM vc.tenants_para_retencion() AS t")
	if err != nil {
		return nil, traducir(err)
	}
	ids, err := pgx.CollectRows(filas, pgx.RowTo[string])
	if err != nil {
		return nil, traducir(err)
	}
	return convertir[dominio.TenantID](ids), nil
}

func textos[T ~string](l []T) []string {
	out := make([]string, len(l))
	for i, v := range l {
		out[i] = string(v)
	}
	return out
}

func convertir[T ~string](l []string) []T {
	out := make([]T, len(l))
	for i, v := range l {
		out[i] = T(v)
	}
	return out
}

func utc(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}
