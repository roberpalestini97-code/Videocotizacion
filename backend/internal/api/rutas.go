package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"regexp"
	"time"

	"videocotizacion/backend/internal/abuso"
	"videocotizacion/backend/internal/credenciales"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

// ErrOpciones indica una configuración incompleta.
var ErrOpciones = errors.New("api: opciones incompletas")

// Registrar agrega las rutas de T04b parte 1 al mux.
func Registrar(mux *http.ServeMux, o Opciones) error {
	if o.Autenticacion == nil || o.Sesiones == nil || o.Desafios == nil || o.Reloj == nil {
		return ErrOpciones
	}
	a := &api{o: o}
	pub, sec, ses := credenciales.Publica, credenciales.Secreta, credenciales.Sesion
	for _, r := range []struct {
		patron string
		op     operacion
	}{
		{"POST /v1/widget/desafios", operacion{nombre: "emitirDesafio", tipos: []credenciales.Tipo{pub},
			tasas: []*abuso.Limitador{o.Tasas.DesafioPorIP}, atender: a.emitirDesafio}},
		{"POST /v1/sesiones", operacion{nombre: "crearSesion", tipos: []credenciales.Tipo{pub, sec}, desafio: true,
			tasas: []*abuso.Limitador{o.Tasas.CrearPorIP}, atender: a.crearSesion}},
		{"GET /v1/sesiones/{sesion_id}", operacion{nombre: "leerSesion", tipos: []credenciales.Tipo{sec, ses}, atender: a.leerSesion}},
		{"GET /v1/sesiones/{sesion_id}/cotizacion", operacion{nombre: "leerCotizacion", tipos: []credenciales.Tipo{ses, sec}, atender: a.leerCotizacion}},
		{"GET /v1/sesiones/{sesion_id}/derivacion", operacion{nombre: "leerDerivacion", tipos: []credenciales.Tipo{ses, sec}, atender: a.leerDerivacion}},
	} {
		mux.Handle(r.patron, a.envolver(r.op))
	}
	return nil
}

// fecha formatea FechaHora.schema.json (RFC 3339 en UTC, sufijo Z).
func fecha(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }

func fechaOpcional(t *time.Time) *string {
	if t == nil {
		return nil
	}
	f := fecha(*t)
	return &f
}

// ---- emitirDesafio ----

type desafioJSON struct {
	Desafio    string `json:"desafio"`
	Mecanismo  string `json:"mecanismo"`
	Dificultad int    `json:"dificultad_bits"`
	VenceEn    string `json:"vence_en"`
	VenceEnS   int    `json:"vence_en_s"`
	Provisorio bool   `json:"provisorio"`
}

func (a *api) emitirDesafio(w http.ResponseWriter, _ *http.Request, c Credencial) error {
	d, err := a.o.Desafios.Emitir(c.ClaveID, c.Origin)
	if errors.Is(err, abuso.ErrDesafiosLlenos) {
		return tasaExcedida(time.Minute)
	}
	if err != nil {
		return errores.Envolver(errores.ErrorInterno, err)
	}
	servidor.EscribirJSON(w, http.StatusCreated, desafioJSON{
		Desafio: d.Desafio, Mecanismo: abuso.Mecanismo, Dificultad: d.Dificultad,
		VenceEn: fecha(d.VenceEn), VenceEnS: d.VidaS, Provisorio: true,
	})
	return nil
}

// ---- crearSesion ----

var (
	reAvatar     = regexp.MustCompile(`^av_[a-z0-9_]{2,30}$`)
	reReferencia = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
)

// leerCuerpo exige application/json y decodifica un objeto con las claves
// EXACTAS permitidas (sin coincidencia por mayúsculas, sin campos de más: un
// tenant_id en el cuerpo es 422, R3). JSON roto → 400.
func leerCuerpo(r *http.Request, permitidas ...string) (map[string]json.RawMessage, error) {
	mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mt != "application/json" {
		return nil, errores.Nuevo(errores.TipoDeContenidoNoSoportado)
	}
	crudo, err := io.ReadAll(r.Body)
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return nil, errores.Envolver(errores.CuerpoDemasiadoGrande, err)
		}
		return nil, errores.Envolver(errores.SolicitudInvalida, err)
	}
	dec := json.NewDecoder(bytes.NewReader(crudo))
	var obj map[string]json.RawMessage
	if err := dec.Decode(&obj); err != nil {
		var tipo *json.UnmarshalTypeError
		if errors.As(err, &tipo) {
			return nil, errores.Envolver(errores.ValidacionFallida, errors.New("el cuerpo no es un objeto"))
		}
		return nil, errores.Envolver(errores.SolicitudInvalida, err)
	}
	if dec.More() {
		return nil, errores.Envolver(errores.SolicitudInvalida, errors.New("datos después del objeto JSON"))
	}
	if obj == nil {
		return nil, errores.Envolver(errores.ValidacionFallida, errors.New("el cuerpo no es un objeto"))
	}
	for k := range obj {
		ok := false
		for _, p := range permitidas {
			ok = ok || k == p
		}
		if !ok {
			return nil, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("campo no permitido %q", k))
		}
	}
	return obj, nil
}

// texto lee un campo string; ausente = "" y presente = true.
func texto(obj map[string]json.RawMessage, campo string) (string, bool, error) {
	v, ok := obj[campo]
	if !ok {
		return "", false, nil
	}
	var s string
	if err := json.Unmarshal(v, &s); err != nil {
		return "", true, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("/%s debe ser texto", campo))
	}
	return s, true, nil
}

type pedidoCrear struct {
	enlace string
	modo   dominio.ModoAvatar
}

func leerPedidoCrear(r *http.Request) (pedidoCrear, error) {
	obj, err := leerCuerpo(r, "enlace", "modo_avatar", "avatar_id", "idioma", "referencia_externa")
	if err != nil {
		return pedidoCrear{}, err
	}
	invalido := func(m string) (pedidoCrear, error) {
		return pedidoCrear{}, errores.Envolver(errores.ValidacionFallida, errors.New(m))
	}
	var p pedidoCrear
	var hay bool
	if p.enlace, hay, err = texto(obj, "enlace"); err != nil {
		return pedidoCrear{}, err
	} else if !hay || !dominio.IDPublicoValido(p.enlace) {
		return invalido("/enlace requerido con el formato del contrato")
	}
	modo, hay, err := texto(obj, "modo_avatar")
	if err != nil {
		return pedidoCrear{}, err
	}
	if p.modo = dominio.ModoAvatar(modo); !hay || !p.modo.Valido() {
		return invalido("/modo_avatar requerido: 3d o clips")
	}
	if v, hay, err := texto(obj, "avatar_id"); err != nil {
		return pedidoCrear{}, err
	} else if hay && !reAvatar.MatchString(v) {
		return invalido("/avatar_id con formato inválido")
	}
	if v, hay, err := texto(obj, "idioma"); err != nil {
		return pedidoCrear{}, err
	} else if hay && v != "es-AR" {
		return invalido("/idioma solo es-AR")
	}
	if v, hay, err := texto(obj, "referencia_externa"); err != nil {
		return pedidoCrear{}, err
	} else if hay && !reReferencia.MatchString(v) {
		return invalido("/referencia_externa con formato inválido")
	}
	return p, nil
}

type fotogramaJSON struct {
	Formato        string `json:"formato"`
	LadoMaxPx      int    `json:"lado_max_px"`
	BytesMax       int    `json:"bytes_max"`
	IntervaloMinMs int    `json:"intervalo_min_ms"`
	MaxPorSesion   int    `json:"max_por_sesion"`
}

type sesionCreadaJSON struct {
	SesionID string `json:"sesion_id"`
	Estado   string `json:"estado"`
	Token    struct {
		Valor   string `json:"valor"`
		VenceEn string `json:"vence_en"`
	} `json:"token_sesion"`
	Consentimiento struct {
		Requerido    bool   `json:"requerido"`
		AvisoVersion string `json:"aviso_version"`
		AvisoURL     string `json:"aviso_url"`
	} `json:"consentimiento"`
	Limites struct {
		SinVozS               int           `json:"sin_voz_s"`
		DuracionMaximaS       int           `json:"duracion_maxima_s"`
		CaracteresMaxPorTurno int           `json:"caracteres_max_por_turno"`
		TurnosLLMMax          int           `json:"turnos_llm_max"`
		Fotograma             fotogramaJSON `json:"fotograma"`
	} `json:"limites"`
	CreadaEn string `json:"creada_en"`
}

func (a *api) crearSesion(w http.ResponseWriter, r *http.Request, c Credencial) error {
	// 8. Cuerpo.
	p, err := leerPedidoCrear(r)
	if err != nil {
		return err
	}
	// R58: también por enlace opaco (necesita el cuerpo).
	if err := permitir(a.o.Tasas.CrearPorEnlace, string(c.Tenant)+"|"+p.enlace); err != nil {
		return err
	}
	// 10–12 y creación: enlace del tenant de la credencial, cupo, sesión.
	creada, err := a.o.Sesiones.CrearSesion(r.Context(), c.Tenant, p.enlace, p.modo)
	if err != nil {
		return err
	}
	o := a.o.Sesiones.Opciones()
	var out sesionCreadaJSON
	out.SesionID, out.Estado, out.CreadaEn = creada.Sesion.ID, string(creada.Sesion.Estado), fecha(creada.Sesion.CreadaEn)
	out.Token.Valor, out.Token.VenceEn = creada.Token, fecha(creada.TokenVenceEn)
	out.Consentimiento.Requerido, out.Consentimiento.AvisoVersion, out.Consentimiento.AvisoURL = true, o.AvisoVersion, o.AvisoURL
	l := o.Limites
	out.Limites.SinVozS, out.Limites.DuracionMaximaS = l.SinVozS, l.DuracionMaximaS
	out.Limites.CaracteresMaxPorTurno, out.Limites.TurnosLLMMax = l.CaracteresMaxPorTurno, l.TurnosLLMMax
	out.Limites.Fotograma = fotogramaJSON{Formato: "image/jpeg", LadoMaxPx: l.Fotograma.LadoMaxPx, BytesMax: l.Fotograma.BytesMax,
		IntervaloMinMs: l.Fotograma.IntervaloMinMs, MaxPorSesion: l.Fotograma.MaxPorSesion}
	servidor.EscribirJSON(w, http.StatusCreated, out)
	return nil
}

// ---- lecturas por sesión ----

// sesionDe aplica el paso 10 para el token de sesión: solo su propia sesión;
// cualquier otra, el mismo 404 (R5, R64).
func sesionDe(r *http.Request, c Credencial) (string, error) {
	id := r.PathValue("sesion_id")
	if c.Tipo == credenciales.Sesion && id != c.SesionID {
		return "", errores.Envolver(errores.NoEncontrado, errors.New("token de otra sesión"))
	}
	return id, nil
}

type sesionJSON struct {
	SesionID     string  `json:"sesion_id"`
	Estado       string  `json:"estado"`
	ModoAvatar   string  `json:"modo_avatar"`
	CreadaEn     string  `json:"creada_en"`
	ConsentidaEn *string `json:"consentida_en,omitempty"`
	CerradaEn    *string `json:"cerrada_en,omitempty"`
	MotivoCierre string  `json:"motivo_cierre,omitempty"`
	DuracionS    int     `json:"duracion_s"`
	CotizacionID string  `json:"cotizacion_id,omitempty"`
}

func (a *api) leerSesion(w http.ResponseWriter, r *http.Request, c Credencial) error {
	id, err := sesionDe(r, c)
	if err != nil {
		return err
	}
	s, cotID, err := a.o.Sesiones.LeerSesion(r.Context(), c.Tenant, id)
	if err != nil {
		return err
	}
	servidor.EscribirJSON(w, http.StatusOK, sesionJSON{
		SesionID: s.ID, Estado: string(s.Estado), ModoAvatar: string(s.ModoAvatar), CreadaEn: fecha(s.CreadaEn),
		ConsentidaEn: fechaOpcional(s.ConsentidaEn), CerradaEn: fechaOpcional(s.CerradaEn),
		MotivoCierre: string(s.MotivoCierre), DuracionS: s.DuracionS, CotizacionID: cotID,
	})
	return nil
}

type itemJSON struct {
	Tipo               string `json:"tipo"`
	CodigoTarea        string `json:"codigo_tarea"`
	Descripcion        string `json:"descripcion"`
	Unidad             string `json:"unidad"`
	CantidadCentesimas int64  `json:"cantidad_centesimas"`
	PrecioUnitario     int64  `json:"precio_unitario_centavos"`
	Importe            int64  `json:"importe_centavos"`
}

type cotizacionJSON struct {
	CotizacionID string     `json:"cotizacion_id"`
	SesionID     string     `json:"sesion_id"`
	EmitidaEn    string     `json:"emitida_en"`
	Moneda       string     `json:"moneda"`
	Oficio       string     `json:"oficio"`
	Zona         string     `json:"zona"`
	FueraDeZona  bool       `json:"fuera_de_zona"`
	Items        []itemJSON `json:"items"`
	Total        int64      `json:"total_centavos"`
	Orientativa  bool       `json:"orientativa"`
	Leyenda      string     `json:"leyenda"`
	Tarifas      struct {
		Version string `json:"version"`
		Estado  string `json:"estado"`
	} `json:"tarifas"`
	ValidezDias int `json:"validez_dias"`
}

// CotizacionAContrato proyecta el presupuesto (rangos min/max del tarifario)
// al contrato, que tiene un único precio: se publica el MÁXIMO del rango
// (decisión provisoria de go, hueco B1 en T04b1-huecos-del-contrato.md). El
// importe y el total son los máximos que ya calculó Go con la regla del
// contrato; nada sale del LLM.
func CotizacionAContrato(c dominio.Cotizacion) any {
	out := cotizacionJSON{
		CotizacionID: c.ID, SesionID: c.SesionID, EmitidaEn: fecha(c.EmitidaEn), Moneda: string(c.Moneda),
		Oficio: string(c.Oficio), Zona: string(c.Zona), FueraDeZona: c.FueraDeZona, Total: int64(c.TotalMaxCentavos),
		Orientativa: true, Leyenda: c.Leyenda, ValidezDias: c.ValidezDias,
	}
	out.Tarifas.Version, out.Tarifas.Estado = c.Tarifas.Version, string(c.Tarifas.Estado)
	for _, it := range c.Items {
		out.Items = append(out.Items, itemJSON{
			Tipo: string(it.Tipo), CodigoTarea: it.CodigoTarea, Descripcion: it.Descripcion, Unidad: string(it.Unidad),
			CantidadCentesimas: it.CantidadCentesimas, PrecioUnitario: int64(it.PrecioUnitarioMaxCentavos),
			Importe: int64(it.ImporteMaxCentavos),
		})
	}
	return out
}

func (a *api) leerCotizacion(w http.ResponseWriter, r *http.Request, c Credencial) error {
	id, err := sesionDe(r, c)
	if err != nil {
		return err
	}
	cot, err := a.o.Sesiones.LeerCotizacion(r.Context(), c.Tenant, id)
	if err != nil {
		return err
	}
	servidor.EscribirJSON(w, http.StatusOK, CotizacionAContrato(cot))
	return nil
}

type derivacionJSON struct {
	CodigoReferencia string `json:"codigo_referencia"`
	URL              string `json:"url_wa_me"`
	Texto            string `json:"texto_prellenado"`
	GeneradaEn       string `json:"generada_en"`
}

func (a *api) leerDerivacion(w http.ResponseWriter, r *http.Request, c Credencial) error {
	id, err := sesionDe(r, c)
	if err != nil {
		return err
	}
	d, err := a.o.Sesiones.LeerDerivacion(r.Context(), c.Tenant, id)
	if err != nil {
		return err
	}
	servidor.EscribirJSON(w, http.StatusOK, derivacionJSON{
		CodigoReferencia: d.CodigoReferencia, URL: d.URL, Texto: d.Texto, GeneradaEn: fecha(d.GeneradaEn),
	})
	return nil
}
