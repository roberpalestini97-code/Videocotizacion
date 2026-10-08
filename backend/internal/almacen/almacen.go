// Package almacen define el puerto de persistencia. Toda operación recibe el
// tenant explícito, que sale SIEMPRE de la credencial autenticada (ADR 0005);
// la implementación postgres lo usa en `SET LOCAL app.tenant_id` (ADR 0004).
//
// Contrato de errores (lo verifica la batería de conformidad para todas las
// implementaciones):
//   - no existe o es de otro tenant      → errores.NoEncontrado (nunca se distingue)
//   - transición de estado no permitida  → errores.EstadoInvalido / errores.SesionCerrada
//   - datos inválidos o duplicados        → errores.ValidacionFallida / errores.EstadoInvalido
//   - base caída o tiempo agotado         → errores.ServicioNoDisponible
package almacen

import (
	"context"
	"time"

	"videocotizacion/backend/internal/dominio"
)

// Pagina pide un tramo del listado por clave (keyset), no por OFFSET (S07).
type Pagina struct {
	Despues string // cursor opaco devuelto por la página anterior ("" = inicio)
	Limite  int    // 1..100
}

// Borrados cuenta lo eliminado por la retención.
type Borrados struct {
	Sesiones, Consentimientos, Cotizaciones, Items int64
}

// Almacen es el puerto de persistencia.
type Almacen interface {
	// Ping verifica que el almacén responde (healthcheck de disponibilidad).
	Ping(ctx context.Context) error

	CrearTenant(ctx context.Context, t dominio.Tenant) error
	LeerTenant(ctx context.Context, tenant dominio.TenantID) (dominio.Tenant, error)

	CrearAsesor(ctx context.Context, tenant dominio.TenantID, a dominio.Asesor) error
	LeerAsesor(ctx context.Context, tenant dominio.TenantID, asesorID string) (dominio.Asesor, error)

	CrearSesion(ctx context.Context, tenant dominio.TenantID, s dominio.Sesion) error
	LeerSesion(ctx context.Context, tenant dominio.TenantID, sesionID string) (dominio.Sesion, error)
	// ListarSesionesDeAsesor ordena por creada_en descendente y id descendente.
	ListarSesionesDeAsesor(ctx context.Context, tenant dominio.TenantID, asesorID string, p Pagina) (sesiones []dominio.Sesion, siguiente string, err error)

	// RegistrarConsentimiento anexa el consentimiento y pasa la sesión a
	// "consentida" en una sola transacción.
	RegistrarConsentimiento(ctx context.Context, tenant dominio.TenantID, c dominio.Consentimiento, ahora time.Time) (dominio.Sesion, error)
	LeerConsentimiento(ctx context.Context, tenant dominio.TenantID, sesionID string) (dominio.Consentimiento, error)

	CerrarSesion(ctx context.Context, tenant dominio.TenantID, sesionID string, motivo dominio.MotivoCierre, ahora time.Time) (dominio.Sesion, error)

	// GuardarCotizacion guarda la cotización (una por sesión) con sus ítems.
	GuardarCotizacion(ctx context.Context, tenant dominio.TenantID, c dominio.Cotizacion) error
	LeerCotizacionDeSesion(ctx context.Context, tenant dominio.TenantID, sesionID string) (dominio.Cotizacion, error)

	// BorrarVencidos elimina las sesiones con borrar_despues_de <= ahora y todo
	// lo que cuelga de ellas, solo del tenant indicado.
	BorrarVencidos(ctx context.Context, tenant dominio.TenantID, ahora time.Time) (Borrados, error)

	Cerrar()
}

// Global es el único camino entre tenants y existe solo para la tarea de
// retención (ADR 0004, consecuencias): devuelve ids de tenant, sin ningún
// otro dato, para luego llamar a BorrarVencidos tenant por tenant.
type Global interface {
	TenantsParaRetencion(ctx context.Context) ([]dominio.TenantID, error)
}

// Completo es lo que implementan memoria y postgres.
type Completo interface {
	Almacen
	Global
}

// LimitePagina normaliza el tamaño de página.
func LimitePagina(n int) int {
	switch {
	case n < 1:
		return 20
	case n > 100:
		return 100
	default:
		return n
	}
}
