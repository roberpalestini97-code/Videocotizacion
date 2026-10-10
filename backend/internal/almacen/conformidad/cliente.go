package conformidad

import (
	"sync"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// probarReservaConcurrente: R57/H3, 20 reservas concurrentes con tope de
// simultáneas 5 → exactamente 5; con saldo para 3 llamadas → exactamente 3.
func probarReservaConcurrente(t *testing.T, a almacen.Completo) {
	for _, c := range []struct {
		nombre         string
		segundos, sim  int
		quiero         int
		codigoDelResto errores.Codigo
	}{
		{"tope_de_simultaneas", 1_000_000, 5, 5, errores.SimultaneasAgotadas},
		{"tope_de_saldo", 3 * 900, 20, 3, errores.CuotaAgotada},
	} {
		t.Run(c.nombre, func(t *testing.T) {
			tn := NuevoTenantConTopes(t, a, c.segundos, c.sim)
			as := NuevoAsesor(t, a, tn.ID)
			ids := make([]string, 20)
			for i := range ids {
				s := NuevaSesion(t, a, tn.ID, as.ID, Base, 90)
				_, err := a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, s, Base), Base)
				sinError(t, err, "consentir")
				ids[i] = s.ID
			}
			var mu sync.Mutex
			ok, rechazos := 0, map[errores.Codigo]int{}
			var wg sync.WaitGroup
			largada := make(chan struct{})
			for _, id := range ids {
				wg.Add(1)
				go func() {
					defer wg.Done()
					<-largada
					_, err := a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: id, Ahora: Base.Add(time.Minute), SegundosMax: 900})
					mu.Lock()
					defer mu.Unlock()
					if err == nil {
						ok++
					} else {
						rechazos[errores.CodigoDe(err)]++
					}
				}()
			}
			close(largada)
			wg.Wait()
			if ok != c.quiero || rechazos[c.codigoDelResto] != 20-c.quiero {
				t.Fatalf("aceptadas %d (quería %d), rechazos %v", ok, c.quiero, rechazos)
			}
			e, err := a.Cupo(ctx(), tn.ID, as.ID, dominio.MesCuota(Base), Base.Add(2*time.Minute))
			sinError(t, err, "cupo")
			igual(t, [2]any{e.Tenant.SegundosReservados, e.ActivasTenant}, [2]any{int64(900 * c.quiero), c.quiero}, "consumo tras la carrera")
		})
	}
}

// probarClienteFinal: token de medios, contacto (R68) y ARCO (R22–R24).
func probarClienteFinal(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	otro := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s := NuevaSesion(t, a, tn.ID, as.ID, Base, 90)

	tok := dominio.TokenMedios{Hash: HashAleatorio(t), SesionID: s.ID, EmitidoEn: Base, VenceEn: Base.Add(30 * time.Second)}
	sinError(t, a.GuardarTokenMedios(ctx(), tn.ID, tok), "token de medios")
	exigirCodigo(t, a.GuardarTokenMedios(ctx(), tn.ID, tok), errores.EstadoInvalido, "hash de medios repetido")
	exigirCodigo(t, a.GuardarTokenMedios(ctx(), otro.ID, dominio.TokenMedios{Hash: HashAleatorio(t), SesionID: s.ID, EmitidoEn: Base,
		VenceEn: Base.Add(30 * time.Second)}), errores.NoEncontrado, "token de medios para sesión de otro tenant")
	largo := tok
	largo.Hash, largo.VenceEn = HashAleatorio(t), Base.Add(61*time.Second)
	exigirCodigo(t, a.GuardarTokenMedios(ctx(), tn.ID, largo), errores.ValidacionFallida, "token de medios de más de 60 s")

	contacto := dominio.Contacto{SesionID: s.ID, Nombre: "Marta", Telefono: "+5492235551000", AvisoVersion: "2026-10-08.1",
		ConsentidoEn: Base, BorrarDespuesDe: s.BorrarDespuesDe}
	exigirCodigo(t, a.RegistrarContacto(ctx(), tn.ID, contacto), errores.EstadoInvalido, "contacto antes del consentimiento")
	_, err := a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, s, Base), Base)
	sinError(t, err, "consentir")
	exigirCodigo(t, a.RegistrarContacto(ctx(), tn.ID, contacto), errores.EstadoInvalido, "contacto antes de la llamada")
	_, err = a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s.ID, Ahora: Base, SegundosMax: 900})
	sinError(t, err, "reservar")
	exigirCodigo(t, a.RegistrarContacto(ctx(), otro.ID, contacto), errores.NoEncontrado, "contacto en sesión de otro tenant")
	sinError(t, a.RegistrarContacto(ctx(), tn.ID, contacto), "contacto")
	exigirCodigo(t, a.RegistrarContacto(ctx(), tn.ID, contacto), errores.ContactoYaRegistrado, "segundo contacto")
	sinCanal := contacto
	sinCanal.Telefono = ""
	exigirCodigo(t, a.RegistrarContacto(ctx(), tn.ID, sinCanal), errores.ValidacionFallida, "contacto sin teléfono ni email")

	// ARCO: la consulta se encuentra por código + segundo factor.
	_, err = a.CerrarSesion(ctx(), tn.ID, s.ID, dominio.MotivoCompletada, Base.Add(5*time.Minute))
	sinError(t, err, "cerrar")
	sinError(t, a.GuardarCotizacion(ctx(), tn.ID, NuevaCotizacion(t, s.ID, Base.Add(4*time.Minute), 90)), "cotización")
	der, err := a.ObtenerDerivacion(ctx(), tn.ID, dominio.Derivacion{SesionID: s.ID, CodigoReferencia: "VC-ARC0-000001", GeneradaEn: Base})
	sinError(t, err, "derivación")
	solicitud := func(tipo dominio.TipoArco) dominio.SolicitudArco {
		id, err := dominio.NuevoIDSolicitudArco()
		sinError(t, err, "id arco")
		return dominio.SolicitudArco{ID: id, RecibidaEn: Base.Add(time.Hour), PlazoVenceEn: dominio.PlazoArco(tipo, Base.Add(time.Hour))}
	}
	for _, c := range []struct {
		nombre    string
		tenant    dominio.TenantID
		pedido    dominio.PedidoArco
		resultado string
	}{
		{"solo el código", tn.ID, dominio.PedidoArco{Tipo: dominio.ArcoSupresion, CodigoReferencia: der.CodigoReferencia, Telefono: "+5492235559999"}, dominio.ArcoSinCoincidencia},
		{"código de otro tenant", otro.ID, dominio.PedidoArco{Tipo: dominio.ArcoSupresion, CodigoReferencia: der.CodigoReferencia, Telefono: contacto.Telefono}, dominio.ArcoSinCoincidencia},
		{"código inexistente", tn.ID, dominio.PedidoArco{Tipo: dominio.ArcoAcceso, CodigoReferencia: "VC-ZZZZ-ZZZZZZ", Telefono: contacto.Telefono}, dominio.ArcoSinCoincidencia},
		{"acceso con dos factores", tn.ID, dominio.PedidoArco{Tipo: dominio.ArcoAcceso, CodigoReferencia: der.CodigoReferencia, Telefono: contacto.Telefono}, dominio.ArcoPendiente},
		{"rectificación con dos factores", tn.ID, dominio.PedidoArco{Tipo: dominio.ArcoRectificacion, CodigoReferencia: der.CodigoReferencia, Telefono: contacto.Telefono, Detalle: "Eran 40 m2"}, dominio.ArcoPendiente},
	} {
		got, err := a.AtenderArco(ctx(), c.tenant, c.pedido, solicitud(c.pedido.Tipo))
		sinError(t, err, c.nombre)
		if got.Resultado != c.resultado || (got.Detalle != "") != (c.pedido.Tipo == dominio.ArcoRectificacion && c.resultado == dominio.ArcoPendiente) {
			t.Fatalf("%s: %+v", c.nombre, got)
		}
		_, err = a.LeerSesion(ctx(), tn.ID, s.ID)
		sinError(t, err, c.nombre+": la consulta no se toca")
	}
	antes, err := a.Cupo(ctx(), tn.ID, as.ID, dominio.MesCuota(Base), Base)
	sinError(t, err, "cupo antes de suprimir")
	got, err := a.AtenderArco(ctx(), tn.ID, dominio.PedidoArco{Tipo: dominio.ArcoSupresion, CodigoReferencia: der.CodigoReferencia, Telefono: contacto.Telefono}, solicitud(dominio.ArcoSupresion))
	sinError(t, err, "supresión")
	if got.Resultado != dominio.ArcoSuprimida || got.SesionID != "" || got.Detalle != "" {
		t.Fatalf("supresión: %+v", got)
	}
	_, err = a.LeerSesion(ctx(), tn.ID, s.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "sesión suprimida")
	_, err = a.LeerCotizacionDeSesion(ctx(), tn.ID, s.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "cotización suprimida")
	exigirCodigo(t, a.RegistrarContacto(ctx(), tn.ID, contacto), errores.NoEncontrado, "contacto suprimido con su sesión")
	despues, _ := a.Cupo(ctx(), tn.ID, as.ID, dominio.MesCuota(Base), Base)
	igual(t, despues, antes, "la supresión no devuelve minutos (H2)")
	// Repetir la supresión ya no encuentra nada: misma forma de respuesta.
	got, err = a.AtenderArco(ctx(), tn.ID, dominio.PedidoArco{Tipo: dominio.ArcoSupresion, CodigoReferencia: der.CodigoReferencia, Telefono: contacto.Telefono}, solicitud(dominio.ArcoSupresion))
	sinError(t, err, "supresión repetida")
	igual(t, got.Resultado, dominio.ArcoSinCoincidencia, "segunda supresión")
}
