package cotizador

import (
	"errors"
	"fmt"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// Motivos por los que Go decide NO emitir precio (todos se informan como
// cotizacion_no_emitida; el orquestador de T25 deriva al profesional).
var (
	ErrSinTarifa          = errors.New("la tarea no tiene precio en el tarifario")
	ErrTrabajoNoCotizable = errors.New("el trabajo no tiene tarea de tarifario asociada")
	ErrFaltanMedidas      = errors.New("faltan medidas con una unidad que sirva para la tarea")
	ErrFaltaZona          = errors.New("falta la localidad del trabajo")
)

// Medida es una cantidad ya normalizada a centésimas (12,5 m² = 1250).
type Medida struct {
	CantidadCentesimas int64
	Unidad             string // unidad del esquema de salida del LLM
}

// Pedido son los datos extraídos que necesita el cálculo. No hay montos.
type Pedido struct {
	TipoTrabajo          string // trabajo.tipo del esquema LLM
	Medidas              []Medida
	AlturaMaxCentimetros *int64 // altura.metros_max × 100
	MedioAltura          string // altura.medio
	Localidad            string // zona.localidad del esquema LLM
}

// Opciones del cotizador.
type Opciones struct {
	ValidezDias int // validez del presupuesto (1..90)
}

// Cotizador calcula presupuestos con un tarifario fijo.
type Cotizador struct {
	tarifario *Tarifario
	opciones  Opciones
}

// Nuevo crea un cotizador.
func Nuevo(t *Tarifario, o Opciones) (*Cotizador, error) {
	if t == nil {
		return nil, fmt.Errorf("cotizador: tarifario nil")
	}
	if o.ValidezDias < 1 || o.ValidezDias > 90 {
		return nil, fmt.Errorf("cotizador: validez_dias fuera de 1..90")
	}
	return &Cotizador{tarifario: t, opciones: o}, nil
}

// Leyendas fijas (las arma Go, no el LLM).
const (
	LeyendaEnZona    = "Presupuesto orientativo: el profesional lo confirma al ver el trabajo."
	LeyendaFueraZona = "Presupuesto orientativo fuera de zona: el profesional confirma traslado y precio final."
)

// localidades: zona.localidad del LLM → Zona del contrato. mar_del_plata y
// otra quedan fuera de zona y SE EMITEN marcadas (corrección de T24).
var localidades = map[string]dominio.Zona{
	"mar_chiquita":        dominio.ZonaMarChiquita,
	"cobo":                dominio.ZonaCobo,
	"santa_clara_del_mar": dominio.ZonaSantaClara,
	"parque_lago":         dominio.ZonaParqueLago,
	"mar_del_plata":       dominio.ZonaOtra,
	"otra":                dominio.ZonaOtra,
}

// unidadesContrato: unidad del tarifario → UnidadMedida del contrato.
// "mes" y "m2_mes" no existen en el contrato: esas tareas no se cotizan solas.
var unidadesContrato = map[string]dominio.Unidad{
	"m2": dominio.UnidadM2, "ml": dominio.UnidadML, "unidad": dominio.UnidadUnidad,
	"visita": dominio.UnidadVisita, "trabajo": dominio.UnidadGlobal,
	"jornal": dominio.UnidadJornada, "hora": dominio.UnidadHora,
}

// regla asocia un trabajo.tipo del LLM con una tarea del tarifario.
// Tabla provisoria para el tarifario 0.1.0; la valida cot (T26).
type regla struct {
	oficio  dominio.Oficio
	tarea   func(p Pedido) (string, error)
	medidas []string // unidades del LLM que suman la cantidad (si la tarea es por m2/ml/unidad)
}

func fija(id string) func(Pedido) (string, error) {
	return func(Pedido) (string, error) { return id, nil }
}

var reglas = map[string]regla{
	"pintura_interior": {dominio.OficioPintura, fija("pintura_interior_latex_2_manos"), []string{"m2"}},
	"pintura_exterior": {dominio.OficioPintura, fija("pintura_exterior_fachada"), []string{"m2"}},
	// Con silleta o hidroelevador es trabajo en altura de edificio: sin precio público.
	"pintura_fachada_altura": {dominio.OficioPintura, func(p Pedido) (string, error) {
		if p.MedioAltura == "silleta" || p.MedioAltura == "hidroelevador" {
			return "pintura_altura_edificio_balancin_soga", nil
		}
		return "pintura_exterior_fachada", nil
	}, []string{"m2"}},
	"impermeabilizacion_techo": {dominio.OficioPintura, fija("pintura_impermeabilizacion_techo_membrana"), []string{"m2"}},
	"pintura_rejas_aberturas":  {dominio.OficioPintura, fija("pintura_rejas_portones"), []string{"unidad"}},
	"corte_cesped": {dominio.OficioJardineria, func(p Pedido) (string, error) {
		m2 := sumar(p.Medidas, []string{"m2"})
		switch {
		case m2 == 0:
			return "", ErrFaltanMedidas
		case m2 <= 100*100:
			return "jardin_corte_cesped_chico_hasta_100m2", nil
		default:
			return "jardin_corte_cesped_por_m2", nil
		}
	}, []string{"m2"}},
	"poda":                           {dominio.OficioJardineria, fija("jardin_poda_arbol_chico_mediano"), []string{"unidad", "arbol"}},
	"desmalezado":                    {dominio.OficioJardineria, fija("jardin_desmalezado_terreno"), []string{"m2"}},
	"mantenimiento_jardin_periodico": {dominio.OficioJardineria, fija("jardin_mantenimiento_mensual_chico"), nil},
	"parquizacion":                   {dominio.OficioJardineria, fija("jardin_parquizacion_diseno"), []string{"m2"}},
	"diseno_paisajismo":              {dominio.OficioJardineria, fija("jardin_parquizacion_diseno"), []string{"m2"}},
	"riego":                          {dominio.OficioJardineria, fija("jardin_riego_automatico_instalacion"), nil},
	"limpieza_terreno":               {dominio.OficioLimpieza, fija("jardin_desmalezado_terreno"), []string{"m2"}},
	"limpieza_final_obra":            {dominio.OficioLimpieza, fija("limp_fin_de_obra"), []string{"m2"}},
}

// Cotizar calcula la cotización de una sesión. Devuelve cotizacion_no_emitida
// (con causa ErrSinTarifa, ErrFaltanMedidas, ...) cuando Go no puede dar precio.
func (c *Cotizador) Cotizar(s dominio.Sesion, p Pedido, ahora time.Time) (dominio.Cotizacion, error) {
	zona, ok := localidades[p.Localidad]
	if !ok {
		return dominio.Cotizacion{}, noEmitida(ErrFaltaZona)
	}
	r, ok := reglas[p.TipoTrabajo]
	if !ok {
		return dominio.Cotizacion{}, noEmitida(fmt.Errorf("%w: %s", ErrTrabajoNoCotizable, p.TipoTrabajo))
	}
	idTarea, err := r.tarea(p)
	if err != nil {
		return dominio.Cotizacion{}, noEmitida(err)
	}
	tarea, ok := c.tarifario.Tarea(idTarea)
	if !ok {
		return dominio.Cotizacion{}, noEmitida(fmt.Errorf("%w: %s no está en el tarifario", ErrTrabajoNoCotizable, idTarea))
	}
	unidad, unidadOK := unidadesContrato[tarea.Unidad]
	if tarea.Precio == nil || !unidadOK {
		return dominio.Cotizacion{}, noEmitida(fmt.Errorf("%w: %s", ErrSinTarifa, idTarea))
	}
	cantidad := int64(100) // 1,00 para tareas por visita o por trabajo
	if unidad == dominio.UnidadM2 || unidad == dominio.UnidadML || unidad == dominio.UnidadUnidad {
		cantidad = sumar(p.Medidas, r.medidas)
	}
	if cantidad < 1 || cantidad > dominio.MaxCantidadCentesimas {
		return dominio.Cotizacion{}, noEmitida(ErrFaltanMedidas)
	}
	base, err := item(dominio.ItemManoDeObra, tarea.ID, tarea.Descripcion, unidad, cantidad, *tarea.Precio)
	if err != nil {
		return dominio.Cotizacion{}, err
	}
	items := []dominio.ItemCotizacion{base}
	recargos, err := c.recargos(tarea.ID, p, base)
	if err != nil {
		return dominio.Cotizacion{}, err
	}
	items = append(items, recargos...)
	return c.armar(s, r.oficio, zona, items, ahora)
}

// recargos aplica los factores con valor cuya condición Go sabe evaluar. Hoy
// solo "altura_mas_de_2_60m"; los factores en null del tarifario no se aplican.
func (c *Cotizador) recargos(tarea string, p Pedido, base dominio.ItemCotizacion) ([]dominio.ItemCotizacion, error) {
	var out []dominio.ItemCotizacion
	for _, f := range c.tarifario.factores {
		if f.MinBps == nil || !f.aplica(tarea) {
			continue
		}
		if f.ID != "altura_mas_de_2_60m" || p.AlturaMaxCentimetros == nil || *p.AlturaMaxCentimetros <= 260 {
			continue
		}
		rmin, err := dominio.RecargoBps(base.ImporteMinCentavos, *f.MinBps)
		if err != nil {
			return nil, err
		}
		rmax, err := dominio.RecargoBps(base.ImporteMaxCentavos, *f.MaxBps)
		if err != nil {
			return nil, err
		}
		it, err := item(dominio.ItemRecargo, f.ID, "Recargo por trabajo a más de 2,60 m de altura", dominio.UnidadGlobal, 100, Rango{Min: rmin, Max: rmax})
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, nil
}

func (c *Cotizador) armar(s dominio.Sesion, oficio dominio.Oficio, zona dominio.Zona, items []dominio.ItemCotizacion, ahora time.Time) (dominio.Cotizacion, error) {
	id, err := dominio.NuevoIDCotizacion()
	if err != nil {
		return dominio.Cotizacion{}, err
	}
	mins := make([]dominio.Centavos, len(items))
	maxs := make([]dominio.Centavos, len(items))
	for i, it := range items {
		mins[i], maxs[i] = it.ImporteMinCentavos, it.ImporteMaxCentavos
	}
	tmin, err := dominio.Sumar(mins...)
	if err != nil {
		return dominio.Cotizacion{}, err
	}
	tmax, err := dominio.Sumar(maxs...)
	if err != nil {
		return dominio.Cotizacion{}, err
	}
	fuera := zona == dominio.ZonaOtra
	leyenda := LeyendaEnZona
	if fuera {
		leyenda = LeyendaFueraZona
	}
	cot := dominio.Cotizacion{
		ID: id, SesionID: s.ID, EmitidaEn: dominio.Instante(ahora), Moneda: c.tarifario.Moneda,
		Oficio: oficio, Zona: zona, FueraDeZona: fuera, Items: items,
		TotalMinCentavos: tmin, TotalMaxCentavos: tmax,
		Tarifas:     dominio.Tarifas{Version: c.tarifario.Version, Estado: c.tarifario.Estado},
		ValidezDias: c.opciones.ValidezDias, Leyenda: leyenda, BorrarDespuesDe: s.BorrarDespuesDe,
	}
	return cot, cot.Validar()
}

func item(tipo dominio.TipoItem, codigo, desc string, u dominio.Unidad, cant int64, precio Rango) (dominio.ItemCotizacion, error) {
	imin, err := dominio.ImporteItem(cant, precio.Min)
	if err != nil {
		return dominio.ItemCotizacion{}, err
	}
	imax, err := dominio.ImporteItem(cant, precio.Max)
	if err != nil {
		return dominio.ItemCotizacion{}, err
	}
	return dominio.ItemCotizacion{
		Tipo: tipo, CodigoTarea: codigo, Descripcion: desc, Unidad: u, CantidadCentesimas: cant,
		PrecioUnitarioMinCentavos: precio.Min, PrecioUnitarioMaxCentavos: precio.Max,
		ImporteMinCentavos: imin, ImporteMaxCentavos: imax,
	}, nil
}

// sumar suma las cantidades de las medidas con alguna de las unidades dadas.
// Satura en MaxCantidadCentesimas+1 para que el llamador lo rechace.
func sumar(ms []Medida, unidades []string) int64 {
	var total int64
	for _, m := range ms {
		for _, u := range unidades {
			if m.Unidad == u && m.CantidadCentesimas > 0 {
				total += m.CantidadCentesimas
				if total > dominio.MaxCantidadCentesimas {
					return dominio.MaxCantidadCentesimas + 1
				}
			}
		}
	}
	return total
}

func noEmitida(causa error) error { return errores.Envolver(errores.CotizacionNoEmitida, causa) }
