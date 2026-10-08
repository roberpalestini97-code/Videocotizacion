// Package conformidad es la batería única que deben pasar todas las
// implementaciones de almacen (corrección H2 de T20): memoria y postgres
// tienen que dar exactamente los mismos resultados, incluidos los errores del
// catálogo y el aislamiento entre tenants (un tenant nunca ve ni modifica
// filas de otro: siempre el mismo no_encontrado, R5).
package conformidad

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// Base es la hora fija de las pruebas (con microsegundos, como timestamptz).
var Base = time.Date(2026, 10, 8, 13, 0, 0, 123456000, time.UTC)

// Correr ejecuta toda la batería contra el almacén dado. El almacén puede
// tener datos previos: cada caso usa tenants nuevos.
func Correr(t *testing.T, a almacen.Completo) {
	casos := []struct {
		nombre string
		fn     func(*testing.T, almacen.Completo)
	}{
		{"tenant", probarTenant},
		{"tenant_invalido_en_todas_las_operaciones", probarTenantInvalido},
		{"asesor", probarAsesor},
		{"ciclo_de_sesion", probarCicloSesion},
		{"sesion_con_asesor_inexistente_o_duplicada", probarSesionErrores},
		{"listado_paginado", probarListado},
		{"cotizacion", probarCotizacion},
		{"retencion", probarRetencion},
		{"tenants_para_retencion", probarTenantsParaRetencion},
		{"aislamiento_entre_tenants", probarAislamiento},
		{"consentimiento_concurrente", probarConcurrencia},
		{"contexto_cancelado", probarContextoCancelado},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) { c.fn(t, a) })
	}
}

func ctx() context.Context { return context.Background() }

func exigirCodigo(t *testing.T, err error, c errores.Codigo, que string) {
	t.Helper()
	if !errores.Es(err, c) {
		t.Fatalf("%s: se esperaba %s y vino %v", que, c, err)
	}
}

func sinError(t *testing.T, err error, que string) {
	t.Helper()
	if err != nil {
		t.Fatalf("%s: %v", que, err)
	}
}

// NuevoTenant crea y guarda un tenant con valores de prueba (no son cuotas
// ni plazos reales: los plazos de retención van a validar con abogado).
func NuevoTenant(t *testing.T, a almacen.Almacen) dominio.Tenant {
	t.Helper()
	id, err := dominio.NuevoTenantID()
	sinError(t, err, "id de tenant")
	tn := dominio.Tenant{ID: id, Nombre: "Tenant de prueba", SimultaneasTope: 5, SegundosMesTope: 30000, RetencionDias: 90, CreadoEn: Base}
	sinError(t, a.CrearTenant(ctx(), tn), "crear tenant")
	return tn
}

// NuevoAsesor crea y guarda un asesor del tenant.
func NuevoAsesor(t *testing.T, a almacen.Almacen, tn dominio.TenantID) dominio.Asesor {
	t.Helper()
	id, err := dominio.NuevoIDAsesor()
	sinError(t, err, "id de asesor")
	as := dominio.Asesor{
		ID: id, Rol: dominio.RolAsesorBase, NombreVisible: "Asesor de prueba", Email: "asesor@prueba.local",
		WhatsApp: "+5492235550000", Oficios: []dominio.Oficio{dominio.OficioPintura, dominio.OficioJardineria},
		Zonas: []dominio.Zona{dominio.ZonaCobo, dominio.ZonaParqueLago}, CreadoEn: Base,
	}
	sinError(t, a.CrearAsesor(ctx(), tn, as), "crear asesor")
	return as
}

// NuevaSesion crea y guarda una sesión en estado "creada".
func NuevaSesion(t *testing.T, a almacen.Almacen, tn dominio.TenantID, asesorID string, creada time.Time, dias int) dominio.Sesion {
	t.Helper()
	s, err := dominio.NuevaSesion(asesorID, dominio.ModoAvatar3D, creada, dias)
	sinError(t, err, "armar sesión")
	sinError(t, a.CrearSesion(ctx(), tn, s), "crear sesión")
	return s
}

// NuevaCotizacion arma una cotización válida con montos sintéticos de prueba
// (no son tarifas).
func NuevaCotizacion(t *testing.T, sesionID string, emitida time.Time, dias int) dominio.Cotizacion {
	t.Helper()
	id, err := dominio.NuevoIDCotizacion()
	sinError(t, err, "id de cotización")
	item := func(cant int64, pmin, pmax dominio.Centavos, tipo dominio.TipoItem, codigo string) dominio.ItemCotizacion {
		imin, err1 := dominio.ImporteItem(cant, pmin)
		imax, err2 := dominio.ImporteItem(cant, pmax)
		sinError(t, err1, "importe")
		sinError(t, err2, "importe")
		return dominio.ItemCotizacion{Tipo: tipo, CodigoTarea: codigo, Descripcion: "Ítem de prueba", Unidad: dominio.UnidadM2,
			CantidadCentesimas: cant, PrecioUnitarioMinCentavos: pmin, PrecioUnitarioMaxCentavos: pmax,
			ImporteMinCentavos: imin, ImporteMaxCentavos: imax}
	}
	items := []dominio.ItemCotizacion{
		item(1250, 100, 200, dominio.ItemManoDeObra, "prueba_uno"),
		item(100, 50, 50, dominio.ItemTraslado, "prueba_dos"),
	}
	tmin, _ := dominio.Sumar(items[0].ImporteMinCentavos, items[1].ImporteMinCentavos)
	tmax, _ := dominio.Sumar(items[0].ImporteMaxCentavos, items[1].ImporteMaxCentavos)
	emitida = dominio.Instante(emitida)
	return dominio.Cotizacion{
		ID: id, SesionID: sesionID, EmitidaEn: emitida, Moneda: dominio.MonedaARS, Oficio: dominio.OficioPintura,
		Zona: dominio.ZonaCobo, Items: items, TotalMinCentavos: tmin, TotalMaxCentavos: tmax,
		Tarifas:     dominio.Tarifas{Version: "prueba-1", Estado: dominio.TarifasSinValidar},
		ValidezDias: 15, Leyenda: "Presupuesto orientativo de prueba.", BorrarDespuesDe: emitida.AddDate(0, 0, dias),
	}
}

func consentimiento(t *testing.T, s dominio.Sesion, cuando time.Time) dominio.Consentimiento {
	t.Helper()
	c, err := dominio.NuevoConsentimiento(s, "2026-10-08.1", cuando)
	sinError(t, err, "armar consentimiento")
	return c
}

func igual(t *testing.T, got, quiero any, que string) {
	t.Helper()
	if !reflect.DeepEqual(got, quiero) {
		t.Fatalf("%s:\n obtuve %+v\nquería %+v", que, got, quiero)
	}
}

func probarTenant(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	leido, err := a.LeerTenant(ctx(), tn.ID)
	sinError(t, err, "leer tenant")
	igual(t, leido, tn, "tenant leído")
	exigirCodigo(t, a.CrearTenant(ctx(), tn), errores.EstadoInvalido, "tenant duplicado")
	otro, _ := dominio.NuevoTenantID()
	_, err = a.LeerTenant(ctx(), otro)
	exigirCodigo(t, err, errores.NoEncontrado, "tenant inexistente")
	malo := tn
	malo.ID, malo.Nombre = otro, ""
	exigirCodigo(t, a.CrearTenant(ctx(), malo), errores.ValidacionFallida, "tenant inválido")
}

func probarTenantInvalido(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	for _, malo := range []dominio.TenantID{"", "no-es-uuid", dominio.TenantID(string(tn.ID) + " "),
		"' OR 1=1 --", dominio.TenantID(strings.ToUpper(string(tn.ID)))} {
		ops := map[string]error{}
		_, ops["LeerTenant"] = a.LeerTenant(ctx(), malo)
		ops["CrearAsesor"] = a.CrearAsesor(ctx(), malo, as)
		_, ops["LeerAsesor"] = a.LeerAsesor(ctx(), malo, as.ID)
		ops["CrearSesion"] = a.CrearSesion(ctx(), malo, s)
		_, ops["LeerSesion"] = a.LeerSesion(ctx(), malo, s.ID)
		_, _, ops["Listar"] = a.ListarSesionesDeAsesor(ctx(), malo, as.ID, almacen.Pagina{})
		_, ops["RegistrarConsentimiento"] = a.RegistrarConsentimiento(ctx(), malo, consentimiento(t, s, Base), Base)
		_, ops["LeerConsentimiento"] = a.LeerConsentimiento(ctx(), malo, s.ID)
		_, ops["CerrarSesion"] = a.CerrarSesion(ctx(), malo, s.ID, dominio.MotivoCompletada, Base)
		ops["GuardarCotizacion"] = a.GuardarCotizacion(ctx(), malo, NuevaCotizacion(t, s.ID, Base, 30))
		_, ops["LeerCotizacion"] = a.LeerCotizacionDeSesion(ctx(), malo, s.ID)
		_, ops["BorrarVencidos"] = a.BorrarVencidos(ctx(), malo, Base.AddDate(10, 0, 0))
		for op, err := range ops {
			exigirCodigo(t, err, errores.ValidacionFallida, fmt.Sprintf("%s con tenant %q", op, malo))
		}
	}
	// Nada cambió en el tenant real.
	leida, err := a.LeerSesion(ctx(), tn.ID, s.ID)
	sinError(t, err, "releer sesión")
	igual(t, leida, s, "la sesión no debía cambiar")
}

func probarAsesor(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	leido, err := a.LeerAsesor(ctx(), tn.ID, as.ID)
	sinError(t, err, "leer asesor")
	igual(t, leido, as, "asesor leído")
	exigirCodigo(t, a.CrearAsesor(ctx(), tn.ID, as), errores.EstadoInvalido, "asesor duplicado")
	_, err = a.LeerAsesor(ctx(), tn.ID, "ase_NOEXISTE")
	exigirCodigo(t, err, errores.NoEncontrado, "asesor inexistente")
	inexistente, _ := dominio.NuevoTenantID()
	otro := as
	otro.ID, _ = dominio.NuevoIDAsesor()
	exigirCodigo(t, a.CrearAsesor(ctx(), inexistente, otro), errores.NoEncontrado, "asesor de tenant inexistente")
	otro.Zonas = []dominio.Zona{dominio.ZonaOtra}
	exigirCodigo(t, a.CrearAsesor(ctx(), tn.ID, otro), errores.ValidacionFallida, "asesor con zona no atendida")
	venc := Base.AddDate(1, 0, 0)
	otro.Zonas, otro.BorrarDespuesDe = []dominio.Zona{dominio.ZonaMarChiquita}, &venc
	sinError(t, a.CrearAsesor(ctx(), tn.ID, otro), "asesor con vencimiento")
	leido, err = a.LeerAsesor(ctx(), tn.ID, otro.ID)
	sinError(t, err, "leer asesor con vencimiento")
	igual(t, leido, otro, "asesor con vencimiento")
}

func probarCicloSesion(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	leida, err := a.LeerSesion(ctx(), tn.ID, s.ID)
	sinError(t, err, "leer sesión")
	igual(t, leida, s, "sesión creada")

	_, err = a.LeerConsentimiento(ctx(), tn.ID, s.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "consentimiento antes de consentir")
	cuando := Base.Add(10 * time.Second)
	c := consentimiento(t, s, cuando)
	consentida, err := a.RegistrarConsentimiento(ctx(), tn.ID, c, cuando)
	sinError(t, err, "consentir")
	if consentida.Estado != dominio.EstadoConsentida || consentida.ConsentidaEn == nil || !consentida.ConsentidaEn.Equal(dominio.Instante(cuando)) {
		t.Fatalf("sesión consentida = %+v", consentida)
	}
	leida, _ = a.LeerSesion(ctx(), tn.ID, s.ID)
	igual(t, leida, consentida, "sesión consentida releída")
	cl, err := a.LeerConsentimiento(ctx(), tn.ID, s.ID)
	sinError(t, err, "leer consentimiento")
	igual(t, cl, c, "consentimiento")
	_, err = a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, s, cuando), cuando)
	exigirCodigo(t, err, errores.EstadoInvalido, "consentir dos veces")

	fin := cuando.Add(95 * time.Second)
	cerrada, err := a.CerrarSesion(ctx(), tn.ID, s.ID, dominio.MotivoCompletada, fin)
	sinError(t, err, "cerrar")
	if cerrada.Estado != dominio.EstadoCerrada || cerrada.DuracionS != 95 || cerrada.MotivoCierre != dominio.MotivoCompletada {
		t.Fatalf("sesión cerrada = %+v", cerrada)
	}
	leida, _ = a.LeerSesion(ctx(), tn.ID, s.ID)
	igual(t, leida, cerrada, "sesión cerrada releída")
	_, err = a.CerrarSesion(ctx(), tn.ID, s.ID, dominio.MotivoClienteCerro, fin)
	exigirCodigo(t, err, errores.SesionCerrada, "cerrar dos veces")
	_, err = a.CerrarSesion(ctx(), tn.ID, s.ID, dominio.MotivoCierre("inventado"), fin)
	exigirCodigo(t, err, errores.ValidacionFallida, "motivo inválido")

	s2 := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	_, err = a.CerrarSesion(ctx(), tn.ID, s2.ID, dominio.MotivoSinConsentimiento, Base)
	sinError(t, err, "cerrar sin consentir")
	_, err = a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, s2, Base), Base)
	exigirCodigo(t, err, errores.SesionCerrada, "consentir sesión cerrada")
	_, err = a.LeerConsentimiento(ctx(), tn.ID, s2.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "no debe quedar consentimiento")

	_, err = a.RegistrarConsentimiento(ctx(), tn.ID, dominio.Consentimiento{ID: "x"}, Base)
	exigirCodigo(t, err, errores.ValidacionFallida, "consentimiento inválido")
	falsa := s
	falsa.ID, _ = dominio.NuevoIDSesion()
	_, err = a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, falsa, Base), Base)
	exigirCodigo(t, err, errores.NoEncontrado, "consentir sesión inexistente")
	_, err = a.CerrarSesion(ctx(), tn.ID, falsa.ID, dominio.MotivoCompletada, Base)
	exigirCodigo(t, err, errores.NoEncontrado, "cerrar sesión inexistente")
}

func probarSesionErrores(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	exigirCodigo(t, a.CrearSesion(ctx(), tn.ID, s), errores.EstadoInvalido, "sesión duplicada")
	otra, err := dominio.NuevaSesion("ase_0000000000000000000000000Z", dominio.ModoAvatarClips, Base, 30)
	sinError(t, err, "armar sesión")
	exigirCodigo(t, a.CrearSesion(ctx(), tn.ID, otra), errores.NoEncontrado, "sesión con asesor inexistente")
	mala := s
	mala.ID, _ = dominio.NuevoIDSesion()
	mala.Estado = dominio.EstadoCerrada
	exigirCodigo(t, a.CrearSesion(ctx(), tn.ID, mala), errores.ValidacionFallida, "sesión inválida")
	_, err = a.LeerSesion(ctx(), tn.ID, "ses_inexistente")
	exigirCodigo(t, err, errores.NoEncontrado, "sesión inexistente")
}

func probarListado(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	otroAsesor := NuevoAsesor(t, a, tn.ID)
	NuevaSesion(t, a, tn.ID, otroAsesor.ID, Base, 30) // no debe aparecer
	var esperadas []dominio.Sesion
	for i := range 7 {
		// Tres pares con la misma hora para probar el desempate por id.
		esperadas = append(esperadas, NuevaSesion(t, a, tn.ID, as.ID, Base.Add(time.Duration(i/2)*time.Minute), 30))
	}
	// Orden esperado: creada_en DESC, id DESC.
	for i := range esperadas {
		for j := i + 1; j < len(esperadas); j++ {
			x, y := esperadas[i], esperadas[j]
			if y.CreadaEn.After(x.CreadaEn) || (y.CreadaEn.Equal(x.CreadaEn) && y.ID > x.ID) {
				esperadas[i], esperadas[j] = y, x
			}
		}
	}
	var todas []dominio.Sesion
	cursor, paginas := "", 0
	for {
		pag, sig, err := a.ListarSesionesDeAsesor(ctx(), tn.ID, as.ID, almacen.Pagina{Despues: cursor, Limite: 3})
		sinError(t, err, "listar")
		paginas++
		if len(pag) > 3 || paginas > 5 {
			t.Fatalf("página %d con %d elementos", paginas, len(pag))
		}
		todas = append(todas, pag...)
		if sig == "" {
			break
		}
		cursor = sig
	}
	if paginas != 3 {
		t.Fatalf("se esperaban 3 páginas, hubo %d", paginas)
	}
	igual(t, todas, esperadas, "listado completo")
	completo, sig, err := a.ListarSesionesDeAsesor(ctx(), tn.ID, as.ID, almacen.Pagina{})
	sinError(t, err, "listar sin límite")
	if len(completo) != 7 || sig != "" {
		t.Fatalf("límite por defecto: %d elementos, siguiente %q", len(completo), sig)
	}
	vacio, sig, err := a.ListarSesionesDeAsesor(ctx(), tn.ID, "ase_inexistente", almacen.Pagina{})
	sinError(t, err, "listar asesor inexistente")
	if len(vacio) != 0 || sig != "" || vacio == nil {
		t.Fatalf("asesor inexistente: %v %q", vacio, sig)
	}
	for _, malo := range []string{"!!!", "MTIz", almacen.CodificarCursor(Base, "ses_malo")} {
		_, _, err = a.ListarSesionesDeAsesor(ctx(), tn.ID, as.ID, almacen.Pagina{Despues: malo})
		exigirCodigo(t, err, errores.ValidacionFallida, "cursor inválido "+malo)
	}
}

func probarCotizacion(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	_, err := a.LeerCotizacionDeSesion(ctx(), tn.ID, s.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "cotización antes de emitir")
	c := NuevaCotizacion(t, s.ID, Base.Add(time.Minute), 30)
	sinError(t, a.GuardarCotizacion(ctx(), tn.ID, c), "guardar cotización")
	leida, err := a.LeerCotizacionDeSesion(ctx(), tn.ID, s.ID)
	sinError(t, err, "leer cotización")
	igual(t, leida, c, "cotización leída")
	otra := NuevaCotizacion(t, s.ID, Base, 30)
	exigirCodigo(t, a.GuardarCotizacion(ctx(), tn.ID, otra), errores.EstadoInvalido, "segunda cotización de la sesión")
	sinSesion := NuevaCotizacion(t, "ses_0000000000000000000000000Z", Base, 30)
	exigirCodigo(t, a.GuardarCotizacion(ctx(), tn.ID, sinSesion), errores.NoEncontrado, "cotización sin sesión")
	mala := NuevaCotizacion(t, s.ID, Base, 30)
	mala.TotalMinCentavos++
	exigirCodigo(t, a.GuardarCotizacion(ctx(), tn.ID, mala), errores.ValidacionFallida, "total que no suma")
}

func probarRetencion(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	vecino := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	asv := NuevoAsesor(t, a, vecino.ID)
	vence := NuevaSesion(t, a, tn.ID, as.ID, Base, 10) // vence a los 10 días
	c := consentimiento(t, vence, Base)
	_, err := a.RegistrarConsentimiento(ctx(), tn.ID, c, Base)
	sinError(t, err, "consentir")
	sinError(t, a.GuardarCotizacion(ctx(), tn.ID, NuevaCotizacion(t, vence.ID, Base, 60)), "cotización")
	queda := NuevaSesion(t, a, tn.ID, as.ID, Base, 90)
	cotCorta := NuevaCotizacion(t, queda.ID, Base, 5) // la cotización vence antes que su sesión
	sinError(t, a.GuardarCotizacion(ctx(), tn.ID, cotCorta), "cotización corta")
	delVecino := NuevaSesion(t, a, vecino.ID, asv.ID, Base, 1)

	b, err := a.BorrarVencidos(ctx(), tn.ID, Base.AddDate(0, 0, 4))
	sinError(t, err, "retención antes de vencer")
	igual(t, b, almacen.Borrados{}, "nada vencido todavía")

	b, err = a.BorrarVencidos(ctx(), tn.ID, Base.AddDate(0, 0, 10)) // borrar_despues_de <= ahora
	sinError(t, err, "retención")
	igual(t, b, almacen.Borrados{Sesiones: 1, Consentimientos: 1, Cotizaciones: 2, Items: 4}, "borrados")
	_, err = a.LeerSesion(ctx(), tn.ID, vence.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "sesión vencida")
	_, err = a.LeerConsentimiento(ctx(), tn.ID, vence.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "consentimiento de sesión vencida")
	_, err = a.LeerCotizacionDeSesion(ctx(), tn.ID, vence.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "cotización de sesión vencida")
	_, err = a.LeerCotizacionDeSesion(ctx(), tn.ID, queda.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "cotización vencida por su cuenta")
	_, err = a.LeerSesion(ctx(), tn.ID, queda.ID)
	sinError(t, err, "la sesión vigente queda")
	// El vecino también venció, pero la retención de tn no lo toca.
	_, err = a.LeerSesion(ctx(), vecino.ID, delVecino.ID)
	sinError(t, err, "la retención de un tenant no borra otro")
	inexistente, _ := dominio.NuevoTenantID()
	_, err = a.BorrarVencidos(ctx(), inexistente, Base)
	exigirCodigo(t, err, errores.NoEncontrado, "retención de tenant inexistente")
}

func probarTenantsParaRetencion(t *testing.T, a almacen.Completo) {
	x, y := NuevoTenant(t, a), NuevoTenant(t, a)
	ids, err := a.TenantsParaRetencion(ctx())
	sinError(t, err, "tenants para retención")
	vistos := 0
	for i, id := range ids {
		if i > 0 && ids[i-1] >= id {
			t.Fatal("los ids deben venir ordenados y sin repetir")
		}
		if id == x.ID || id == y.ID {
			vistos++
		}
	}
	if vistos != 2 {
		t.Fatalf("faltan tenants en la lista de retención: %v", ids)
	}
}

// probarAislamiento: con la credencial de A, todo recurso de B responde
// exactamente igual que uno inexistente, y nada de B cambia.
func probarAislamiento(t *testing.T, a almacen.Completo) {
	A, B := NuevoTenant(t, a), NuevoTenant(t, a)
	asA, asB := NuevoAsesor(t, a, A.ID), NuevoAsesor(t, a, B.ID)
	sA, sB := NuevaSesion(t, a, A.ID, asA.ID, Base, 30), NuevaSesion(t, a, B.ID, asB.ID, Base, 30)
	sB2 := NuevaSesion(t, a, B.ID, asB.ID, Base, 1)
	cB := consentimiento(t, sB, Base)
	sBc, err := a.RegistrarConsentimiento(ctx(), B.ID, cB, Base)
	sinError(t, err, "consentir en B")
	cotB := NuevaCotizacion(t, sB.ID, Base, 30)
	sinError(t, a.GuardarCotizacion(ctx(), B.ID, cotB), "cotización en B")

	// Lecturas.
	_, err = a.LeerAsesor(ctx(), A.ID, asB.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "A lee asesor de B")
	_, err = a.LeerSesion(ctx(), A.ID, sB.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "A lee sesión de B")
	_, err = a.LeerConsentimiento(ctx(), A.ID, sB.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "A lee consentimiento de B")
	_, err = a.LeerCotizacionDeSesion(ctx(), A.ID, sB.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "A lee cotización de B")
	lista, sig, err := a.ListarSesionesDeAsesor(ctx(), A.ID, asB.ID, almacen.Pagina{})
	sinError(t, err, "A lista asesor de B")
	if len(lista) != 0 || sig != "" {
		t.Fatalf("A ve %d sesiones de B", len(lista))
	}
	cursorB := almacen.CodificarCursor(sB.CreadaEn.Add(time.Hour), sB.ID)
	lista, _, err = a.ListarSesionesDeAsesor(ctx(), A.ID, asB.ID, almacen.Pagina{Despues: cursorB})
	sinError(t, err, "A lista con cursor armado con ids de B")
	if len(lista) != 0 {
		t.Fatal("un cursor con ids de B no debe exponer nada")
	}
	tA, err := a.LeerTenant(ctx(), A.ID)
	sinError(t, err, "A lee su tenant")
	if tA.ID != A.ID {
		t.Fatal("LeerTenant devolvió otro tenant")
	}

	// Escrituras sobre recursos de B usando la credencial de A.
	_, err = a.RegistrarConsentimiento(ctx(), A.ID, consentimiento(t, sB2, Base), Base)
	exigirCodigo(t, err, errores.NoEncontrado, "A consiente sesión de B")
	_, err = a.CerrarSesion(ctx(), A.ID, sB.ID, dominio.MotivoErrorInterno, Base)
	exigirCodigo(t, err, errores.NoEncontrado, "A cierra sesión de B")
	exigirCodigo(t, a.GuardarCotizacion(ctx(), A.ID, NuevaCotizacion(t, sB2.ID, Base, 30)), errores.NoEncontrado, "A cotiza sesión de B")
	conAsesorB, err := dominio.NuevaSesion(asB.ID, dominio.ModoAvatar3D, Base, 30)
	sinError(t, err, "armar sesión")
	exigirCodigo(t, a.CrearSesion(ctx(), A.ID, conAsesorB), errores.NoEncontrado, "A crea sesión con asesor de B")
	// Mismo id que un recurso de B, pero en A: no debe chocar ni revelar existencia.
	mismoID := sB
	mismoID.AsesorID = asA.ID
	sinError(t, a.CrearSesion(ctx(), A.ID, mismoID), "A crea sesión con el mismo id que una de B")
	b, err := a.BorrarVencidos(ctx(), A.ID, Base.AddDate(5, 0, 0))
	sinError(t, err, "retención de A")
	if b.Sesiones != 2 {
		t.Fatalf("A debía borrar solo sus 2 sesiones, borró %+v", b)
	}

	// B quedó intacto.
	leida, err := a.LeerSesion(ctx(), B.ID, sB.ID)
	sinError(t, err, "B relee su sesión")
	igual(t, leida, sBc, "sesión de B intacta")
	leida2, err := a.LeerSesion(ctx(), B.ID, sB2.ID)
	sinError(t, err, "B relee su segunda sesión")
	igual(t, leida2, sB2, "segunda sesión de B intacta")
	cot, err := a.LeerCotizacionDeSesion(ctx(), B.ID, sB.ID)
	sinError(t, err, "B relee su cotización")
	igual(t, cot, cotB, "cotización de B intacta")
	_, err = a.LeerSesion(ctx(), A.ID, sA.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "la sesión vencida de A se borró")
}

func probarConcurrencia(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	const n = 10
	var wg sync.WaitGroup
	errs := make([]error, n)
	for i := range n {
		c := consentimiento(t, s, Base)
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = a.RegistrarConsentimiento(ctx(), tn.ID, c, Base)
		}()
	}
	wg.Wait()
	ok := 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case !errores.Es(err, errores.EstadoInvalido):
			t.Fatalf("error inesperado en consentimiento concurrente: %v", err)
		}
	}
	if ok != 1 {
		t.Fatalf("se esperaba exactamente 1 consentimiento aceptado, hubo %d", ok)
	}
}

func probarContextoCancelado(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	c, cancelar := context.WithCancel(context.Background())
	cancelar()
	_, err := a.LeerTenant(c, tn.ID)
	exigirCodigo(t, err, errores.ServicioNoDisponible, "contexto cancelado")
}
