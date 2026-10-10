// Package memoria implementa almacen.Almacen en memoria, para desarrollo y
// pruebas. Imita las reglas de la base (tenant obligatorio, unicidad, claves
// foráneas, borrado en cascada) y la batería de conformidad verifica que dé
// los mismos resultados que postgres (H2 de T20). NO prueba RLS y producción
// no arranca con él (H4).
package memoria

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sort"
	"sync"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

type datosTenant struct {
	tenant          dominio.Tenant
	asesores        map[string]dominio.Asesor
	sesiones        map[string]dominio.Sesion
	consentimientos map[string]dominio.Consentimiento // por sesion_id
	cotizaciones    map[string]dominio.Cotizacion     // por sesion_id
	borrados        []almacen.Borrados
	claves          map[string]dominio.ClaveAPI    // por clave_id
	enlaces         map[string]dominio.Enlace      // por id_publico
	tokens          map[string]dominio.TokenSesion // por hash
	derivaciones    map[string]dominio.Derivacion  // por sesion_id
	// H2/H3 de T04b1: contadores y reservas; la retención y el ARCO no los
	// tocan (ADR 0004 §10).
	consumo       map[time.Time]contadorMes // por MesCuota
	consumoAsesor map[claveAsesor]contadorMes
	diario        map[time.Time]contadorMes // por DiaCuota
	reservas      map[string]reservaMem     // por sesion_id
	// 0004 (parte 2a).
	medios    map[string]tokenMedios      // por hash
	contactos map[string]dominio.Contacto // por sesion_id
	arco      []dominio.SolicitudArco
}

type tokenMedios struct {
	dominio.TokenMedios
	usadoEn, revocadoEn *time.Time
}

type contadorMes struct {
	dominio.Contador
	sesiones, cotizaciones int
}

type claveAsesor struct {
	asesorID string
	mes      time.Time
}

type reservaMem struct {
	dominio.Reserva
	liberadaEn *time.Time
	cobrados   int
}

// Almacen en memoria, seguro para uso concurrente.
type Almacen struct {
	mu      sync.Mutex
	tenants map[dominio.TenantID]*datosTenant
	cerrado bool
	// Globales (ADR 0005 §4): topes y contador mensual de todos los tenants.
	topes  dominio.TopesGlobales
	global map[time.Time]dominio.Contador
}

// TopesGlobalesIniciales son los valores provisorios de ADR 0005 §4 (los
// mismos que siembra la migración 0003).
var TopesGlobalesIniciales = dominio.TopesGlobales{SegundosMes: 30000, Simultaneas: 5}

// Nuevo crea un almacén vacío con los topes globales iniciales.
func Nuevo() *Almacen {
	return &Almacen{tenants: map[dominio.TenantID]*datosTenant{}, topes: TopesGlobalesIniciales, global: map[time.Time]dominio.Contador{}}
}

var _ almacen.Completo = (*Almacen)(nil)

func noEncontrado(que string) error {
	return errores.Envolver(errores.NoEncontrado, errors.New(que))
}

func duplicado(que string) error {
	return errores.Envolver(errores.EstadoInvalido, fmt.Errorf("%s duplicado", que))
}

// tenant devuelve los datos del tenant con el candado tomado.
func (a *Almacen) tenant(ctx context.Context, t dominio.TenantID) (*datosTenant, error) {
	if err := ctx.Err(); err != nil {
		return nil, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	if a.cerrado {
		return nil, errores.Envolver(errores.ServicioNoDisponible, errors.New("almacén cerrado"))
	}
	if err := dominio.ExigirTenant(t); err != nil {
		return nil, err
	}
	d, ok := a.tenants[t]
	if !ok {
		return nil, noEncontrado("tenant")
	}
	return d, nil
}

// Ping implementa almacen.Almacen.
func (a *Almacen) Ping(ctx context.Context) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.cerrado {
		return errores.Envolver(errores.ServicioNoDisponible, errors.New("almacén cerrado"))
	}
	return ctx.Err()
}

// Cerrar implementa almacen.Almacen.
func (a *Almacen) Cerrar() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.cerrado = true
}

// CrearTenant implementa almacen.Almacen.
func (a *Almacen) CrearTenant(ctx context.Context, t dominio.Tenant) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return errores.Envolver(errores.ServicioNoDisponible, err)
	}
	if err := t.Validar(); err != nil {
		return err
	}
	if _, ok := a.tenants[t.ID]; ok {
		return duplicado("tenant")
	}
	t.CreadoEn = dominio.Instante(t.CreadoEn)
	a.tenants[t.ID] = &datosTenant{
		tenant: t, asesores: map[string]dominio.Asesor{}, sesiones: map[string]dominio.Sesion{},
		consentimientos: map[string]dominio.Consentimiento{}, cotizaciones: map[string]dominio.Cotizacion{},
		claves: map[string]dominio.ClaveAPI{}, enlaces: map[string]dominio.Enlace{},
		tokens: map[string]dominio.TokenSesion{}, derivaciones: map[string]dominio.Derivacion{},
		consumo: map[time.Time]contadorMes{}, consumoAsesor: map[claveAsesor]contadorMes{},
		diario: map[time.Time]contadorMes{}, reservas: map[string]reservaMem{},
		medios: map[string]tokenMedios{}, contactos: map[string]dominio.Contacto{},
	}
	return nil
}

// LeerTenant implementa almacen.Almacen.
func (a *Almacen) LeerTenant(ctx context.Context, t dominio.TenantID) (dominio.Tenant, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Tenant{}, err
	}
	return d.tenant, nil
}

// CrearAsesor implementa almacen.Almacen.
func (a *Almacen) CrearAsesor(ctx context.Context, t dominio.TenantID, as dominio.Asesor) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := as.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[as.ID]; ok {
		return duplicado("asesor")
	}
	d.asesores[as.ID] = copiarAsesor(as)
	return nil
}

// LeerAsesor implementa almacen.Almacen.
func (a *Almacen) LeerAsesor(ctx context.Context, t dominio.TenantID, id string) (dominio.Asesor, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Asesor{}, err
	}
	as, ok := d.asesores[id]
	if !ok {
		return dominio.Asesor{}, noEncontrado("asesor")
	}
	return copiarAsesor(as), nil
}

// CrearSesion implementa almacen.Almacen.
func (a *Almacen) CrearSesion(ctx context.Context, t dominio.TenantID, s dominio.Sesion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := s.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[s.AsesorID]; !ok {
		return noEncontrado("asesor de la sesión")
	}
	if _, ok := d.sesiones[s.ID]; ok {
		return duplicado("sesión")
	}
	d.sesiones[s.ID] = copiarSesion(s)
	return nil
}

// LeerSesion implementa almacen.Almacen.
func (a *Almacen) LeerSesion(ctx context.Context, t dominio.TenantID, id string) (dominio.Sesion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Sesion{}, err
	}
	s, ok := d.sesiones[id]
	if !ok {
		return dominio.Sesion{}, noEncontrado("sesión")
	}
	return copiarSesion(s), nil
}

// ListarSesionesDeAsesor implementa almacen.Almacen.
func (a *Almacen) ListarSesionesDeAsesor(ctx context.Context, t dominio.TenantID, asesorID string, p almacen.Pagina) ([]dominio.Sesion, string, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return nil, "", err
	}
	desdeT, desdeID, err := almacen.DecodificarCursor(p.Despues)
	if err != nil {
		return nil, "", err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if errores.Es(err, errores.NoEncontrado) {
		return []dominio.Sesion{}, "", nil // como en postgres: tenant inexistente = lista vacía
	}
	if err != nil {
		return nil, "", err
	}
	limite := almacen.LimitePagina(p.Limite)
	todas := []dominio.Sesion{}
	for _, s := range d.sesiones {
		if s.AsesorID != asesorID {
			continue
		}
		if p.Despues != "" && !antes(s, desdeT, desdeID) {
			continue
		}
		todas = append(todas, s)
	}
	sort.Slice(todas, func(i, j int) bool { return antes(todas[j], todas[i].CreadaEn, todas[i].ID) })
	siguiente := ""
	if len(todas) > limite {
		todas = todas[:limite]
		u := todas[limite-1]
		siguiente = almacen.CodificarCursor(u.CreadaEn, u.ID)
	}
	out := make([]dominio.Sesion, len(todas))
	for i, s := range todas {
		out[i] = copiarSesion(s)
	}
	return out, siguiente, nil
}

// antes informa si s va después de (t, id) en orden descendente, es decir
// (s.CreadaEn, s.ID) < (t, id).
func antes(s dominio.Sesion, t time.Time, id string) bool {
	if !s.CreadaEn.Equal(t) {
		return s.CreadaEn.Before(t)
	}
	return s.ID < id
}

// RegistrarConsentimiento implementa almacen.Almacen.
func (a *Almacen) RegistrarConsentimiento(ctx context.Context, t dominio.TenantID, c dominio.Consentimiento, ahora time.Time) (dominio.Sesion, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.Sesion{}, err
	}
	if err := c.Validar(); err != nil {
		return dominio.Sesion{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Sesion{}, err
	}
	s, ok := d.sesiones[c.SesionID]
	if !ok {
		return dominio.Sesion{}, noEncontrado("sesión")
	}
	s = copiarSesion(s)
	if err := s.Consentir(ahora); err != nil {
		return dominio.Sesion{}, err
	}
	if _, ok := d.consentimientos[c.SesionID]; ok {
		return dominio.Sesion{}, duplicado("consentimiento")
	}
	for _, otro := range d.consentimientos {
		if otro.ID == c.ID {
			return dominio.Sesion{}, duplicado("consentimiento")
		}
	}
	c.RegistradoEn, c.BorrarDespuesDe = dominio.Instante(c.RegistradoEn), dominio.Instante(c.BorrarDespuesDe)
	d.consentimientos[c.SesionID] = c
	d.sesiones[s.ID] = s
	return copiarSesion(s), nil
}

// LeerConsentimiento implementa almacen.Almacen.
func (a *Almacen) LeerConsentimiento(ctx context.Context, t dominio.TenantID, sesionID string) (dominio.Consentimiento, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Consentimiento{}, err
	}
	c, ok := d.consentimientos[sesionID]
	if !ok {
		return dominio.Consentimiento{}, noEncontrado("consentimiento")
	}
	return c, nil
}

// CerrarSesion implementa almacen.Almacen.
func (a *Almacen) CerrarSesion(ctx context.Context, t dominio.TenantID, id string, motivo dominio.MotivoCierre, ahora time.Time) (dominio.Sesion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Sesion{}, err
	}
	s, ok := d.sesiones[id]
	if !ok {
		return dominio.Sesion{}, noEncontrado("sesión")
	}
	s = copiarSesion(s)
	if err := s.Cerrar(motivo, ahora); err != nil {
		return dominio.Sesion{}, err
	}
	d.sesiones[id] = s
	d.revocarTokensMedios(id, ahora)
	a.liberar(d, id, ahora)
	return copiarSesion(s), nil
}

// GuardarCotizacion implementa almacen.Almacen.
func (a *Almacen) GuardarCotizacion(ctx context.Context, t dominio.TenantID, c dominio.Cotizacion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := c.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.sesiones[c.SesionID]; !ok {
		return noEncontrado("sesión de la cotización")
	}
	if _, ok := d.cotizaciones[c.SesionID]; ok {
		return duplicado("cotización")
	}
	for _, otra := range d.cotizaciones {
		if otra.ID == c.ID {
			return duplicado("cotización")
		}
	}
	c = copiarCotizacion(c)
	c.EmitidaEn, c.BorrarDespuesDe = dominio.Instante(c.EmitidaEn), dominio.Instante(c.BorrarDespuesDe)
	d.cotizaciones[c.SesionID] = c
	return nil
}

// LeerCotizacionDeSesion implementa almacen.Almacen.
func (a *Almacen) LeerCotizacionDeSesion(ctx context.Context, t dominio.TenantID, sesionID string) (dominio.Cotizacion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Cotizacion{}, err
	}
	c, ok := d.cotizaciones[sesionID]
	if !ok {
		return dominio.Cotizacion{}, noEncontrado("cotización")
	}
	return copiarCotizacion(c), nil
}

// BorrarVencidos implementa almacen.Almacen: borra las sesiones vencidas con
// lo que cuelga de ellas y las cotizaciones vencidas por su cuenta.
func (a *Almacen) BorrarVencidos(ctx context.Context, t dominio.TenantID, ahora time.Time) (almacen.Borrados, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return almacen.Borrados{}, err
	}
	var b almacen.Borrados
	for sid, c := range d.cotizaciones {
		s := d.sesiones[sid]
		if !c.BorrarDespuesDe.After(ahora) || !s.BorrarDespuesDe.After(ahora) {
			b.Cotizaciones++
			b.Items += int64(len(c.Items))
			delete(d.cotizaciones, sid)
		}
	}
	for id, s := range d.sesiones {
		if s.BorrarDespuesDe.After(ahora) {
			continue
		}
		if _, ok := d.consentimientos[id]; ok {
			b.Consentimientos++
			delete(d.consentimientos, id)
		}
		// Cascada como en la base (no se cuenta en la constancia).
		b.Sesiones++
		d.borrarSesion(id)
	}
	d.borrados = append(d.borrados, b)
	return b, nil
}

// TenantsParaRetencion implementa almacen.Global.
func (a *Almacen) TenantsParaRetencion(ctx context.Context) ([]dominio.TenantID, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	out := make([]dominio.TenantID, 0, len(a.tenants))
	for id := range a.tenants {
		out = append(out, id)
	}
	slices.Sort(out)
	return out, nil
}

// RegistroBorrados devuelve las constancias de borrado de un tenant (solo
// cantidades). Solo para pruebas.
func (a *Almacen) RegistroBorrados(t dominio.TenantID) []almacen.Borrados {
	a.mu.Lock()
	defer a.mu.Unlock()
	if d, ok := a.tenants[t]; ok {
		return slices.Clone(d.borrados)
	}
	return nil
}

func copiarAsesor(a dominio.Asesor) dominio.Asesor {
	a.Oficios, a.Zonas = slices.Clone(a.Oficios), slices.Clone(a.Zonas)
	if a.SegundosMesTope != nil {
		v := *a.SegundosMesTope
		a.SegundosMesTope = &v
	}
	if a.SimultaneasTope != nil {
		v := *a.SimultaneasTope
		a.SimultaneasTope = &v
	}
	a.CreadoEn = dominio.Instante(a.CreadoEn)
	if a.BorrarDespuesDe != nil {
		t := dominio.Instante(*a.BorrarDespuesDe)
		a.BorrarDespuesDe = &t
	}
	return a
}

func copiarSesion(s dominio.Sesion) dominio.Sesion {
	s.CreadaEn, s.BorrarDespuesDe = dominio.Instante(s.CreadaEn), dominio.Instante(s.BorrarDespuesDe)
	if s.ConsentidaEn != nil {
		t := dominio.Instante(*s.ConsentidaEn)
		s.ConsentidaEn = &t
	}
	if s.CerradaEn != nil {
		t := dominio.Instante(*s.CerradaEn)
		s.CerradaEn = &t
	}
	return s
}

func copiarCotizacion(c dominio.Cotizacion) dominio.Cotizacion {
	c.Items = slices.Clone(c.Items)
	return c
}
