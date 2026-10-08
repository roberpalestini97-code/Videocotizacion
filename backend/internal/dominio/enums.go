package dominio

// Enumeraciones copiadas de contracts/schemas (0.1.4-borrador). La prueba
// TestEnumsIgualAlContrato las compara con los .schema.json del contrato.

// Zona (Zona.schema.json). "otra" = fuera de zona: se emite igual, marcada.
type Zona string

const (
	ZonaMarChiquita Zona = "mar_chiquita"
	ZonaCobo        Zona = "cobo"
	ZonaSantaClara  Zona = "santa_clara"
	ZonaParqueLago  Zona = "parque_lago"
	ZonaOtra        Zona = "otra"
)

// Zonas lista los valores válidos.
var Zonas = []Zona{ZonaMarChiquita, ZonaCobo, ZonaSantaClara, ZonaParqueLago, ZonaOtra}

// ZonasAtendidas son las del BRIEF (ZonaAtendida.schema.json).
var ZonasAtendidas = []Zona{ZonaMarChiquita, ZonaCobo, ZonaSantaClara, ZonaParqueLago}

// Valida informa si la zona pertenece al enum.
func (z Zona) Valida() bool { return contiene(Zonas, z) }

// Atendida informa si es una de las cuatro zonas de trabajo.
func (z Zona) Atendida() bool { return contiene(ZonasAtendidas, z) }

// Oficio (Oficio.schema.json).
type Oficio string

const (
	OficioPintura       Oficio = "pintura"
	OficioJardineria    Oficio = "jardineria"
	OficioReparaciones  Oficio = "reparaciones"
	OficioMantenimiento Oficio = "mantenimiento"
	OficioLimpieza      Oficio = "limpieza"
)

// Oficios lista los valores válidos.
var Oficios = []Oficio{OficioPintura, OficioJardineria, OficioReparaciones, OficioMantenimiento, OficioLimpieza}

// Valido informa si el oficio pertenece al enum.
func (o Oficio) Valido() bool { return contiene(Oficios, o) }

// EstadoSesion (EstadoSesion.schema.json).
type EstadoSesion string

const (
	EstadoCreada     EstadoSesion = "creada"
	EstadoConsentida EstadoSesion = "consentida"
	EstadoEnCurso    EstadoSesion = "en_curso"
	EstadoCerrada    EstadoSesion = "cerrada"
)

// EstadosSesion lista los valores válidos.
var EstadosSesion = []EstadoSesion{EstadoCreada, EstadoConsentida, EstadoEnCurso, EstadoCerrada}

// Valido informa si el estado pertenece al enum.
func (e EstadoSesion) Valido() bool { return contiene(EstadosSesion, e) }

// MotivoCierre (MotivoCierre.schema.json).
type MotivoCierre string

const (
	MotivoCompletada        MotivoCierre = "completada"
	MotivoClienteCerro      MotivoCierre = "cliente_cerro"
	MotivoSinVoz            MotivoCierre = "sin_voz"
	MotivoSinCamara         MotivoCierre = "sin_camara"
	MotivoSinConsentimiento MotivoCierre = "sin_consentimiento"
	MotivoDuracionMaxima    MotivoCierre = "duracion_maxima"
	MotivoCuotaAgotada      MotivoCierre = "cuota_agotada"
	MotivoDesafioInvalido   MotivoCierre = "desafio_invalido"
	MotivoErrorProveedor    MotivoCierre = "error_proveedor"
	MotivoErrorInterno      MotivoCierre = "error_interno"
)

// MotivosCierre lista los valores válidos.
var MotivosCierre = []MotivoCierre{
	MotivoCompletada, MotivoClienteCerro, MotivoSinVoz, MotivoSinCamara, MotivoSinConsentimiento,
	MotivoDuracionMaxima, MotivoCuotaAgotada, MotivoDesafioInvalido, MotivoErrorProveedor, MotivoErrorInterno,
}

// Valido informa si el motivo pertenece al enum.
func (m MotivoCierre) Valido() bool { return contiene(MotivosCierre, m) }

// ModoAvatar (ModoAvatar.schema.json).
type ModoAvatar string

const (
	ModoAvatar3D    ModoAvatar = "3d"
	ModoAvatarClips ModoAvatar = "clips"
)

// ModosAvatar lista los valores válidos.
var ModosAvatar = []ModoAvatar{ModoAvatar3D, ModoAvatarClips}

// Valido informa si el modo pertenece al enum.
func (m ModoAvatar) Valido() bool { return contiene(ModosAvatar, m) }

// Unidad (UnidadMedida.schema.json).
type Unidad string

const (
	UnidadM2      Unidad = "m2"
	UnidadML      Unidad = "ml"
	UnidadUnidad  Unidad = "unidad"
	UnidadHora    Unidad = "hora"
	UnidadJornada Unidad = "jornada"
	UnidadVisita  Unidad = "visita"
	UnidadGlobal  Unidad = "global"
)

// Unidades lista los valores válidos.
var Unidades = []Unidad{UnidadM2, UnidadML, UnidadUnidad, UnidadHora, UnidadJornada, UnidadVisita, UnidadGlobal}

// Valida informa si la unidad pertenece al enum.
func (u Unidad) Valida() bool { return contiene(Unidades, u) }

// TipoItem (ItemCotizacion.tipo).
type TipoItem string

const (
	ItemManoDeObra TipoItem = "mano_de_obra"
	ItemTraslado   TipoItem = "traslado"
	ItemRecargo    TipoItem = "recargo"
)

// TiposItem lista los valores válidos.
var TiposItem = []TipoItem{ItemManoDeObra, ItemTraslado, ItemRecargo}

// Valido informa si el tipo pertenece al enum.
func (t TipoItem) Valido() bool { return contiene(TiposItem, t) }

// Moneda (Moneda.schema.json).
type Moneda string

const (
	MonedaARS Moneda = "ARS"
	MonedaUSD Moneda = "USD"
)

// Monedas lista los valores válidos.
var Monedas = []Moneda{MonedaARS, MonedaUSD}

// Valida informa si la moneda pertenece al enum.
func (m Moneda) Valida() bool { return contiene(Monedas, m) }

// RolAsesor (PerfilAsesor.rol).
type RolAsesor string

const (
	RolAsesorBase  RolAsesor = "asesor"
	RolAdministrar RolAsesor = "administrador"
)

// RolesAsesor lista los valores válidos.
var RolesAsesor = []RolAsesor{RolAsesorBase, RolAdministrar}

// Valido informa si el rol pertenece al enum.
func (r RolAsesor) Valido() bool { return contiene(RolesAsesor, r) }

// EstadoTarifas (Cotizacion.tarifas.estado).
type EstadoTarifas string

const (
	TarifasSinValidar EstadoTarifas = "referencia_publica_sin_validar"
	TarifasValidadas  EstadoTarifas = "validada"
)

// EstadosTarifas lista los valores válidos.
var EstadosTarifas = []EstadoTarifas{TarifasSinValidar, TarifasValidadas}

// Valido informa si el estado pertenece al enum.
func (e EstadoTarifas) Valido() bool { return contiene(EstadosTarifas, e) }

func contiene[T comparable](lista []T, v T) bool {
	for _, x := range lista {
		if x == v {
			return true
		}
	}
	return false
}
