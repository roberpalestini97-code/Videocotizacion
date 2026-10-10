package postgres

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
)

// PrivilegiosPermitidos es la lista EXACTA de lo que el rol de la API puede
// hacer (ADR 0004 §3, H2 de T43). Cualquier privilegio de más (TRUNCATE,
// REFERENCES, TRIGGER, UPDATE no listado, CREATE en un esquema o en la base,
// EXECUTE de una función nueva) o de menos impide arrancar. Toda migración que
// cambie privilegios actualiza esta lista en el mismo cambio.
var PrivilegiosPermitidos = []string{
	"base:CONNECT",
	"funcion vc.impedir_modificacion:EXECUTE",
	"funcion vc.tenant_actual:EXECUTE",
	"funcion vc.tenants_para_retencion:EXECUTE",
	"funcion vc.buscar_clave:EXECUTE",
	"funcion vc.buscar_contrasena:EXECUTE",
	"funcion vc.buscar_ingreso_panel:EXECUTE",
	"funcion vc.buscar_sesion_medios:EXECUTE",
	"funcion vc.buscar_token_sesion:EXECUTE",
	"tabla vc.asesores:INSERT", "tabla vc.asesores:SELECT",
	"columna vc.asesores.nombre_visible:UPDATE", "columna vc.asesores.oficios:UPDATE",
	"columna vc.asesores.whatsapp:UPDATE", "columna vc.asesores.zonas:UPDATE",
	"tabla vc.claves_api:INSERT", "tabla vc.claves_api:SELECT",
	"columna vc.claves_api.revocada_en:UPDATE",
	"tabla vc.consentimientos:INSERT", "tabla vc.consentimientos:SELECT",
	"tabla vc.consentimientos_asesor:INSERT", "tabla vc.consentimientos_asesor:SELECT",
	"tabla vc.contactos:INSERT", "tabla vc.contactos:SELECT",
	"tabla vc.contrasenas_asesor:INSERT", "tabla vc.contrasenas_asesor:SELECT",
	"columna vc.contrasenas_asesor.creada_en:UPDATE", "columna vc.contrasenas_asesor.hash:UPDATE",
	"columna vc.contrasenas_asesor.iteraciones:UPDATE", "columna vc.contrasenas_asesor.memoria_kib:UPDATE",
	"columna vc.contrasenas_asesor.paralelismo:UPDATE", "columna vc.contrasenas_asesor.sal:UPDATE",
	"tabla vc.enlaces:INSERT", "tabla vc.enlaces:SELECT",
	"tabla vc.ingresos_panel:INSERT", "tabla vc.ingresos_panel:SELECT",
	"columna vc.ingresos_panel.reautenticado_hasta:UPDATE",
	"columna vc.ingresos_panel.revocada_en:UPDATE",
	"tabla vc.codigos_recuperacion:INSERT", "tabla vc.codigos_recuperacion:SELECT",
	"columna vc.codigos_recuperacion.usado_en:UPDATE",
	"columna vc.enlaces.revocado_en:UPDATE",
	"tabla vc.cotizaciones:DELETE", "tabla vc.cotizaciones:INSERT", "tabla vc.cotizaciones:SELECT",
	"tabla vc.respuestas_modelo:INSERT", "tabla vc.respuestas_modelo:SELECT",
	"tabla vc.items_cotizacion:INSERT", "tabla vc.items_cotizacion:SELECT",
	"tabla vc.lecturas:INSERT", "tabla vc.lecturas:SELECT",
	"tabla vc.pasos_totp:INSERT", "tabla vc.pasos_totp:SELECT",
	"tabla vc.registro_borrados:INSERT", "tabla vc.registro_borrados:SELECT",
	"tabla vc.secretos_totp:INSERT", "tabla vc.secretos_totp:SELECT",
	"tabla vc.sesiones:DELETE", "tabla vc.sesiones:INSERT", "tabla vc.sesiones:SELECT",
	"columna vc.sesiones.cerrada_en:UPDATE", "columna vc.sesiones.consentida_en:UPDATE",
	"columna vc.sesiones.duracion_s:UPDATE", "columna vc.sesiones.estado:UPDATE",
	"columna vc.sesiones.motivo_cierre:UPDATE",
	"tabla vc.tenants:INSERT", "tabla vc.tenants:SELECT",
	"tabla vc.tokens_sesion:INSERT", "tabla vc.tokens_sesion:SELECT",
	"columna vc.tokens_sesion.revocado_en:UPDATE",
	"tabla vc_meta.migraciones:SELECT",
}

// consultaPrivilegios enumera todo lo que current_user puede hacer en la base
// (fuera de los esquemas del sistema).
const consultaPrivilegios = `
WITH rel AS (
	SELECT c.oid, n.nspname || '.' || c.relname AS nombre
	FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
	WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
	  AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\_%'
)
SELECT 'tabla ' || r.nombre || ':' || p.priv FROM rel r
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p(priv)
WHERE has_table_privilege(current_user, r.oid, p.priv)
UNION ALL
SELECT 'columna ' || r.nombre || '.' || a.attname || ':' || p.priv FROM rel r
JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS p(priv)
WHERE has_column_privilege(current_user, r.oid, a.attnum, p.priv)
  AND NOT has_table_privilege(current_user, r.oid, p.priv)
UNION ALL
SELECT 'esquema ' || n.nspname || ':CREATE' FROM pg_namespace n
WHERE has_schema_privilege(current_user, n.oid, 'CREATE')
UNION ALL
SELECT 'funcion ' || n.nspname || '.' || p.proname || ':EXECUTE' FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\_%'
  AND has_function_privilege(current_user, p.oid, 'EXECUTE')
UNION ALL
SELECT 'base:' || p.priv FROM unnest(ARRAY['CONNECT', 'CREATE', 'TEMPORARY']) AS p(priv)
WHERE has_database_privilege(current_user, current_database(), p.priv)`

func leerLista(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, sql string, args ...any) ([]string, error) {
	filas, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	l, err := pgx.CollectRows(filas, pgx.RowTo[string])
	if err != nil {
		return nil, err
	}
	slices.Sort(l)
	return l, nil
}

// diferencias devuelve lo que sobra y lo que falta en obtenido.
func diferencias(obtenido, esperado []string) (sobra, falta []string) {
	for _, o := range obtenido {
		if !slices.Contains(esperado, o) {
			sobra = append(sobra, o)
		}
	}
	for _, e := range esperado {
		if !slices.Contains(obtenido, e) {
			falta = append(falta, e)
		}
	}
	return sobra, falta
}

// verificarPrivilegios compara los privilegios reales con la lista permitida
// y exige que el rol no tenga atributos ni membresías extra (H2, H6c de T43).
func (a *Almacen) verificarPrivilegios(ctx context.Context) error {
	var atributos []string
	if err := a.pool.QueryRow(ctx, `
		SELECT array_remove(ARRAY[
			CASE WHEN rolcreaterole THEN 'CREATEROLE' END,
			CASE WHEN rolcreatedb THEN 'CREATEDB' END,
			CASE WHEN rolreplication THEN 'REPLICATION' END], NULL)
		FROM pg_roles WHERE rolname = current_user`).Scan(&atributos); err != nil {
		return fmt.Errorf("postgres: leer atributos del rol: %w", err)
	}
	if len(atributos) > 0 {
		return fmt.Errorf("%w: el rol de la API tiene atributos de más: %v", ErrArranqueInseguro, atributos)
	}
	miembro, err := leerLista(ctx, a.pool, `SELECT r.rolname::text FROM pg_auth_members m
		JOIN pg_roles r ON r.oid = m.roleid WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)`)
	if err != nil {
		return fmt.Errorf("postgres: leer membresías del rol: %w", err)
	}
	if len(miembro) > 0 {
		return fmt.Errorf("%w: el rol de la API es miembro de %v (incluye roles predefinidos)", ErrArranqueInseguro, miembro)
	}
	privs, err := leerLista(ctx, a.pool, consultaPrivilegios)
	if err != nil {
		return fmt.Errorf("postgres: leer privilegios: %w", err)
	}
	sobra, falta := diferencias(privs, PrivilegiosPermitidos)
	if len(sobra) > 0 || len(falta) > 0 {
		return fmt.Errorf("%w: privilegios del rol de la API distintos de los permitidos; sobran %v, faltan %v",
			ErrArranqueInseguro, sobra, falta)
	}
	return nil
}

// verificarPoliticas exige exactamente las políticas de la migración: una de
// aislamiento por tabla y la de solo lectura del dueño sobre vc.tenants.
func (a *Almacen) verificarPoliticas(ctx context.Context) error {
	const condicion = "(tenant_id = vc.tenant_actual())"
	obtenidas, err := leerLista(ctx, a.pool, `
		SELECT tablename || '|' || policyname || '|' || permissive || '|' || roles::text || '|' || cmd || '|' ||
		       coalesce(qual, '') || '|' || coalesce(with_check, '')
		FROM pg_policies WHERE schemaname = 'vc'`)
	if err != nil {
		return fmt.Errorf("postgres: leer políticas: %w", err)
	}
	tablas, err := leerLista(ctx, a.pool, `SELECT c.relname::text FROM pg_class c
		WHERE c.relnamespace = 'vc'::regnamespace AND c.relkind IN ('r', 'p')`)
	if err != nil {
		return fmt.Errorf("postgres: leer tablas: %w", err)
	}
	var dueno string
	if err := a.pool.QueryRow(ctx, "SELECT tableowner::text FROM pg_tables WHERE schemaname = 'vc' AND tablename = 'tenants'").Scan(&dueno); err != nil {
		return fmt.Errorf("postgres: leer dueño de vc.tenants: %w", err)
	}
	esperadas := []string{
		"tenants|dueno_lista_tenants|PERMISSIVE|{" + dueno + "}|SELECT|true|",
		"claves_api|dueno_autentica|PERMISSIVE|{" + dueno + "}|SELECT|true|",
		"tokens_sesion|dueno_autentica|PERMISSIVE|{" + dueno + "}|SELECT|true|",
		"sesiones|dueno_lee_handshake|PERMISSIVE|{" + dueno + "}|SELECT|true|",
		"contrasenas_asesor|dueno_lee_contrasena|PERMISSIVE|{" + dueno + "}|SELECT|true|",
		"ingresos_panel|dueno_lee_ingreso|PERMISSIVE|{" + dueno + "}|SELECT|true|",
	}
	for _, t := range tablas {
		esperadas = append(esperadas, t+"|aislamiento_por_tenant|PERMISSIVE|{public}|ALL|"+condicion+"|"+condicion)
	}
	slices.Sort(esperadas)
	sobra, falta := diferencias(obtenidas, esperadas)
	if len(sobra) > 0 || len(falta) > 0 {
		return fmt.Errorf("%w: políticas RLS distintas de las esperadas; sobran %v, faltan %v", ErrArranqueInseguro, sobra, falta)
	}
	return nil
}

// verificarFunciones endurece la excepción a RLS (H3 de T43): una sola función
// SECURITY DEFINER, del dueño, con search_path fijo y sin EXECUTE para PUBLIC;
// y vc.tenant_actual() con la definición esperada (NULLIF y STABLE).
func (a *Almacen) verificarFunciones(ctx context.Context) error {
	definers, err := leerLista(ctx, a.pool, `
		SELECT n.nspname || '.' || p.proname || '|' || coalesce(array_to_string(p.proconfig, ';'), '') || '|' ||
		       (p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'vc.tenants'::regclass))::text || '|' ||
		       has_function_privilege('public', p.oid, 'EXECUTE')::text
		FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\_%'`)
	if err != nil {
		return fmt.Errorf("postgres: leer funciones SECURITY DEFINER: %w", err)
	}
	esperado := []string{
		"vc.buscar_clave|search_path=pg_catalog, pg_temp|true|false",
		"vc.buscar_contrasena|search_path=pg_catalog, pg_temp|true|false",
		"vc.buscar_ingreso_panel|search_path=pg_catalog, pg_temp|true|false",
		"vc.buscar_sesion_medios|search_path=pg_catalog, pg_temp|true|false",
		"vc.buscar_token_sesion|search_path=pg_catalog, pg_temp|true|false",
		"vc.tenants_para_retencion|search_path=pg_catalog, pg_temp|true|false",
	}
	if !slices.Equal(definers, esperado) {
		return fmt.Errorf("%w: funciones SECURITY DEFINER = %v; se espera solo %v (search_path fijo, del dueño, sin PUBLIC)",
			ErrArranqueInseguro, definers, esperado)
	}
	var fuente, volatilidad string
	if err := a.pool.QueryRow(ctx, "SELECT prosrc, provolatile::text FROM pg_proc WHERE oid = 'vc.tenant_actual()'::regprocedure").
		Scan(&fuente, &volatilidad); err != nil {
		return fmt.Errorf("postgres: leer vc.tenant_actual: %w", err)
	}
	if strings.TrimSpace(fuente) != "SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid" || volatilidad != "s" {
		return fmt.Errorf("%w: vc.tenant_actual() no tiene la definición esperada", ErrArranqueInseguro)
	}
	return nil
}
