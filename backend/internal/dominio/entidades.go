package dominio

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"videocotizacion/backend/internal/errores"
)

// Instante normaliza un tiempo a UTC con precisión de microsegundos, la de
// timestamptz en PostgreSQL. Así memoria y postgres devuelven lo mismo.
func Instante(t time.Time) time.Time { return t.UTC().Truncate(time.Microsecond) }

var (
	reVersionAviso = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$`)
	reTelefono     = regexp.MustCompile(`^\+[1-9][0-9]{7,14}$`)
	reCodigoTarea  = regexp.MustCompile(`^[a-z0-9_]{3,60}$`)
	reVersionTarif = regexp.MustCompile(`^[0-9A-Za-z.\-]{1,20}$`)
	// Texto libre del contrato: sin < > ni caracteres de control.
	reTextoSeguro = regexp.MustCompile(`^[^<>\x00-\x08\x0B\x0C\x0E-\x1F]*$`)
)

// invalido arma un error validacion_fallida con el campo (sin eco del valor).
func invalido(campo, problema string) error {
	return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("%s: %s", campo, problema))
}

func textoValido(s string, min, max int) bool {
	n := utf8.RuneCountInString(s)
	return utf8.ValidString(s) && n >= min && n <= max && reTextoSeguro.MatchString(s)
}

// Tenant es el cliente de la API (ADR 0005). Rober es el primero.
type Tenant struct {
	ID              TenantID
	Nombre          string
	SimultaneasTope int // inicial 5 (BRIEF 7)
	SegundosMesTope int // inicial 500 min = 30000 s (BRIEF 7)
	RetencionDias   int // plazo propuesto, a validar con abogado
	CreadoEn        time.Time
}

// Validar verifica invariantes del tenant.
func (t Tenant) Validar() error {
	var errs []error
	if !t.ID.Valido() {
		errs = append(errs, invalido("/tenant_id", "formato inválido"))
	}
	if !textoValido(t.Nombre, 1, 120) {
		errs = append(errs, invalido("/nombre", "largo o caracteres inválidos"))
	}
	if t.SimultaneasTope < 1 || t.SimultaneasTope > 1000 {
		errs = append(errs, invalido("/simultaneas_tope", "fuera de rango"))
	}
	if t.SegundosMesTope < 0 || t.SegundosMesTope > 100000000 {
		errs = append(errs, invalido("/segundos_mes_tope", "fuera de rango"))
	}
	if t.RetencionDias < 1 || t.RetencionDias > 3650 {
		errs = append(errs, invalido("/retencion_dias", "fuera de rango"))
	}
	if t.CreadoEn.IsZero() {
		errs = append(errs, invalido("/creado_en", "requerido"))
	}
	return unir(errs)
}

// Asesor es el profesional del panel (PerfilAsesor, R40: sin DNI ni domicilio).
type Asesor struct {
	ID              string
	Rol             RolAsesor
	NombreVisible   string
	Email           string
	WhatsApp        string
	Oficios         []Oficio
	Zonas           []Zona
	CreadoEn        time.Time
	BorrarDespuesDe *time.Time // nil = vigente
}

// Validar verifica invariantes del asesor.
func (a Asesor) Validar() error {
	var errs []error
	if !IDValido(a.ID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if !a.Rol.Valido() {
		errs = append(errs, invalido("/rol", "valor no permitido"))
	}
	if !textoValido(a.NombreVisible, 1, 60) {
		errs = append(errs, invalido("/nombre_visible", "largo o caracteres inválidos"))
	}
	if n := len(a.Email); n < 3 || n > 254 || strings.Count(a.Email, "@") != 1 || !reTextoSeguro.MatchString(a.Email) {
		errs = append(errs, invalido("/email", "formato inválido"))
	}
	if !reTelefono.MatchString(a.WhatsApp) {
		errs = append(errs, invalido("/whatsapp", "formato E.164 inválido"))
	}
	if len(a.Oficios) < 1 || len(a.Oficios) > 5 || !unicos(a.Oficios) {
		errs = append(errs, invalido("/oficios", "entre 1 y 5, sin repetir"))
	}
	for _, o := range a.Oficios {
		if !o.Valido() {
			errs = append(errs, invalido("/oficios", "valor no permitido"))
		}
	}
	if len(a.Zonas) < 1 || len(a.Zonas) > 4 || !unicos(a.Zonas) {
		errs = append(errs, invalido("/zonas", "entre 1 y 4, sin repetir"))
	}
	for _, z := range a.Zonas {
		if !z.Atendida() {
			errs = append(errs, invalido("/zonas", "zona no atendida"))
		}
	}
	if a.CreadoEn.IsZero() {
		errs = append(errs, invalido("/creado_en", "requerido"))
	}
	return unir(errs)
}

// Sesion es una videocotización (Sesion.schema.json).
type Sesion struct {
	ID              string
	AsesorID        string
	Estado          EstadoSesion
	ModoAvatar      ModoAvatar
	CreadaEn        time.Time
	ConsentidaEn    *time.Time
	CerradaEn       *time.Time
	MotivoCierre    MotivoCierre // "" si no está cerrada
	DuracionS       int
	BorrarDespuesDe time.Time
}

// NuevaSesion crea una sesión en estado "creada" con su vencimiento.
func NuevaSesion(asesorID string, modo ModoAvatar, ahora time.Time, retencionDias int) (Sesion, error) {
	id, err := NuevoIDSesion()
	if err != nil {
		return Sesion{}, err
	}
	ahora = Instante(ahora)
	s := Sesion{
		ID: id, AsesorID: asesorID, Estado: EstadoCreada, ModoAvatar: modo, CreadaEn: ahora,
		BorrarDespuesDe: ahora.AddDate(0, 0, retencionDias),
	}
	return s, s.Validar()
}

// Validar verifica invariantes de la sesión (mismas que los CHECK de la base).
func (s Sesion) Validar() error {
	var errs []error
	if !IDValido(s.ID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato inválido"))
	}
	if !IDValido(s.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if !s.Estado.Valido() {
		errs = append(errs, invalido("/estado", "valor no permitido"))
	}
	if !s.ModoAvatar.Valido() {
		errs = append(errs, invalido("/modo_avatar", "valor no permitido"))
	}
	if s.CreadaEn.IsZero() || !s.BorrarDespuesDe.After(s.CreadaEn) {
		errs = append(errs, invalido("/borrar_despues_de", "debe ser posterior a creada_en"))
	}
	cerrada := s.Estado == EstadoCerrada
	if cerrada != (s.CerradaEn != nil && s.MotivoCierre != "") {
		errs = append(errs, invalido("/cerrada_en", "cerrada_en y motivo_cierre solo y siempre en estado cerrada"))
	}
	if s.MotivoCierre != "" && !s.MotivoCierre.Valido() {
		errs = append(errs, invalido("/motivo_cierre", "valor no permitido"))
	}
	if (s.Estado == EstadoConsentida || s.Estado == EstadoEnCurso) && s.ConsentidaEn == nil {
		errs = append(errs, invalido("/consentida_en", "requerido desde el consentimiento"))
	}
	if s.DuracionS < 0 || s.DuracionS > 86400 {
		errs = append(errs, invalido("/duracion_s", "fuera de rango"))
	}
	return unir(errs)
}

// Consentir pasa de "creada" a "consentida" (R10: antes de cámara y micrófono).
func (s *Sesion) Consentir(ahora time.Time) error {
	switch s.Estado {
	case EstadoCreada:
		t := Instante(ahora)
		s.Estado, s.ConsentidaEn = EstadoConsentida, &t
		return nil
	case EstadoCerrada:
		return errores.Envolver(errores.SesionCerrada, fmt.Errorf("consentir sesión cerrada"))
	default:
		return errores.Envolver(errores.EstadoInvalido, fmt.Errorf("consentir desde %s", s.Estado))
	}
}

// Cerrar cierra la sesión con un motivo; la duración se cuenta desde el
// consentimiento (antes de consentir no corre el medidor de minutos).
func (s *Sesion) Cerrar(motivo MotivoCierre, ahora time.Time) error {
	if !motivo.Valido() {
		return invalido("/motivo", "valor no permitido")
	}
	if s.Estado == EstadoCerrada {
		return errores.Envolver(errores.SesionCerrada, fmt.Errorf("sesión ya cerrada"))
	}
	t := Instante(ahora)
	if s.ConsentidaEn != nil {
		d := int(t.Sub(*s.ConsentidaEn) / time.Second)
		s.DuracionS = min(max(d, 0), 86400)
	}
	s.Estado, s.CerradaEn, s.MotivoCierre = EstadoCerrada, &t, motivo
	return nil
}

// Consentimiento registrado (solo-anexar, R12).
type Consentimiento struct {
	ID              string
	SesionID        string
	AvisoVersion    string
	RegistradoEn    time.Time
	BorrarDespuesDe time.Time
}

// NuevoConsentimiento crea el registro para una sesión; vence con ella.
func NuevoConsentimiento(s Sesion, avisoVersion string, ahora time.Time) (Consentimiento, error) {
	id, err := NuevoIDConsentimiento()
	if err != nil {
		return Consentimiento{}, err
	}
	c := Consentimiento{ID: id, SesionID: s.ID, AvisoVersion: avisoVersion, RegistradoEn: Instante(ahora), BorrarDespuesDe: s.BorrarDespuesDe}
	return c, c.Validar()
}

// Validar verifica invariantes del consentimiento.
func (c Consentimiento) Validar() error {
	var errs []error
	if !IDValido(c.ID, PrefijoConsentimiento) {
		errs = append(errs, invalido("/consentimiento_id", "formato inválido"))
	}
	if !IDValido(c.SesionID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato inválido"))
	}
	if !reVersionAviso.MatchString(c.AvisoVersion) {
		errs = append(errs, invalido("/aviso_version", "formato AAAA-MM-DD.n"))
	}
	if c.RegistradoEn.IsZero() || c.BorrarDespuesDe.IsZero() {
		errs = append(errs, invalido("/registrado_en", "requerido"))
	}
	return unir(errs)
}

// ItemCotizacion es un renglón del presupuesto. Cada precio va como rango
// [min, max] porque el tarifario 2026 solo tiene rangos y prohíbe inventar un
// precio central (tarifas/README.md). Cómo se proyecta al contrato, que hoy
// tiene un único precio_unitario_centavos, lo decide arq (pendiente T04b).
type ItemCotizacion struct {
	Tipo                      TipoItem
	CodigoTarea               string
	Descripcion               string
	Unidad                    Unidad
	CantidadCentesimas        int64
	PrecioUnitarioMinCentavos Centavos
	PrecioUnitarioMaxCentavos Centavos
	ImporteMinCentavos        Centavos
	ImporteMaxCentavos        Centavos
}

// Validar verifica el ítem, incluida la fórmula de importe del contrato.
func (it ItemCotizacion) Validar(campo string) error {
	var errs []error
	if !it.Tipo.Valido() {
		errs = append(errs, invalido(campo+"/tipo", "valor no permitido"))
	}
	if !reCodigoTarea.MatchString(it.CodigoTarea) {
		errs = append(errs, invalido(campo+"/codigo_tarea", "formato inválido"))
	}
	if !textoValido(it.Descripcion, 1, 200) {
		errs = append(errs, invalido(campo+"/descripcion", "largo o caracteres inválidos"))
	}
	if !it.Unidad.Valida() {
		errs = append(errs, invalido(campo+"/unidad", "valor no permitido"))
	}
	if it.CantidadCentesimas < 1 || it.CantidadCentesimas > MaxCantidadCentesimas {
		errs = append(errs, invalido(campo+"/cantidad_centesimas", "fuera de rango"))
	}
	if it.PrecioUnitarioMinCentavos < 0 || it.PrecioUnitarioMaxCentavos < it.PrecioUnitarioMinCentavos || it.PrecioUnitarioMaxCentavos > MaxCentavos {
		errs = append(errs, invalido(campo+"/precio_unitario_centavos", "rango inválido"))
	}
	if len(errs) == 0 {
		imin, err1 := ImporteItem(it.CantidadCentesimas, it.PrecioUnitarioMinCentavos)
		imax, err2 := ImporteItem(it.CantidadCentesimas, it.PrecioUnitarioMaxCentavos)
		if err1 != nil || err2 != nil || imin != it.ImporteMinCentavos || imax != it.ImporteMaxCentavos {
			errs = append(errs, invalido(campo+"/importe_centavos", "no coincide con cantidad × precio"))
		}
	}
	return unir(errs)
}

// Tarifas identifica el tarifario usado.
type Tarifas struct {
	Version string
	Estado  EstadoTarifas
}

// Cotizacion es el presupuesto orientativo (Cotizacion.schema.json), con
// totales como rango.
type Cotizacion struct {
	ID               string
	SesionID         string
	EmitidaEn        time.Time
	Moneda           Moneda
	Oficio           Oficio
	Zona             Zona
	FueraDeZona      bool
	Items            []ItemCotizacion
	TotalMinCentavos Centavos
	TotalMaxCentavos Centavos
	Tarifas          Tarifas
	ValidezDias      int
	Leyenda          string
	BorrarDespuesDe  time.Time
}

// Validar verifica invariantes, incluidas las reglas del contrato:
// zona "otra" ⇔ fuera_de_zona, total = suma de importes, 1..30 ítems.
func (c Cotizacion) Validar() error {
	var errs []error
	if !IDValido(c.ID, PrefijoCotizacion) {
		errs = append(errs, invalido("/cotizacion_id", "formato inválido"))
	}
	if !IDValido(c.SesionID, PrefijoSesion) {
		errs = append(errs, invalido("/sesion_id", "formato inválido"))
	}
	if c.EmitidaEn.IsZero() || !c.BorrarDespuesDe.After(c.EmitidaEn) {
		errs = append(errs, invalido("/borrar_despues_de", "debe ser posterior a emitida_en"))
	}
	if !c.Moneda.Valida() {
		errs = append(errs, invalido("/moneda", "valor no permitido"))
	}
	if !c.Oficio.Valido() {
		errs = append(errs, invalido("/oficio", "valor no permitido"))
	}
	if !c.Zona.Valida() {
		errs = append(errs, invalido("/zona", "valor no permitido"))
	}
	if (c.Zona == ZonaOtra) != c.FueraDeZona {
		errs = append(errs, invalido("/fuera_de_zona", "debe ser true solo con zona otra"))
	}
	if len(c.Items) < 1 || len(c.Items) > 30 {
		errs = append(errs, invalido("/items", "entre 1 y 30"))
	}
	var mins, maxs []Centavos
	for i, it := range c.Items {
		if err := it.Validar(fmt.Sprintf("/items/%d", i)); err != nil {
			errs = append(errs, err)
		}
		mins, maxs = append(mins, it.ImporteMinCentavos), append(maxs, it.ImporteMaxCentavos)
	}
	tmin, err1 := Sumar(mins...)
	tmax, err2 := Sumar(maxs...)
	if err1 != nil || err2 != nil || tmin != c.TotalMinCentavos || tmax != c.TotalMaxCentavos {
		errs = append(errs, invalido("/total_centavos", "no coincide con la suma de importes"))
	}
	if !reVersionTarif.MatchString(c.Tarifas.Version) || !c.Tarifas.Estado.Valido() {
		errs = append(errs, invalido("/tarifas", "versión o estado inválido"))
	}
	if c.ValidezDias < 1 || c.ValidezDias > 90 {
		errs = append(errs, invalido("/validez_dias", "entre 1 y 90"))
	}
	if !textoValido(c.Leyenda, 1, 300) {
		errs = append(errs, invalido("/leyenda", "largo o caracteres inválidos"))
	}
	return unir(errs)
}

func unicos[T comparable](l []T) bool {
	vistos := make(map[T]struct{}, len(l))
	for _, v := range l {
		if _, ok := vistos[v]; ok {
			return false
		}
		vistos[v] = struct{}{}
	}
	return true
}

// unir devuelve nil o un único validacion_fallida que envuelve todas las causas.
func unir(errs []error) error {
	if len(errs) == 0 {
		return nil
	}
	if len(errs) == 1 {
		return errs[0]
	}
	return errores.Envolver(errores.ValidacionFallida, errors.Join(errs...))
}
