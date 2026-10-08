// Package errores implementa el catálogo único de errores del contrato
// (contracts/catalogo-errores.json, corrección H5 de T20).
//
// Cada error del backend que llega al cliente lleva un Codigo del catálogo; el
// título, el estado HTTP y el mensaje salen del JSON embebido, nunca del error
// interno. La causa interna se conserva (Unwrap) solo para los logs.
package errores

import (
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
)

// Codigo es un código estable del catálogo del contrato.
type Codigo string

// Códigos del catálogo 0.1.4-borrador. La prueba TestCodigosIgualAlCatalogo
// falla si esta lista y el JSON del contrato divergen.
const (
	SolicitudInvalida          Codigo = "solicitud_invalida"
	ValidacionFallida          Codigo = "validacion_fallida"
	CuerpoDemasiadoGrande      Codigo = "cuerpo_demasiado_grande"
	TipoDeContenidoNoSoportado Codigo = "tipo_de_contenido_no_soportado"
	CredencialAusente          Codigo = "credencial_ausente"
	CredencialInvalida         Codigo = "credencial_invalida"
	CredencialesIncorrectas    Codigo = "credenciales_incorrectas"
	TotpInvalido               Codigo = "totp_invalido"
	SesionVencida              Codigo = "sesion_vencida"
	ReautenticacionRequerida   Codigo = "reautenticacion_requerida"
	OrigenNoPermitido          Codigo = "origen_no_permitido"
	DesafioInvalido            Codigo = "desafio_invalido"
	ClaveSecretaDesdeNavegador Codigo = "clave_secreta_desde_navegador"
	AlcanceInsuficiente        Codigo = "alcance_insuficiente"
	CsrfInvalido               Codigo = "csrf_invalido"
	NoEncontrado               Codigo = "no_encontrado"
	VersionRetirada            Codigo = "version_retirada"
	EstadoInvalido             Codigo = "estado_invalido"
	ConsentimientoRequerido    Codigo = "consentimiento_requerido"
	SesionCerrada              Codigo = "sesion_cerrada"
	CotizacionNoEmitida        Codigo = "cotizacion_no_emitida"
	ContactoYaRegistrado       Codigo = "contacto_ya_registrado"
	LimiteDeTasa               Codigo = "limite_de_tasa"
	CuotaAgotada               Codigo = "cuota_agotada"
	SimultaneasAgotadas        Codigo = "simultaneas_agotadas"
	IntentosExcedidos          Codigo = "intentos_excedidos"
	LimiteLecturasContacto     Codigo = "limite_lecturas_contacto"
	ErrorInterno               Codigo = "error_interno"
	ProveedorNoDisponible      Codigo = "proveedor_no_disponible"
	ServicioNoDisponible       Codigo = "servicio_no_disponible"
)

// Todos devuelve los códigos declarados en Go, ordenados.
func Todos() []Codigo {
	c := []Codigo{
		SolicitudInvalida, ValidacionFallida, CuerpoDemasiadoGrande, TipoDeContenidoNoSoportado,
		CredencialAusente, CredencialInvalida, CredencialesIncorrectas, TotpInvalido, SesionVencida,
		ReautenticacionRequerida, OrigenNoPermitido, DesafioInvalido, ClaveSecretaDesdeNavegador,
		AlcanceInsuficiente, CsrfInvalido, NoEncontrado, VersionRetirada, EstadoInvalido,
		ConsentimientoRequerido, SesionCerrada, CotizacionNoEmitida, ContactoYaRegistrado,
		LimiteDeTasa, CuotaAgotada, SimultaneasAgotadas, IntentosExcedidos, LimiteLecturasContacto,
		ErrorInterno, ProveedorNoDisponible, ServicioNoDisponible,
	}
	sort.Slice(c, func(i, j int) bool { return c[i] < c[j] })
	return c
}

//go:embed catalogo-errores.json
var catalogoJSON []byte

// Entrada es una fila del catálogo.
type Entrada struct {
	HTTP    int    `json:"http"`
	Titulo  string `json:"titulo"`
	Mensaje string `json:"mensaje"`
}

type catalogo struct {
	Version string             `json:"version"`
	Errores map[Codigo]Entrada `json:"errores"`
}

var cat = mustCargar(catalogoJSON)

func mustCargar(b []byte) catalogo {
	var c catalogo
	if err := json.Unmarshal(b, &c); err != nil {
		panic(fmt.Sprintf("catálogo de errores embebido inválido: %v", err))
	}
	for _, k := range Todos() {
		if _, ok := c.Errores[k]; !ok {
			panic(fmt.Sprintf("catálogo de errores: falta el código %q", k))
		}
	}
	return c
}

// VersionCatalogo es la versión del contrato de la que salió el catálogo.
func VersionCatalogo() string { return cat.Version }

// CodigosCatalogo devuelve los códigos presentes en el JSON embebido, ordenados.
func CodigosCatalogo() []Codigo {
	out := make([]Codigo, 0, len(cat.Errores))
	for k := range cat.Errores {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// Buscar devuelve la entrada del catálogo; si el código no existe devuelve la
// de error_interno (nunca se inventa un estado HTTP).
func Buscar(c Codigo) Entrada {
	if e, ok := cat.Errores[c]; ok {
		return e
	}
	return cat.Errores[ErrorInterno]
}

// Error es un error con código del catálogo y causa interna opcional.
// Error() no incluye la causa para que no se filtre al cliente por descuido;
// la causa se obtiene con Unwrap o con Detalle (solo para logs).
type Error struct {
	Codigo Codigo
	causa  error
}

// Nuevo crea un error del catálogo sin causa.
func Nuevo(c Codigo) *Error { return &Error{Codigo: c} }

// Envolver crea un error del catálogo con causa interna.
func Envolver(c Codigo, causa error) *Error { return &Error{Codigo: c, causa: causa} }

func (e *Error) Error() string { return string(e.Codigo) }

// Unwrap expone la causa para errors.Is / errors.As.
func (e *Error) Unwrap() error { return e.causa }

// Is permite comparar con errors.Is(err, errores.Nuevo(c)).
func (e *Error) Is(objetivo error) bool {
	var o *Error
	if errors.As(objetivo, &o) {
		return o.Codigo == e.Codigo && o.causa == nil
	}
	return false
}

// Detalle devuelve código y causa: SOLO para logs internos.
func (e *Error) Detalle() string {
	if e.causa == nil {
		return string(e.Codigo)
	}
	return fmt.Sprintf("%s: %v", e.Codigo, e.causa)
}

// CodigoDe extrae el código del catálogo de cualquier error; los errores sin
// código se tratan como error_interno (fallar cerrado).
func CodigoDe(err error) Codigo {
	if err == nil {
		return ""
	}
	var e *Error
	if errors.As(err, &e) {
		return e.Codigo
	}
	return ErrorInterno
}

// Es informa si err lleva el código c.
func Es(err error, c Codigo) bool { return err != nil && CodigoDe(err) == c }

// BaseTipo es el prefijo del campo "type" de los problemas RFC 9457.
const BaseTipo = "https://videocotizacion.local/errores/"

// ErrorCampo corresponde a contracts/schemas/ErrorCampo.schema.json.
type ErrorCampo struct {
	Campo    string `json:"campo"`
	Problema string `json:"problema"`
}

// Problema corresponde a contracts/schemas/Error.schema.json.
type Problema struct {
	Type          string       `json:"type"`
	Title         string       `json:"title"`
	Status        int          `json:"status"`
	Codigo        Codigo       `json:"codigo"`
	Detail        string       `json:"detail,omitempty"`
	IDTraza       string       `json:"id_traza"`
	Errores       []ErrorCampo `json:"errores,omitempty"`
	ReintentarEnS int          `json:"reintentar_en_s,omitempty"`
}

// ProblemaDe arma el cuerpo de error público: solo textos del catálogo, nunca
// el mensaje de la causa interna (R31).
func ProblemaDe(err error, idTraza string) Problema {
	c := CodigoDe(err)
	if c == "" {
		c = ErrorInterno
	}
	if _, ok := cat.Errores[c]; !ok {
		c = ErrorInterno
	}
	e := cat.Errores[c]
	return Problema{
		Type:    BaseTipo + string(c),
		Title:   e.Titulo,
		Status:  e.HTTP,
		Codigo:  c,
		Detail:  e.Mensaje,
		IDTraza: idTraza,
	}
}

// NuevoIDTraza genera "tr_" + 16 hex aleatorios (patrón del contrato).
func NuevoIDTraza() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand no falla en Linux moderno; si falla, se usa un valor fijo
		// reconocible en lugar de entrar en pánico en la ruta de error.
		return "tr_0000000000000000"
	}
	return "tr_" + hex.EncodeToString(b[:])
}
