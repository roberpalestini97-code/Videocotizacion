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

// DatosMedios es lo mínimo para el handshake: quién creó la sesión y si ya
// está cerrada. No incluye nombre, teléfono ni email.
type DatosMedios struct {
	TenantID dominio.TenantID
	Estado   dominio.EstadoSesion
	ClaveID  string
	Origenes []string
}

// Pagina pide un tramo del listado por clave (keyset), no por OFFSET (S07).
// Oficio vacío y fechas en cero no filtran. Hasta es el día UTC inclusive.
type Pagina struct {
	Despues string
	Limite  int
	Oficio  dominio.Oficio
	Desde   time.Time
	Hasta   time.Time
}

// Borrados cuenta lo eliminado por la retención.
type Borrados struct {
	Sesiones, Consentimientos, Cotizaciones, Items int64
}

// ConsumoContado es lo que el almacén puede sumar del asesor en el mes de
// ahora. No incluye dinero ni la serie diaria.
type ConsumoContado struct {
	SegundosUsados     int
	SegundosTope       int
	SimultaneasEnCurso int
	SimultaneasTope    int
}

// Almacen es el puerto de persistencia.
type Almacen interface {
	// Ping verifica que el almacén responde (healthcheck de disponibilidad).
	Ping(ctx context.Context) error

	CrearTenant(ctx context.Context, t dominio.Tenant) error
	LeerTenant(ctx context.Context, tenant dominio.TenantID) (dominio.Tenant, error)

	CrearAsesor(ctx context.Context, tenant dominio.TenantID, a dominio.Asesor) error
	LeerAsesor(ctx context.Context, tenant dominio.TenantID, asesorID string) (dominio.Asesor, error)
	// ActualizarPerfil escribe solo nombre, WhatsApp, oficios y zonas.
	// Email y rol quedan como estaban. Otro tenant es no_encontrado.
	ActualizarPerfil(ctx context.Context, tenant dominio.TenantID, a dominio.Asesor) (dominio.Asesor, error)

	CrearSesion(ctx context.Context, tenant dominio.TenantID, s dominio.Sesion) error
	LeerSesion(ctx context.Context, tenant dominio.TenantID, sesionID string) (dominio.Sesion, error)
	// ListarSesionesDeAsesor ordena por creada_en descendente y id descendente.
	ListarSesionesDeAsesor(ctx context.Context, tenant dominio.TenantID, asesorID string, p Pagina) (sesiones []dominio.Sesion, siguiente string, err error)

	// RegistrarConsentimiento anexa el consentimiento y pasa la sesión a
	// "consentida" en una sola transacción.
	RegistrarConsentimiento(ctx context.Context, tenant dominio.TenantID, c dominio.Consentimiento, ahora time.Time) (dominio.Sesion, error)
	LeerConsentimiento(ctx context.Context, tenant dominio.TenantID, sesionID string) (dominio.Consentimiento, error)

	CerrarSesion(ctx context.Context, tenant dominio.TenantID, sesionID string, motivo dominio.MotivoCierre, ahora time.Time) (dominio.Sesion, error)

	// MarcarVoz anota la última voz de una sesión en_curso. Creada, consentida
	// o cerrada no se anota. No llama proveedores ni escribe una columna nueva.
	MarcarVoz(ctx context.Context, tenant dominio.TenantID, sesionID string, ahora time.Time) error
	// BarrerLimites cierra las en_curso que cumplieron sin_voz_s o
	// duracion_maxima_s. La duración máxima gana si ambos vencen. Libera el
	// cupo igual que un cierre. No llama proveedores.
	BarrerLimites(ctx context.Context, tenant dominio.TenantID, ahora time.Time, sinVozS, duracionMaxS int) (int, error)

	// ReservarTokenMedios reserva en forma atómica un cupo de simultáneas del
	// tenant (R57) y guarda solo el HMAC del token de medios. Si la sesión ya
	// está en_curso, no consume otro cupo y deja sin vigencia el HMAC anterior.
	// El tope de gasto mensual sigue sin cifra: solo se compara la duración ya
	// acumulada con SegundosMesTope. No llama proveedores.
	ReservarTokenMedios(ctx context.Context, tenant dominio.TenantID, sesionID string, hash []byte, ahora time.Time) (dominio.Sesion, error)

	// GuardarCotizacion guarda la cotización (una por sesión) con sus ítems.
	GuardarCotizacion(ctx context.Context, tenant dominio.TenantID, c dominio.Cotizacion) error
	LeerCotizacionDeSesion(ctx context.Context, tenant dominio.TenantID, sesionID string) (dominio.Cotizacion, error)

	// AnexarRespuestaModelo guarda la salida JSON del LLM de un turno. Un turno
	// repetido en la misma sesión es estado_invalido.
	AnexarRespuestaModelo(ctx context.Context, tenant dominio.TenantID, r dominio.RespuestaModelo) error
	// ListarRespuestasModeloDeSesion devuelve turnos en orden ascendente.
	ListarRespuestasModeloDeSesion(ctx context.Context, tenant dominio.TenantID, sesionID string) ([]dominio.RespuestaModelo, error)

	// BuscarDatosMedios localiza la sesión por id, sin tenant: el handshake del
	// WebSocket todavía no tiene el token. Devuelve solo el estado y los Origin
	// de la clave que la creó. Cero o más de una fila es no_encontrado.
	BuscarDatosMedios(ctx context.Context, sesionID string) (DatosMedios, error)
	// ConsumirTokenMedios marca el HMAC de medios de esta sesión como usado.
	// Un token de otra sesión, vencido, reusado o que no es de medios no se
	// modifica. El valor en claro no entra.
	ConsumirTokenMedios(ctx context.Context, tenant dominio.TenantID, sesionID string, hash []byte, ahora time.Time) error

	// RegistrarContacto anexa el contacto de la sesión. Un segundo registro
	// devuelve contacto_ya_registrado y no pisa el primero. borrar_despues_de
	// sale de RetencionDias del tenant. No exige el consentimiento de cámara.
	RegistrarContacto(ctx context.Context, tenant dominio.TenantID, c dominio.Contacto, ahora time.Time) (dominio.Contacto, error)
	LeerContacto(ctx context.Context, tenant dominio.TenantID, sesionID string) (dominio.Contacto, error)

	// GuardarContrasena persiste el hash Argon2id. La contraseña en claro no entra.
	GuardarContrasena(ctx context.Context, tenant dominio.TenantID, c dominio.ContrasenaAsesor) error
	// LeerContrasena lee el hash dentro del tenant. Otro tenant es no_encontrado.
	LeerContrasena(ctx context.Context, tenant dominio.TenantID, asesorID string) (dominio.ContrasenaAsesor, error)
	// BuscarContrasenaPorEmail busca entre tenants (vc.buscar_contrasena).
	BuscarContrasenaPorEmail(ctx context.Context, email string) (dominio.ContrasenaHallada, error)

	// GuardarIngresoPanel persiste solo los HMAC de la cookie preliminar.
	GuardarIngresoPanel(ctx context.Context, tenant dominio.TenantID, p dominio.IngresoPanel) error
	LeerIngresoPanel(ctx context.Context, tenant dominio.TenantID, hashCookie []byte) (dominio.IngresoPanel, error)
	// CerrarSesionPanel marca revocada la sesión ya abierta con TOTP.
	// Una cookie preliminar, ajena, vencida o ya cerrada es sesion_vencida y no se toca.
	CerrarSesionPanel(ctx context.Context, tenant dominio.TenantID, hashCookie []byte, ahora time.Time) error
	// BuscarIngresoPorHash localiza la cookie sin tenant (vc.buscar_ingreso_panel).
	// El secreto TOTP no sale por acá: se lee después, dentro del tenant.
	BuscarIngresoPorHash(ctx context.Context, hashCookie []byte) (dominio.IngresoHallado, error)

	// GuardarSecretoTOTP persiste el secreto ya cifrado. El claro no entra.
	GuardarSecretoTOTP(ctx context.Context, tenant dominio.TenantID, s dominio.SecretoTOTP) error
	LeerSecretoTOTP(ctx context.Context, tenant dominio.TenantID, asesorID string) (dominio.SecretoTOTP, error)
	// GuardarCodigoRecuperacion persiste el HMAC del código, nunca el claro.
	GuardarCodigoRecuperacion(ctx context.Context, tenant dominio.TenantID, c dominio.CodigoRecuperacion) error
	ListarCodigosRecuperacion(ctx context.Context, tenant dominio.TenantID, asesorID string) ([]dominio.CodigoRecuperacion, error)
	// AbrirSesionPanel consume el paso TOTP o el código de recuperación, invalida
	// la cookie preliminar y guarda la sesión nueva, en una sola operación.
	AbrirSesionPanel(ctx context.Context, tenant dominio.TenantID, a dominio.AperturaPanel) error
	// OtorgarReautenticacion marca el paso TOTP como usado y guarda el fin de
	// la ventana en la sesión. Un paso ya usado es totp_invalido y no mueve
	// los vencimientos. No rota la cookie.
	OtorgarReautenticacion(ctx context.Context, tenant dominio.TenantID, hashCookie []byte, paso int64, hasta, ahora time.Time) error
	// CambiarContrasena reemplaza el hash del asesor, revoca las demás cookies
	// de ese asesor y consume la ventana de esta sesión. Sin ventana vigente
	// es reautenticacion_requerida y no toca el hash. La cookie actual sigue.
	CambiarContrasena(ctx context.Context, tenant dominio.TenantID, hashCookie []byte, nueva dominio.ContrasenaAsesor, ahora time.Time) error

	// BorrarVencidos elimina las sesiones con borrar_despues_de <= ahora y todo
	// lo que cuelga de ellas, solo del tenant indicado.
	BorrarVencidos(ctx context.Context, tenant dominio.TenantID, ahora time.Time) (Borrados, error)

	// GuardarClave persiste el HMAC de una credencial. El secreto en claro no
	// entra acá.
	GuardarClave(ctx context.Context, tenant dominio.TenantID, c dominio.ClaveAPI) error
	// BuscarClavePorHash busca entre tenants por el HMAC (vc.buscar_clave).
	// Una clave revocada se devuelve con Revocada=true, no como error.
	BuscarClavePorHash(ctx context.Context, hash []byte) (dominio.ClaveHallada, error)
	// ListarClavesWidget devuelve las claves públicas del tenant, sin el HMAC.
	ListarClavesWidget(ctx context.Context, tenant dominio.TenantID) ([]dominio.ClaveAPI, error)
	// RevocarClaveWidget marca revocada_en en una clave pública vigente.
	// Ajena, secreta, inexistente o ya revocada es no_encontrado.
	RevocarClaveWidget(ctx context.Context, tenant dominio.TenantID, claveID string, ahora time.Time) error

	GuardarEnlace(ctx context.Context, tenant dominio.TenantID, e dominio.Enlace) error
	// LeerEnlace devuelve el enlace vigente. Revocado, inexistente o de otro
	// tenant es el mismo no_encontrado (R64).
	LeerEnlace(ctx context.Context, tenant dominio.TenantID, idPublico string) (dominio.Enlace, error)
	// RotarEnlace revoca los enlaces vigentes de ese asesor y guarda el nuevo.
	// Si no tenía, solo lo crea. No borra el anterior ni toca el de otro asesor.
	RotarEnlace(ctx context.Context, tenant dominio.TenantID, asesorID string, nuevo dominio.Enlace) (dominio.Enlace, error)

	// GuardarConsentimientoAsesor anexa la aceptación del aviso por el asesor.
	// Una segunda fila del mismo asesor es estado_invalido y no pisa la primera.
	GuardarConsentimientoAsesor(ctx context.Context, tenant dominio.TenantID, c dominio.ConsentimientoAsesor) error
	// LeerConsentimientoAsesor lee esa fila. Sin fila, o de otro tenant, es no_encontrado.
	LeerConsentimientoAsesor(ctx context.Context, tenant dominio.TenantID, asesorID string) (dominio.ConsentimientoAsesor, error)

	// AnexarLectura inserta un registro de acceso. No admite teléfono, email ni nombre.
	AnexarLectura(ctx context.Context, tenant dominio.TenantID, l dominio.Lectura) error
	// ListarLecturasDelAsesor devuelve las acciones de ese asesor y las de sus
	// sesiones. Las de otro asesor del mismo tenant no entran.
	ListarLecturasDelAsesor(ctx context.Context, tenant dominio.TenantID, asesorID string) ([]dominio.Lectura, error)
	// ConsumoDelAsesor cuenta segundos del mes y simultáneas en curso de ese
	// asesor. Los topes salen del tenant. Cero si no hay nada que contar.
	ConsumoDelAsesor(ctx context.Context, tenant dominio.TenantID, asesorID string, ahora time.Time) (ConsumoContado, error)

	// GuardarTokenSesion persiste el HMAC de un token vc_ses_. El valor en
	// claro no entra. La sesión tiene que existir en el tenant.
	GuardarTokenSesion(ctx context.Context, tenant dominio.TenantID, tok dominio.TokenSesion) error
	// BuscarTokenPorHash busca entre tenants por el HMAC (vc.buscar_token_sesion).
	// Un token revocado se devuelve con Revocado=true, no como error.
	BuscarTokenPorHash(ctx context.Context, hash []byte) (dominio.TokenHallado, error)

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
