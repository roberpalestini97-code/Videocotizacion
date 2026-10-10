package dominio

import "time"

// AccionLectura es el enum de RegistroLectura: solo la acción, nunca el dato.
type AccionLectura string

const (
	AccionVerDetalle         AccionLectura = "ver_detalle"
	AccionVerContacto        AccionLectura = "ver_contacto"
	AccionExportarMiCuenta   AccionLectura = "exportar_mi_cuenta"
	AccionRotarEnlace        AccionLectura = "rotar_enlace"
	AccionCrearClaveWidget   AccionLectura = "crear_clave_widget"
	AccionRevocarClaveWidget AccionLectura = "revocar_clave_widget"
	AccionInicioSesion       AccionLectura = "inicio_sesion"
	AccionCambioContrasena   AccionLectura = "cambio_contrasena"
)

// Lectura es una fila solo-anexar (R69, R70). No tiene teléfono, email ni nombre.
type Lectura struct {
	ID         string
	OcurridoEn time.Time
	AsesorID   string
	Accion     AccionLectura
	RecursoID  string
}

// Validar verifica el id, la acción y, si viene, el recurso.
func (l Lectura) Validar() error {
	var errs []error
	if !IDValido(l.ID, PrefijoRegistro) {
		errs = append(errs, invalido("/registro_id", "formato inválido"))
	}
	if !IDValido(l.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if !l.Accion.valida() {
		errs = append(errs, invalido("/accion", "valor no permitido"))
	}
	if l.RecursoID != "" && !reID.MatchString(l.RecursoID) {
		errs = append(errs, invalido("/recurso_id", "formato inválido"))
	}
	if l.OcurridoEn.IsZero() {
		errs = append(errs, invalido("/ocurrido_en", "requerido"))
	}
	return unir(errs)
}

func (a AccionLectura) valida() bool {
	switch a {
	case AccionVerDetalle, AccionVerContacto, AccionExportarMiCuenta, AccionRotarEnlace,
		AccionCrearClaveWidget, AccionRevocarClaveWidget, AccionInicioSesion, AccionCambioContrasena:
		return true
	default:
		return false
	}
}

// ConsentimientoAsesor es la aceptación guardada del aviso por el asesor.
// La exportación no la fabrica: si no hay fila, no hay aceptación.
type ConsentimientoAsesor struct {
	AsesorID   string
	Version    string
	AceptadoEn time.Time
}

// Validar verifica el asesor, la versión del aviso y el instante.
func (c ConsentimientoAsesor) Validar() error {
	var errs []error
	if !IDValido(c.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if !reVersionAviso.MatchString(c.Version) {
		errs = append(errs, invalido("/version", "formato inválido"))
	}
	if c.AceptadoEn.IsZero() {
		errs = append(errs, invalido("/aceptado_en", "requerido"))
	}
	return unir(errs)
}
