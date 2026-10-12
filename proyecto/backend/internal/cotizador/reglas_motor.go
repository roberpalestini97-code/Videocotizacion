package cotizador

import (
	"fmt"

	"videocotizacion/backend/internal/dominio"
)

// reglaMotor une trabajo.tipo del LLM con una tarea del tarifario.
type reglaMotor struct {
	oficio  dominio.Oficio
	evaluar func(p Pedido) (tareaID string, medidas []string, err error)
}

type reglaTrabajoArchivo struct {
	TrabajoTipo     string   `json:"trabajo_tipo"`
	OficioContrato  string   `json:"oficio_contrato"`
	Resolver        string   `json:"resolver"`
	TareaID         string   `json:"tarea_id,omitempty"`
	MedidasSumar    []string `json:"medidas_sumar,omitempty"`
	UmbralCentesimas int64   `json:"umbral_centesimas,omitempty"`
	TareaSiMenorIgual string `json:"tarea_si_menor_igual,omitempty"`
	TareaSiMayor      string `json:"tarea_si_mayor,omitempty"`
	MediosSinPrecio   []string `json:"medios_sin_precio,omitempty"`
	TareaSiMedioSinPrecio string `json:"tarea_si_medio_sin_precio,omitempty"`
	TareaDefault      string `json:"tarea_default,omitempty"`
}

type motorCotizacionArchivo struct {
	Version        string            `json:"version"`
	ReglasTrabajo  []reglaTrabajoArchivo `json:"reglas_trabajo"`
	Localidades    map[string]string `json:"localidades"`
}

var oficiosContrato = map[string]dominio.Oficio{
	"pintura":    dominio.OficioPintura,
	"jardineria": dominio.OficioJardineria,
	"limpieza":   dominio.OficioLimpieza,
	"reparaciones": dominio.OficioReparaciones,
}

func construirReglasMotor(m *motorCotizacionArchivo) (map[string]reglaMotor, map[string]dominio.Zona, error) {
	if m == nil || len(m.ReglasTrabajo) == 0 {
		return reglasMotorPorDefecto(), localidadesPorDefecto(), nil
	}
	out := make(map[string]reglaMotor, len(m.ReglasTrabajo))
	for _, ra := range m.ReglasTrabajo {
		if ra.TrabajoTipo == "" {
			return nil, nil, fmt.Errorf("motor: regla sin trabajo_tipo")
		}
		if _, dup := out[ra.TrabajoTipo]; dup {
			return nil, nil, fmt.Errorf("motor: trabajo_tipo repetido %q", ra.TrabajoTipo)
		}
		of, ok := oficiosContrato[ra.OficioContrato]
		if !ok {
			return nil, nil, fmt.Errorf("motor: oficio_contrato desconocido %q en %s", ra.OficioContrato, ra.TrabajoTipo)
		}
		eval, err := compiladorRegla(ra)
		if err != nil {
			return nil, nil, fmt.Errorf("motor: %s: %w", ra.TrabajoTipo, err)
		}
		out[ra.TrabajoTipo] = reglaMotor{oficio: of, evaluar: eval}
	}
	loc, err := localidadesDesdeArchivo(m.Localidades)
	if err != nil {
		return nil, nil, err
	}
	return out, loc, nil
}

func compiladorRegla(ra reglaTrabajoArchivo) (func(p Pedido) (string, []string, error), error) {
	medidas := ra.MedidasSumar
	switch ra.Resolver {
	case "fija":
		if ra.TareaID == "" {
			return nil, fmt.Errorf("resolver fija sin tarea_id")
		}
		id := ra.TareaID
		return func(Pedido) (string, []string, error) { return id, medidas, nil }, nil
	case "umbral_m2":
		if ra.UmbralCentesimas < 1 || ra.TareaSiMenorIgual == "" || ra.TareaSiMayor == "" {
			return nil, fmt.Errorf("resolver umbral_m2 incompleto")
		}
		umbral := ra.UmbralCentesimas
		menor, mayor := ra.TareaSiMenorIgual, ra.TareaSiMayor
		return func(p Pedido) (string, []string, error) {
			m2 := sumar(p.Medidas, medidas)
			switch {
			case m2 == 0:
				return "", medidas, ErrFaltanMedidas
			case m2 <= umbral:
				return menor, medidas, nil
			default:
				return mayor, medidas, nil
			}
		}, nil
	case "medio_altura":
		if ra.TareaDefault == "" || len(ra.MediosSinPrecio) == 0 || ra.TareaSiMedioSinPrecio == "" {
			return nil, fmt.Errorf("resolver medio_altura incompleto")
		}
		sinPrecio := map[string]bool{}
		for _, m := range ra.MediosSinPrecio {
			sinPrecio[m] = true
		}
		def, alt := ra.TareaDefault, ra.TareaSiMedioSinPrecio
		return func(p Pedido) (string, []string, error) {
			if sinPrecio[p.MedioAltura] {
				return alt, medidas, nil
			}
			return def, medidas, nil
		}, nil
	default:
		return nil, fmt.Errorf("resolver %q no soportado", ra.Resolver)
	}
}

func localidadesDesdeArchivo(m map[string]string) (map[string]dominio.Zona, error) {
	if len(m) == 0 {
		return localidadesPorDefecto(), nil
	}
	out := make(map[string]dominio.Zona, len(m))
	for slug, zona := range m {
		zd := dominio.Zona(zona)
		if !zd.Valida() {
			return nil, fmt.Errorf("motor: localidad %q → zona %q inválida", slug, zona)
		}
		out[slug] = zd
	}
	return out, nil
}

func (t *Tarifario) resolverTrabajo(p Pedido) (dominio.Oficio, string, []string, error) {
	reglas := t.reglasTrabajo
	if len(reglas) == 0 {
		reglas = reglasMotorPorDefecto()
	}
	r, ok := reglas[p.TipoTrabajo]
	if !ok {
		return "", "", nil, fmt.Errorf("%w: %s", ErrTrabajoNoCotizable, p.TipoTrabajo)
	}
	id, medidas, err := r.evaluar(p)
	return r.oficio, id, medidas, err
}

func (t *Tarifario) zonaLocalidad(slug string) (dominio.Zona, bool) {
	m := t.localidadesLLM
	if len(m) == 0 {
		m = localidadesPorDefecto()
	}
	z, ok := m[slug]
	return z, ok
}

func localidadesPorDefecto() map[string]dominio.Zona {
	return map[string]dominio.Zona{
		"mar_chiquita":        dominio.ZonaMarChiquita,
		"cobo":                dominio.ZonaCobo,
		"santa_clara_del_mar": dominio.ZonaSantaClara,
		"parque_lago":         dominio.ZonaParqueLago,
		"mar_del_plata":       dominio.ZonaOtra,
		"otra":                dominio.ZonaOtra,
	}
}

func reglasMotorPorDefecto() map[string]reglaMotor {
	// Equivalente al mapa histórico en cotizador.go (fallback si falta motor_cotizacion en JSON).
	raw := []reglaTrabajoArchivo{
		{TrabajoTipo: "pintura_interior", OficioContrato: "pintura", Resolver: "fija", TareaID: "pintura_interior_latex_2_manos", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "pintura_exterior", OficioContrato: "pintura", Resolver: "fija", TareaID: "pintura_exterior_fachada", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "pintura_fachada_altura", OficioContrato: "pintura", Resolver: "medio_altura",
			MediosSinPrecio: []string{"silleta", "hidroelevador"}, TareaSiMedioSinPrecio: "pintura_altura_edificio_balancin_soga",
			TareaDefault: "pintura_exterior_fachada", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "impermeabilizacion_techo", OficioContrato: "pintura", Resolver: "fija", TareaID: "pintura_impermeabilizacion_techo_membrana", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "pintura_rejas_aberturas", OficioContrato: "pintura", Resolver: "fija", TareaID: "pintura_rejas_portones", MedidasSumar: []string{"unidad"}},
		{TrabajoTipo: "corte_cesped", OficioContrato: "jardineria", Resolver: "umbral_m2", UmbralCentesimas: 100 * 100,
			TareaSiMenorIgual: "jardin_corte_cesped_chico_hasta_100m2", TareaSiMayor: "jardin_corte_cesped_por_m2", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "poda", OficioContrato: "jardineria", Resolver: "fija", TareaID: "jardin_poda_arbol_chico_mediano", MedidasSumar: []string{"unidad", "arbol"}},
		{TrabajoTipo: "desmalezado", OficioContrato: "jardineria", Resolver: "fija", TareaID: "jardin_desmalezado_terreno", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "mantenimiento_jardin_periodico", OficioContrato: "jardineria", Resolver: "fija", TareaID: "jardin_mantenimiento_mensual_chico"},
		{TrabajoTipo: "parquizacion", OficioContrato: "jardineria", Resolver: "fija", TareaID: "jardin_parquizacion_diseno", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "diseno_paisajismo", OficioContrato: "jardineria", Resolver: "fija", TareaID: "jardin_parquizacion_diseno", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "riego", OficioContrato: "jardineria", Resolver: "fija", TareaID: "jardin_riego_automatico_instalacion"},
		{TrabajoTipo: "limpieza_terreno", OficioContrato: "limpieza", Resolver: "fija", TareaID: "jardin_desmalezado_terreno", MedidasSumar: []string{"m2"}},
		{TrabajoTipo: "limpieza_final_obra", OficioContrato: "limpieza", Resolver: "fija", TareaID: "limp_fin_de_obra", MedidasSumar: []string{"m2"}},
	}
	out := make(map[string]reglaMotor, len(raw))
	for _, ra := range raw {
		eval, err := compiladorRegla(ra)
		if err != nil {
			panic(err)
		}
		out[ra.TrabajoTipo] = reglaMotor{oficio: oficiosContrato[ra.OficioContrato], evaluar: eval}
	}
	return out
}
