package memoria

import (
	"bytes"
	"context"
	"slices"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

func (a *Almacen) hashUsado(h []byte) bool {
	for _, d := range a.tenants {
		for _, c := range d.claves {
			if bytes.Equal(c.Hash, h) {
				return true
			}
		}
		if _, ok := d.tokens[string(h)]; ok {
			return true
		}
	}
	return false
}

// CrearClaveAPI implementa almacen.Credenciales.
func (a *Almacen) CrearClaveAPI(ctx context.Context, t dominio.TenantID, c dominio.ClaveAPI) error {
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
	if _, ok := d.claves[c.ID]; ok || a.hashUsado(c.Hash) {
		return duplicado("clave")
	}
	c.Hash, c.Origenes = bytes.Clone(c.Hash), slices.Clone(c.Origenes)
	c.CreadaEn = dominio.Instante(c.CreadaEn)
	d.claves[c.ID] = c
	return nil
}

// RevocarClaveAPI implementa almacen.Credenciales (idempotente).
func (a *Almacen) RevocarClaveAPI(ctx context.Context, t dominio.TenantID, id string, ahora time.Time) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	c, ok := d.claves[id]
	if !ok {
		return noEncontrado("clave")
	}
	if c.RevocadaEn == nil {
		r := dominio.Instante(ahora)
		c.RevocadaEn = &r
		d.claves[id] = c
	}
	return nil
}

// CrearEnlace implementa almacen.Credenciales.
func (a *Almacen) CrearEnlace(ctx context.Context, t dominio.TenantID, e dominio.Enlace) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := e.Validar(); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.asesores[e.AsesorID]; !ok {
		return noEncontrado("asesor del enlace")
	}
	if _, ok := d.enlaces[e.IDPublico]; ok {
		return duplicado("enlace")
	}
	e.CreadoEn = dominio.Instante(e.CreadoEn)
	d.enlaces[e.IDPublico] = e
	return nil
}

// LeerEnlace implementa almacen.Credenciales.
func (a *Almacen) LeerEnlace(ctx context.Context, t dominio.TenantID, id string) (dominio.Enlace, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Enlace{}, err
	}
	e, ok := d.enlaces[id]
	if !ok {
		return dominio.Enlace{}, noEncontrado("enlace")
	}
	return e, nil
}

// CrearSesionConToken implementa almacen.Credenciales (todo o nada).
func (a *Almacen) CrearSesionConToken(ctx context.Context, t dominio.TenantID, s dominio.Sesion, tok dominio.TokenSesion) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if err := s.Validar(); err != nil {
		return err
	}
	if err := tok.Validar(); err != nil {
		return err
	}
	if tok.SesionID != s.ID {
		return errores.Nuevo(errores.ValidacionFallida)
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
	if _, ok := d.sesiones[s.ID]; ok || a.hashUsado(tok.Hash) {
		return duplicado("sesión o token")
	}
	d.sesiones[s.ID] = copiarSesion(s)
	tok.Hash = bytes.Clone(tok.Hash)
	tok.EmitidoEn, tok.VenceEn = dominio.Instante(tok.EmitidoEn), dominio.Instante(tok.VenceEn)
	d.tokens[string(tok.Hash)] = tok
	return nil
}

// RevocarTokensDeSesion implementa almacen.Credenciales.
func (a *Almacen) RevocarTokensDeSesion(ctx context.Context, t dominio.TenantID, sesionID string, ahora time.Time) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return err
	}
	if _, ok := d.sesiones[sesionID]; !ok {
		return noEncontrado("sesión")
	}
	r := dominio.Instante(ahora)
	for h, tok := range d.tokens {
		if tok.SesionID == sesionID && tok.RevocadoEn == nil {
			tok.RevocadoEn = &r
			d.tokens[h] = tok
		}
	}
	return nil
}

// activas cuenta las reservas vigentes (sin liberar y sin vencer).
func (d *datosTenant) activas(ahora time.Time, asesorID string) (tenant, asesor int) {
	for _, r := range d.reservas {
		if r.liberadaEn == nil && r.VenceEn.After(ahora) {
			tenant++
			if r.AsesorID == asesorID {
				asesor++
			}
		}
	}
	return tenant, asesor
}

// Cupo implementa almacen.Credenciales.
func (a *Almacen) Cupo(ctx context.Context, t dominio.TenantID, asesorID string, mes, ahora time.Time) (dominio.EstadoCupo, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.EstadoCupo{}, err
	}
	as, ok := d.asesores[asesorID]
	if !ok {
		return dominio.EstadoCupo{}, noEncontrado("asesor")
	}
	e := dominio.EstadoCupo{
		Tenant: d.consumo[mes].Contador, Asesor: d.consumoAsesor[claveAsesor{asesorID, mes}].Contador,
		TopeSegundosTenant: int64(d.tenant.SegundosMesTope), TopeSimultaneasTenant: d.tenant.SimultaneasTope,
		TopeSegundosAsesor: as.SegundosMesTope, TopeSimultaneasAsesor: as.SimultaneasTope,
	}
	e.ActivasTenant, e.ActivasAsesor = d.activas(ahora, asesorID)
	return e, nil
}

// ReservarCupo implementa almacen.Credenciales (atómico bajo el candado; misma
// regla que vc.reservar_cupo).
func (a *Almacen) ReservarCupo(ctx context.Context, t dominio.TenantID, p dominio.PedidoReserva) (dominio.ResultadoReserva, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.ResultadoReserva{}, err
	}
	s, ok := d.sesiones[p.SesionID]
	if !ok {
		return dominio.ResultadoReserva{}, noEncontrado("sesión")
	}
	s = copiarSesion(s)
	if err := s.IniciarMedios(); err != nil {
		return dominio.ResultadoReserva{}, err
	}
	if p.SegundosMax < dominio.MinimoReservaS || p.SegundosMax > 86400 {
		return dominio.ResultadoReserva{}, errores.Nuevo(errores.ValidacionFallida)
	}
	ahora := dominio.Instante(p.Ahora)
	mes := dominio.MesCuota(ahora)
	if r, ok := d.reservas[p.SesionID]; ok {
		out := dominio.ResultadoReserva{Reserva: r.Reserva}
		if r.liberadaEn == nil && r.VenceEn.After(ahora) {
			out.Reutilizada = true
		} else {
			a.liberar(d, p.SesionID, r.VenceEn)
			out.Vencida = true
			motivo := dominio.MotivoDuracionMaxima
			if r.Recortada {
				motivo = dominio.MotivoCuotaAgotada
			}
			if err := s.Cerrar(motivo, ahora); err != nil {
				return dominio.ResultadoReserva{}, err
			}
			d.revocarTokensMedios(s.ID, ahora)
		}
		d.sesiones[s.ID] = s
		return out, nil
	}
	for id, r := range d.reservas {
		if r.liberadaEn == nil && !r.VenceEn.After(ahora) {
			a.liberar(d, id, r.VenceEn)
		}
	}
	as := d.asesores[s.AsesorID]
	saldos := []int64{int64(d.tenant.SegundosMesTope) - d.consumo[mes].Total(), a.topes.SegundosMes - a.global[mes].Total()}
	if as.SegundosMesTope != nil {
		saldos = append(saldos, *as.SegundosMesTope-d.consumoAsesor[claveAsesor{s.AsesorID, mes}].Total())
	}
	actT, actA := d.activas(ahora, s.AsesorID)
	actG := 0
	for _, otro := range a.tenants {
		n, _ := otro.activas(ahora, "")
		actG += n
	}
	topeA := -1
	if as.SimultaneasTope != nil {
		topeA = *as.SimultaneasTope
	}
	seg, recortada, err := dominio.DecidirReserva(p.SegundosMax, saldos, []int{actT, actA, actG},
		[]int{d.tenant.SimultaneasTope, topeA, a.topes.Simultaneas})
	if err != nil {
		return dominio.ResultadoReserva{}, err
	}
	r := dominio.Reserva{SesionID: s.ID, AsesorID: s.AsesorID, Mes: mes, Segundos: seg, Recortada: recortada,
		CreadaEn: ahora, VenceEn: ahora.Add(time.Duration(seg)*time.Second + dominio.MargenReserva)}
	d.reservas[s.ID] = reservaMem{Reserva: r}
	a.sumar(d, r.AsesorID, mes, func(c *contadorMes) { c.SegundosReservados += int64(seg) })
	d.sesiones[s.ID] = s
	return dominio.ResultadoReserva{Reserva: r}, nil
}

// sumar aplica fn a los contadores mensuales global, del tenant y del asesor.
func (a *Almacen) sumar(d *datosTenant, asesorID string, mes time.Time, fn func(*contadorMes)) {
	g := contadorMes{Contador: a.global[mes]}
	fn(&g)
	a.global[mes] = g.Contador
	c := d.consumo[mes]
	fn(&c)
	d.consumo[mes] = c
	k := claveAsesor{asesorID, mes}
	ca := d.consumoAsesor[k]
	fn(&ca)
	d.consumoAsesor[k] = ca
}

// liberar cobra la reserva (segundos reales, tope = lo reservado) y devuelve
// el resto; idempotente (como vc.liberar_cupo).
func (a *Almacen) liberar(d *datosTenant, sesionID string, ahora time.Time) {
	r, ok := d.reservas[sesionID]
	if !ok || r.liberadaEn != nil {
		return
	}
	cobrados := dominio.SegundosCobrados(r.Reserva, ahora)
	cot := 0
	if _, ok := d.cotizaciones[sesionID]; ok {
		cot = 1
	}
	a.sumar(d, r.AsesorID, r.Mes, func(c *contadorMes) {
		c.SegundosUsados += int64(cobrados)
		c.SegundosReservados -= int64(r.Segundos)
		c.sesiones++
		c.cotizaciones += cot
	})
	dia := dominio.DiaCuota(ahora)
	cd := d.diario[dia]
	cd.SegundosUsados += int64(cobrados)
	cd.sesiones++
	cd.cotizaciones += cot
	d.diario[dia] = cd
	l := dominio.Instante(ahora)
	r.liberadaEn, r.cobrados = &l, cobrados
	d.reservas[sesionID] = r
}

// ConfigurarTopesGlobales fija los topes globales (en postgres los fija
// `api topes configurar`). Para desarrollo y pruebas.
func (a *Almacen) ConfigurarTopesGlobales(t dominio.TopesGlobales) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.topes = t
}

// ObtenerDerivacion implementa almacen.Credenciales.
func (a *Almacen) ObtenerDerivacion(ctx context.Context, t dominio.TenantID, nueva dominio.Derivacion) (dominio.Derivacion, error) {
	if err := dominio.ExigirTenant(t); err != nil {
		return dominio.Derivacion{}, err
	}
	if err := nueva.Validar(); err != nil {
		return dominio.Derivacion{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	d, err := a.tenant(ctx, t)
	if err != nil {
		return dominio.Derivacion{}, err
	}
	if _, ok := d.sesiones[nueva.SesionID]; !ok {
		return dominio.Derivacion{}, noEncontrado("sesión")
	}
	if ya, ok := d.derivaciones[nueva.SesionID]; ok {
		return ya, nil
	}
	for _, otra := range d.derivaciones {
		if otra.CodigoReferencia == nueva.CodigoReferencia {
			return dominio.Derivacion{}, duplicado("código de referencia")
		}
	}
	nueva.GeneradaEn = dominio.Instante(nueva.GeneradaEn)
	d.derivaciones[nueva.SesionID] = nueva
	return nueva, nil
}

// BuscarClaveAPI implementa almacen.Autenticacion.
func (a *Almacen) BuscarClaveAPI(ctx context.Context, h []byte) (dominio.TenantID, dominio.ClaveAPI, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return "", dominio.ClaveAPI{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	for id, d := range a.tenants {
		for _, c := range d.claves {
			if len(h) == 32 && bytes.Equal(c.Hash, h) {
				return id, c, nil
			}
		}
	}
	return "", dominio.ClaveAPI{}, noEncontrado("clave")
}

// BuscarTokenSesion implementa almacen.Autenticacion.
func (a *Almacen) BuscarTokenSesion(ctx context.Context, h []byte) (dominio.TenantID, dominio.TokenSesion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return "", dominio.TokenSesion{}, errores.Envolver(errores.ServicioNoDisponible, err)
	}
	for id, d := range a.tenants {
		if tok, ok := d.tokens[string(h)]; ok && len(h) == 32 {
			return id, tok, nil
		}
	}
	return "", dominio.TokenSesion{}, noEncontrado("token")
}
