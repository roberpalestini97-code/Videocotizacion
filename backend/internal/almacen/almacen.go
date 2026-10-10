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

	// CerrarSesion cierra la sesión y, en la misma transacción, libera su
	// reserva de cupo y suma la duración al contador mensual del tenant
	// (vc.consumo_mensual, H2 de T04b1).
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

// Credenciales guarda claves de API, enlaces opacos, tokens de sesión,
// derivaciones y el consumo para el cupo (T04b). Todo con tenant explícito.
type Credenciales interface {
	CrearClaveAPI(ctx context.Context, tenant dominio.TenantID, c dominio.ClaveAPI) error
	RevocarClaveAPI(ctx context.Context, tenant dominio.TenantID, claveID string, ahora time.Time) error

	CrearEnlace(ctx context.Context, tenant dominio.TenantID, e dominio.Enlace) error
	// LeerEnlace devuelve también los revocados (decide quien llama).
	LeerEnlace(ctx context.Context, tenant dominio.TenantID, idPublico string) (dominio.Enlace, error)

	// CrearSesionConToken guarda la sesión y su token en una sola transacción.
	CrearSesionConToken(ctx context.Context, tenant dominio.TenantID, s dominio.Sesion, tok dominio.TokenSesion) error
	RevocarTokensDeSesion(ctx context.Context, tenant dominio.TenantID, sesionID string, ahora time.Time) error

	// Cupo lee, sin bloquear, los contadores del mes (dominio.MesCuota) del
	// tenant y del asesor, sus topes y las reservas vigentes en `ahora` (para
	// que crearSesion verifique sin reservar). Nunca suma vc.sesiones (H2).
	Cupo(ctx context.Context, tenant dominio.TenantID, asesorID string, mes, ahora time.Time) (dominio.EstadoCupo, error)

	// ReservarCupo, en UNA transacción (vc.reservar_cupo; bloqueos global →
	// tenant → asesor): lee la sesión con bloqueo (404), aplica
	// Sesion.IniciarMedios (409), reutiliza la reserva vigente de la misma
	// sesión, o cobra completa la vencida y CIERRA la sesión
	// (duracion_maxima; Vencida=true), o aplica dominio.DecidirReserva (429),
	// guarda la reserva y deja la sesión en "en_curso".
	ReservarCupo(ctx context.Context, tenant dominio.TenantID, p dominio.PedidoReserva) (dominio.ResultadoReserva, error)

	// ObtenerDerivacion devuelve la derivación de la sesión; si no existe,
	// guarda nueva (código repetido en el tenant → errores.EstadoInvalido).
	ObtenerDerivacion(ctx context.Context, tenant dominio.TenantID, nueva dominio.Derivacion) (dominio.Derivacion, error)
}

// Autenticacion busca una credencial por su HMAC SIN saber el tenant: es la
// única otra excepción a RLS (funciones SECURITY DEFINER de 0002). Devuelve
// solo la fila cuyo hash coincide exactamente; no encontrada →
// errores.NoEncontrado (quien llama responde credencial_invalida).
type Autenticacion interface {
	BuscarClaveAPI(ctx context.Context, hash []byte) (dominio.TenantID, dominio.ClaveAPI, error)
	BuscarTokenSesion(ctx context.Context, hash []byte) (dominio.TenantID, dominio.TokenSesion, error)
}

// ClienteFinal guarda lo que deja el cliente final en la parte 2a (0004):
// token de medios, contacto opcional (R68) y solicitudes ARCO (R22–R24).
type ClienteFinal interface {
	// GuardarTokenMedios guarda el HMAC del token de medios (R32). Sesión
	// inexistente → errores.NoEncontrado.
	GuardarTokenMedios(ctx context.Context, tenant dominio.TenantID, tok dominio.TokenMedios) error

	// RegistrarContacto: sesión inexistente → NoEncontrado; sin consentimiento
	// (Sesion.AdmiteContacto) → EstadoInvalido; ya hay uno →
	// ContactoYaRegistrado. Vence con la sesión.
	RegistrarContacto(ctx context.Context, tenant dominio.TenantID, c dominio.Contacto) error

	// AtenderArco busca la consulta por código de referencia y exige que el
	// segundo factor coincida con su contacto (R24). Con supresión y
	// coincidencia borra la sesión y todo lo que cuelga de ella (consulta,
	// contacto, derivación; R23). Guarda la solicitud anonimizada con el
	// resultado y la devuelve. Lo que vea quien llama no depende de la
	// coincidencia.
	AtenderArco(ctx context.Context, tenant dominio.TenantID, p dominio.PedidoArco, s dominio.SolicitudArco) (dominio.SolicitudArco, error)
}

// Completo es lo que implementan memoria y postgres.
type Completo interface {
	Almacen
	Global
	Credenciales
	Autenticacion
	ClienteFinal
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
