// Package conformidad es la batería única que deben pasar todas las
// implementaciones de almacen (corrección H2 de T20): memoria y postgres
// tienen que dar exactamente los mismos resultados, incluidos los errores del
// catálogo y el aislamiento entre tenants (un tenant nunca ve ni modifica
// filas de otro: siempre el mismo no_encontrado, R5).
package conformidad

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
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
		{"claves_y_enlaces", probarClavesYEnlaces},
		{"tokens_de_sesion", probarTokensSesion},
		{"cupo_de_medios", probarCupoMedios},
		{"corte_de_limites", probarCorteDeLimites},
		{"contacto", probarContacto},
		{"exportacion_de_cuenta", probarExportacionCuenta},
		{"handshake_de_medios", probarHandshakeMedios},
		{"contrasena_de_panel", probarContrasenaPanel},
		{"totp_de_panel", probarTotpPanel},
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
		_, ops["ActualizarPerfil"] = a.ActualizarPerfil(ctx(), malo, dominio.Asesor{})
		_, ops["LeerAsesor"] = a.LeerAsesor(ctx(), malo, as.ID)
		ops["CrearSesion"] = a.CrearSesion(ctx(), malo, s)
		_, ops["LeerSesion"] = a.LeerSesion(ctx(), malo, s.ID)
		_, _, ops["Listar"] = a.ListarSesionesDeAsesor(ctx(), malo, as.ID, almacen.Pagina{})
		_, ops["RegistrarConsentimiento"] = a.RegistrarConsentimiento(ctx(), malo, consentimiento(t, s, Base), Base)
		_, ops["LeerConsentimiento"] = a.LeerConsentimiento(ctx(), malo, s.ID)
		_, ops["CerrarSesion"] = a.CerrarSesion(ctx(), malo, s.ID, dominio.MotivoCompletada, Base)
		ops["MarcarVoz"] = a.MarcarVoz(ctx(), malo, s.ID, Base)
		_, ops["BarrerLimites"] = a.BarrerLimites(ctx(), malo, Base, 20, 900)
		ops["GuardarCotizacion"] = a.GuardarCotizacion(ctx(), malo, NuevaCotizacion(t, s.ID, Base, 30))
		_, ops["LeerCotizacion"] = a.LeerCotizacionDeSesion(ctx(), malo, s.ID)
		ops["AnexarRespuestaModelo"] = a.AnexarRespuestaModelo(ctx(), malo, dominio.RespuestaModelo{SesionID: s.ID, Turno: 1, RegistradaEn: Base, SalidaJSON: []byte(`{"version":"1.0"}`)})
		_, ops["ListarRespuestasModelo"] = a.ListarRespuestasModeloDeSesion(ctx(), malo, s.ID)
		_, ops["BorrarVencidos"] = a.BorrarVencidos(ctx(), malo, Base.AddDate(10, 0, 0))
		ops["GuardarClave"] = a.GuardarClave(ctx(), malo, claveDePrueba(t, false))
		_, ops["ListarClavesWidget"] = a.ListarClavesWidget(ctx(), malo)
		ops["RevocarClaveWidget"] = a.RevocarClaveWidget(ctx(), malo, "cpw_x", Base)
		ops["GuardarEnlace"] = a.GuardarEnlace(ctx(), malo, dominio.Enlace{IDPublico: "aaaaaaaaaaaaaaaaaaaaaa", AsesorID: as.ID, CreadoEn: Base})
		_, ops["LeerEnlace"] = a.LeerEnlace(ctx(), malo, "aaaaaaaaaaaaaaaaaaaaaa")
		_, ops["RotarEnlace"] = a.RotarEnlace(ctx(), malo, as.ID, dominio.Enlace{})
		var hashTok [32]byte
		sinError(t, leerHash(hashTok[:]), "hash de token")
		ops["GuardarToken"] = a.GuardarTokenSesion(ctx(), malo, dominio.TokenSesion{
			Hash: hashTok[:], SesionID: s.ID, EmitidoEn: Base, VenceEn: Base.Add(time.Hour),
		})
		var hashMed [32]byte
		sinError(t, leerHash(hashMed[:]), "hash de medios")
		_, ops["ReservarTokenMedios"] = a.ReservarTokenMedios(ctx(), malo, s.ID, hashMed[:], Base)
		_, ops["RegistrarContacto"] = a.RegistrarContacto(ctx(), malo, contactoDePrueba(s, as.ID), Base)
		_, ops["LeerContacto"] = a.LeerContacto(ctx(), malo, s.ID)
		ops["ConsumirTokenMedios"] = a.ConsumirTokenMedios(ctx(), malo, s.ID, hashMed[:], Base)
		ops["GuardarContrasena"] = a.GuardarContrasena(ctx(), malo, dominio.ContrasenaAsesor{})
		_, ops["LeerContrasena"] = a.LeerContrasena(ctx(), malo, as.ID)
		ops["GuardarIngresoPanel"] = a.GuardarIngresoPanel(ctx(), malo, dominio.IngresoPanel{})
		_, ops["LeerIngresoPanel"] = a.LeerIngresoPanel(ctx(), malo, nil)
		ops["GuardarSecretoTOTP"] = a.GuardarSecretoTOTP(ctx(), malo, dominio.SecretoTOTP{})
		_, ops["LeerSecretoTOTP"] = a.LeerSecretoTOTP(ctx(), malo, as.ID)
		ops["GuardarCodigoRecuperacion"] = a.GuardarCodigoRecuperacion(ctx(), malo, dominio.CodigoRecuperacion{})
		_, ops["ListarCodigosRecuperacion"] = a.ListarCodigosRecuperacion(ctx(), malo, as.ID)
		ops["AbrirSesionPanel"] = a.AbrirSesionPanel(ctx(), malo, dominio.AperturaPanel{})
		ops["OtorgarReautenticacion"] = a.OtorgarReautenticacion(ctx(), malo, nil, 0, Base.Add(time.Minute), Base)
		ops["CambiarContrasena"] = a.CambiarContrasena(ctx(), malo, nil, dominio.ContrasenaAsesor{}, Base)
		ops["CerrarSesionPanel"] = a.CerrarSesionPanel(ctx(), malo, nil, Base)
		ops["GuardarConsentimientoAsesor"] = a.GuardarConsentimientoAsesor(ctx(), malo, dominio.ConsentimientoAsesor{})
		_, ops["LeerConsentimientoAsesor"] = a.LeerConsentimientoAsesor(ctx(), malo, as.ID)
		ops["AnexarLectura"] = a.AnexarLectura(ctx(), malo, dominio.Lectura{})
		_, ops["ListarLecturasDelAsesor"] = a.ListarLecturasDelAsesor(ctx(), malo, as.ID)
		_, ops["ConsumoDelAsesor"] = a.ConsumoDelAsesor(ctx(), malo, as.ID, Base)
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
	nombre := "Asesor editado"
	editado, err := as.AplicarPerfil(dominio.CambioPerfil{Nombre: &nombre})
	sinError(t, err, "aplicar perfil")
	guardado, err := a.ActualizarPerfil(ctx(), tn.ID, editado)
	sinError(t, err, "actualizar perfil")
	if guardado.NombreVisible != nombre || guardado.Email != as.Email || guardado.WhatsApp != as.WhatsApp || guardado.Rol != as.Rol {
		t.Fatalf("el perfil cambió de más: %+v", guardado)
	}
	ajeno := NuevoTenant(t, a)
	_, err = a.ActualizarPerfil(ctx(), ajeno.ID, editado)
	exigirCodigo(t, err, errores.NoEncontrado, "otro tenant actualiza el perfil")
	leido, err = a.LeerAsesor(ctx(), tn.ID, as.ID)
	sinError(t, err, "releer perfil")
	if leido.NombreVisible != nombre {
		t.Fatal("el otro tenant pisó el nombre")
	}
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
	ajena := NuevaSesion(t, a, tn.ID, otroAsesor.ID, Base, 30)
	_, _, err = a.ListarSesionesDeAsesor(ctx(), tn.ID, as.ID, almacen.Pagina{Despues: almacen.CodificarCursor(ajena.CreadaEn, ajena.ID)})
	exigirCodigo(t, err, errores.ValidacionFallida, "cursor de otro asesor")
	cot := NuevaCotizacion(t, esperadas[0].ID, Base, 30)
	sinError(t, a.GuardarCotizacion(ctx(), tn.ID, cot), "cotización del filtro")
	solo, _, err := a.ListarSesionesDeAsesor(ctx(), tn.ID, as.ID, almacen.Pagina{Oficio: dominio.OficioPintura})
	sinError(t, err, "filtro pintura")
	if len(solo) != 1 || solo[0].ID != esperadas[0].ID {
		t.Fatalf("oficio: %+v", solo)
	}
	nada, _, err := a.ListarSesionesDeAsesor(ctx(), tn.ID, as.ID, almacen.Pagina{Oficio: dominio.OficioJardineria})
	sinError(t, err, "filtro jardinería")
	if len(nada) != 0 {
		t.Fatalf("jardinería: %+v", nada)
	}
	otroTn := NuevoTenant(t, a)
	asOtro := NuevoAsesor(t, a, otroTn.ID)
	sOtro := NuevaSesion(t, a, otroTn.ID, asOtro.ID, Base, 30)
	cotOtro := NuevaCotizacion(t, sOtro.ID, Base, 30)
	sinError(t, a.GuardarCotizacion(ctx(), otroTn.ID, cotOtro), "cotización de otro tenant")
	solo, _, err = a.ListarSesionesDeAsesor(ctx(), tn.ID, as.ID, almacen.Pagina{Oficio: dominio.OficioPintura})
	sinError(t, err, "filtro no cruza tenant")
	if len(solo) != 1 || solo[0].ID != esperadas[0].ID {
		t.Fatalf("el filtro vio otro tenant: %+v", solo)
	}
	vieja := NuevaSesion(t, a, tn.ID, as.ID, time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC), 30)
	delDia, _, err := a.ListarSesionesDeAsesor(ctx(), tn.ID, as.ID, almacen.Pagina{
		Desde: time.Date(2026, 10, 8, 0, 0, 0, 0, time.UTC),
		Hasta: time.Date(2026, 10, 8, 0, 0, 0, 0, time.UTC),
	})
	sinError(t, err, "filtro de fecha")
	for _, s := range delDia {
		if s.ID == vieja.ID {
			t.Fatal("la sesión del 1 de octubre entró en el 8")
		}
	}
	if len(delDia) != 7 {
		t.Fatalf("el 8 de octubre: %d", len(delDia))
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
	conB, err := a.RegistrarContacto(ctx(), B.ID, contactoDePrueba(sB, asB.ID), Base)
	sinError(t, err, "contacto en B")
	_, err = a.LeerContacto(ctx(), A.ID, sB.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "A lee contacto de B")
	_, err = a.RegistrarContacto(ctx(), A.ID, contactoDePrueba(sB, asB.ID), Base)
	exigirCodigo(t, err, errores.NoEncontrado, "A anexa contacto en sesión de B")
	lista, sig, err := a.ListarSesionesDeAsesor(ctx(), A.ID, asB.ID, almacen.Pagina{})
	sinError(t, err, "A lista asesor de B")
	if len(lista) != 0 || sig != "" {
		t.Fatalf("A ve %d sesiones de B", len(lista))
	}
	cursorB := almacen.CodificarCursor(sB.CreadaEn, sB.ID)
	_, _, err = a.ListarSesionesDeAsesor(ctx(), A.ID, asA.ID, almacen.Pagina{Despues: cursorB})
	exigirCodigo(t, err, errores.ValidacionFallida, "cursor de una sesión de B")
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
	con, err := a.LeerContacto(ctx(), B.ID, sB.ID)
	sinError(t, err, "B relee su contacto")
	igual(t, con, conB, "contacto de B intacto")
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

func claveDePrueba(t *testing.T, revocada bool) dominio.ClaveAPI {
	t.Helper()
	id, err := dominio.NuevoIDClavePublica()
	sinError(t, err, "id de clave")
	var hash [32]byte
	sinError(t, leerHash(hash[:]), "hash de clave")
	var rev *time.Time
	if revocada {
		r := Base
		rev = &r
	}
	return dominio.ClaveAPI{
		ID: id, Tipo: dominio.ClavePublica, Hash: hash[:], Prefijo: "vc_pub_test",
		Origenes: []string{"https://cotizar.videocotizacion.local"}, CreadaEn: Base, RevocadaEn: rev,
	}
}

var seqHash atomic.Uint64

func leerHash(b []byte) error {
	binary.BigEndian.PutUint64(b, seqHash.Add(1))
	return nil
}

func probarClavesYEnlaces(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	c := claveDePrueba(t, false)
	sinError(t, a.GuardarClave(ctx(), tn.ID, c), "guardar clave")
	hallada, err := a.BuscarClavePorHash(ctx(), c.Hash)
	sinError(t, err, "buscar clave")
	if hallada.TenantID != tn.ID || hallada.ID != c.ID || hallada.Revocada || hallada.Tipo != dominio.ClavePublica {
		t.Fatalf("clave hallada: %+v", hallada)
	}
	rev := claveDePrueba(t, true)
	sinError(t, a.GuardarClave(ctx(), tn.ID, rev), "guardar clave revocada")
	hallada, err = a.BuscarClavePorHash(ctx(), rev.Hash)
	sinError(t, err, "buscar revocada")
	if !hallada.Revocada {
		t.Fatal("la clave revocada tiene que encontrarse marcada")
	}
	_, err = a.BuscarClavePorHash(ctx(), make([]byte, 32))
	exigirCodigo(t, err, errores.NoEncontrado, "hash desconocido")
	otro := NuevoTenant(t, a)
	listaOtro, err := a.ListarClavesWidget(ctx(), otro.ID)
	sinError(t, err, "listar claves del otro tenant")
	if len(listaOtro) != 0 {
		t.Fatal("el otro tenant ve claves ajenas")
	}
	exigirCodigo(t, a.RevocarClaveWidget(ctx(), otro.ID, c.ID, Base), errores.NoEncontrado, "otro tenant revoca la clave")
	sigue, err := a.BuscarClavePorHash(ctx(), c.Hash)
	sinError(t, err, "la clave sigue")
	if sigue.Revocada {
		t.Fatal("el otro tenant revocó la clave")
	}
	propias, err := a.ListarClavesWidget(ctx(), tn.ID)
	sinError(t, err, "listar claves")
	if len(propias) != 2 || propias[0].Hash != nil {
		t.Fatalf("listado: %+v", propias)
	}
	sinError(t, a.RevocarClaveWidget(ctx(), tn.ID, c.ID, Base.Add(time.Minute)), "revocar clave")
	revocada, err := a.BuscarClavePorHash(ctx(), c.Hash)
	sinError(t, err, "clave revocada")
	if !revocada.Revocada {
		t.Fatal("revocar no marcó la clave")
	}
	exigirCodigo(t, a.RevocarClaveWidget(ctx(), tn.ID, c.ID, Base.Add(time.Minute)), errores.NoEncontrado, "segunda revocación")
	idPub, err := dominio.NuevoIDPublico()
	sinError(t, err, "id público")
	en := dominio.Enlace{IDPublico: idPub, AsesorID: as.ID, CreadoEn: Base}
	sinError(t, a.GuardarEnlace(ctx(), tn.ID, en), "guardar enlace")
	leido, err := a.LeerEnlace(ctx(), tn.ID, idPub)
	sinError(t, err, "leer enlace")
	if leido.AsesorID != as.ID {
		t.Fatalf("enlace: %+v", leido)
	}
	otro = NuevoTenant(t, a)
	_, err = a.LeerEnlace(ctx(), otro.ID, idPub)
	exigirCodigo(t, err, errores.NoEncontrado, "enlace de otro tenant")
	cuando := Base.Add(time.Hour)
	caido := dominio.Enlace{IDPublico: "bbbbbbbbbbbbbbbbbbbbbb", AsesorID: as.ID, CreadoEn: Base, RevocadoEn: &cuando}
	sinError(t, a.GuardarEnlace(ctx(), tn.ID, caido), "guardar enlace revocado")
	_, err = a.LeerEnlace(ctx(), tn.ID, caido.IDPublico)
	exigirCodigo(t, err, errores.NoEncontrado, "enlace revocado")

	idNuevo, err := dominio.NuevoIDPublico()
	sinError(t, err, "id rotado")
	cuandoRot := Base.Add(time.Minute)
	_, err = a.RotarEnlace(ctx(), otro.ID, as.ID, dominio.Enlace{IDPublico: idNuevo, AsesorID: as.ID, CreadoEn: cuandoRot})
	exigirCodigo(t, err, errores.NoEncontrado, "otro tenant rota el enlace")
	enlaceSigue, err := a.LeerEnlace(ctx(), tn.ID, idPub)
	sinError(t, err, "el enlace de A sigue")
	if enlaceSigue.AsesorID != as.ID {
		t.Fatal("el otro tenant revocó el enlace")
	}
	as2 := NuevoAsesor(t, a, tn.ID)
	idAjeno, err := dominio.NuevoIDPublico()
	sinError(t, err, "id del otro asesor")
	sinError(t, a.GuardarEnlace(ctx(), tn.ID, dominio.Enlace{IDPublico: idAjeno, AsesorID: as2.ID, CreadoEn: Base}), "enlace del otro asesor")
	rotado, err := a.RotarEnlace(ctx(), tn.ID, as.ID, dominio.Enlace{IDPublico: idNuevo, AsesorID: as.ID, CreadoEn: cuandoRot})
	sinError(t, err, "rotar")
	if rotado.IDPublico != idNuevo || rotado.AsesorID != as.ID || rotado.RevocadoEn != nil || !rotado.CreadoEn.Equal(dominio.Instante(cuandoRot)) {
		t.Fatalf("enlace rotado: %+v", rotado)
	}
	_, err = a.LeerEnlace(ctx(), tn.ID, idPub)
	exigirCodigo(t, err, errores.NoEncontrado, "el id viejo")
	vigente, err := a.LeerEnlace(ctx(), tn.ID, idNuevo)
	sinError(t, err, "el id nuevo")
	if vigente.AsesorID != as.ID {
		t.Fatal("el id nuevo no es del asesor")
	}
	delOtro, err := a.LeerEnlace(ctx(), tn.ID, idAjeno)
	sinError(t, err, "el enlace del otro asesor")
	if delOtro.AsesorID != as2.ID {
		t.Fatal("la rotación tocó el enlace de otro asesor")
	}
	as3 := NuevoAsesor(t, a, tn.ID)
	idCreado, err := dominio.NuevoIDPublico()
	sinError(t, err, "id creado")
	creado, err := a.RotarEnlace(ctx(), tn.ID, as3.ID, dominio.Enlace{IDPublico: idCreado, AsesorID: as3.ID, CreadoEn: cuandoRot})
	sinError(t, err, "crear al rotar")
	if creado.IDPublico != idCreado || creado.RevocadoEn != nil {
		t.Fatalf("alta: %+v", creado)
	}
	leido, err = a.LeerEnlace(ctx(), tn.ID, idCreado)
	sinError(t, err, "leer el enlace creado")
	if leido.AsesorID != as3.ID {
		t.Fatal("el alta no quedó en el asesor")
	}
}

func probarTokensSesion(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	var hash [32]byte
	sinError(t, leerHash(hash[:]), "hash de token")
	tok := dominio.TokenSesion{Hash: hash[:], SesionID: s.ID, EmitidoEn: Base, VenceEn: Base.Add(time.Hour)}
	sinError(t, a.GuardarTokenSesion(ctx(), tn.ID, tok), "guardar token")
	hall, err := a.BuscarTokenPorHash(ctx(), hash[:])
	sinError(t, err, "buscar token")
	if hall.TenantID != tn.ID || hall.SesionID != s.ID || hall.Revocado || !hall.VenceEn.Equal(Base.Add(time.Hour)) {
		t.Fatalf("token hallado: %+v", hall)
	}
	_, err = a.BuscarTokenPorHash(ctx(), make([]byte, 32))
	exigirCodigo(t, err, errores.NoEncontrado, "hash desconocido")
	_, err = a.BuscarTokenPorHash(ctx(), []byte{1, 2, 3})
	exigirCodigo(t, err, errores.ValidacionFallida, "hash corto")
	exigirCodigo(t, a.GuardarTokenSesion(ctx(), tn.ID, dominio.TokenSesion{
		Hash: []byte{1}, SesionID: s.ID, EmitidoEn: Base, VenceEn: Base.Add(time.Hour),
	}), errores.ValidacionFallida, "token inválido")
	idAjeno, err := dominio.NuevoIDSesion()
	sinError(t, err, "id de sesión ajena")
	var hashAjeno [32]byte
	sinError(t, leerHash(hashAjeno[:]), "hash ajeno")
	exigirCodigo(t, a.GuardarTokenSesion(ctx(), tn.ID, dominio.TokenSesion{
		Hash: hashAjeno[:], SesionID: idAjeno, EmitidoEn: Base, VenceEn: Base.Add(time.Hour),
	}), errores.NoEncontrado, "token de sesión inexistente")
	var hashDup [32]byte
	copy(hashDup[:], hash[:])
	otra := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	exigirCodigo(t, a.GuardarTokenSesion(ctx(), tn.ID, dominio.TokenSesion{
		Hash: hashDup[:], SesionID: otra.ID, EmitidoEn: Base, VenceEn: Base.Add(time.Hour),
	}), errores.EstadoInvalido, "hash duplicado")
	revocada := Base.Add(time.Minute)
	var hashRev [32]byte
	sinError(t, leerHash(hashRev[:]), "hash revocado")
	sinError(t, a.GuardarTokenSesion(ctx(), tn.ID, dominio.TokenSesion{
		Hash: hashRev[:], SesionID: s.ID, EmitidoEn: Base, VenceEn: Base.Add(time.Hour), RevocadoEn: &revocada,
	}), "guardar token revocado")
	hall, err = a.BuscarTokenPorHash(ctx(), hashRev[:])
	sinError(t, err, "buscar revocado")
	if !hall.Revocado {
		t.Fatal("el token revocado tiene que encontrarse marcado")
	}
	corta := NuevaSesion(t, a, tn.ID, as.ID, Base, 1)
	var hashCorta [32]byte
	sinError(t, leerHash(hashCorta[:]), "hash de sesión corta")
	sinError(t, a.GuardarTokenSesion(ctx(), tn.ID, dominio.TokenSesion{
		Hash: hashCorta[:], SesionID: corta.ID, EmitidoEn: Base, VenceEn: Base.Add(time.Hour),
	}), "guardar token de sesión que vence")
	_, err = a.BorrarVencidos(ctx(), tn.ID, Base.AddDate(0, 0, 1))
	sinError(t, err, "borrar la sesión corta")
	_, err = a.BuscarTokenPorHash(ctx(), hashCorta[:])
	exigirCodigo(t, err, errores.NoEncontrado, "el token cae con la sesión")
	hall, err = a.BuscarTokenPorHash(ctx(), hash[:])
	sinError(t, err, "el token de la sesión vigente sigue")
	if hall.SesionID != s.ID {
		t.Fatalf("token vigente: %+v", hall)
	}
}

func probarCupoMedios(t *testing.T, a almacen.Completo) {
	tn := tenantConTope(t, a, 1, 30000)
	as := NuevoAsesor(t, a, tn.ID)
	s1 := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	s2 := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	var hashSesion, hash1, hash2, hashRechazado [32]byte
	sinError(t, leerHash(hashSesion[:]), "hash de sesión")
	sinError(t, a.GuardarTokenSesion(ctx(), tn.ID, dominio.TokenSesion{
		Hash: hashSesion[:], SesionID: s1.ID, EmitidoEn: Base, VenceEn: Base.Add(time.Hour),
	}), "guardar vc_ses_")
	sinError(t, leerHash(hash1[:]), "hash de medios 1")
	_, err := a.ReservarTokenMedios(ctx(), tn.ID, s1.ID, hash1[:], Base)
	exigirCodigo(t, err, errores.ConsentimientoRequerido, "sin consentimiento")
	leida, err := a.LeerSesion(ctx(), tn.ID, s1.ID)
	sinError(t, err, "releer creada")
	igual(t, leida.Estado, dominio.EstadoCreada, "sigue creada")
	_, err = a.BuscarTokenPorHash(ctx(), hash1[:])
	exigirCodigo(t, err, errores.NoEncontrado, "no se guardó el token de medios")

	s1 = consentirSesion(t, a, tn.ID, s1)
	s2 = consentirSesion(t, a, tn.ID, s2)
	reservada, err := a.ReservarTokenMedios(ctx(), tn.ID, s1.ID, hash1[:], Base)
	sinError(t, err, "primera reserva")
	igual(t, reservada.Estado, dominio.EstadoEnCurso, "pasa a en_curso")
	sinError(t, leerHash(hashRechazado[:]), "hash rechazado")
	_, err = a.ReservarTokenMedios(ctx(), tn.ID, s2.ID, hashRechazado[:], Base)
	exigirCodigo(t, err, errores.CuotaAgotada, "segunda simultánea")
	leida, err = a.LeerSesion(ctx(), tn.ID, s2.ID)
	sinError(t, err, "releer la segunda")
	igual(t, leida.Estado, dominio.EstadoConsentida, "la segunda no cambia")
	_, err = a.BuscarTokenPorHash(ctx(), hashRechazado[:])
	exigirCodigo(t, err, errores.NoEncontrado, "el rechazo no guarda HMAC")

	sinError(t, leerHash(hash2[:]), "hash de reconexión")
	otraVez, err := a.ReservarTokenMedios(ctx(), tn.ID, s1.ID, hash2[:], Base.Add(time.Second))
	sinError(t, err, "reconexión")
	igual(t, otraVez.Estado, dominio.EstadoEnCurso, "sigue en_curso")
	viejo, err := a.BuscarTokenPorHash(ctx(), hash1[:])
	sinError(t, err, "token anterior")
	if !viejo.Revocado || viejo.SesionID != s1.ID {
		t.Fatalf("el token anterior tiene que quedar invalidado: %+v", viejo)
	}
	nuevo, err := a.BuscarTokenPorHash(ctx(), hash2[:])
	sinError(t, err, "token nuevo")
	if nuevo.Revocado || nuevo.SesionID != s1.ID || !nuevo.VenceEn.Equal(Base.Add(time.Second).Add(dominio.VigenciaTokenMedios)) {
		t.Fatalf("token vigente: %+v", nuevo)
	}
	sesion, err := a.BuscarTokenPorHash(ctx(), hashSesion[:])
	sinError(t, err, "vc_ses_ intacto")
	if sesion.Revocado {
		t.Fatal("el token de sesión no se revoca al emitir medios")
	}
	_, err = a.ReservarTokenMedios(ctx(), tn.ID, s2.ID, hashRechazado[:], Base)
	exigirCodigo(t, err, errores.CuotaAgotada, "la reconexión no libera cupo")

	cerrada, err := a.CerrarSesion(ctx(), tn.ID, s1.ID, dominio.MotivoClienteCerro, Base.Add(2*time.Second))
	sinError(t, err, "cerrar la primera")
	igual(t, cerrada.Estado, dominio.EstadoCerrada, "cerrada")
	caido, err := a.BuscarTokenPorHash(ctx(), hash2[:])
	sinError(t, err, "medios al cerrar")
	if !caido.Revocado {
		t.Fatal("cerrar tiene que invalidar el token de medios")
	}
	if sesion, err = a.BuscarTokenPorHash(ctx(), hashSesion[:]); err != nil || sesion.Revocado {
		t.Fatalf("cerrar no tiene que revocar el vc_ses_: %v %+v", err, sesion)
	}
	var hash3 [32]byte
	sinError(t, leerHash(hash3[:]), "hash de la segunda")
	segunda, err := a.ReservarTokenMedios(ctx(), tn.ID, s2.ID, hash3[:], Base.Add(3*time.Second))
	sinError(t, err, "la segunda entra al liberar el cupo")
	igual(t, segunda.Estado, dominio.EstadoEnCurso, "segunda en_curso")

	corto := tenantConTope(t, a, 5, 10)
	asCorto := NuevoAsesor(t, a, corto.ID)
	gastada := NuevaSesion(t, a, corto.ID, asCorto.ID, Base, 30)
	gastada = consentirSesion(t, a, corto.ID, gastada)
	_, err = a.CerrarSesion(ctx(), corto.ID, gastada.ID, dominio.MotivoClienteCerro, Base.Add(15*time.Second))
	sinError(t, err, "cerrar con 15 s")
	siguiente := NuevaSesion(t, a, corto.ID, asCorto.ID, Base, 30)
	siguiente = consentirSesion(t, a, corto.ID, siguiente)
	var hashGasto [32]byte
	sinError(t, leerHash(hashGasto[:]), "hash con segundos agotados")
	_, err = a.ReservarTokenMedios(ctx(), corto.ID, siguiente.ID, hashGasto[:], Base.Add(20*time.Second))
	exigirCodigo(t, err, errores.CuotaAgotada, "segundos del mes agotados")
	leida, err = a.LeerSesion(ctx(), corto.ID, siguiente.ID)
	sinError(t, err, "releer sin cupo de segundos")
	igual(t, leida.Estado, dominio.EstadoConsentida, "no cambia si el mes está agotado")
	_, err = a.BuscarTokenPorHash(ctx(), hashGasto[:])
	exigirCodigo(t, err, errores.NoEncontrado, "no se emite token si el mes está agotado")
}

func probarCorteDeLimites(t *testing.T, a almacen.Completo) {
	tn := tenantConTope(t, a, 1, 30000)
	as := NuevoAsesor(t, a, tn.ID)
	muda := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	s1 := consentirSesion(t, a, tn.ID, NuevaSesion(t, a, tn.ID, as.ID, Base, 30))
	s2 := consentirSesion(t, a, tn.ID, NuevaSesion(t, a, tn.ID, as.ID, Base, 30))
	exigirCodigo(t, a.MarcarVoz(ctx(), tn.ID, muda.ID, Base), errores.EstadoInvalido, "voz en creada")

	var hash1, hash2 [32]byte
	sinError(t, leerHash(hash1[:]), "hash 1")
	primera, err := a.ReservarTokenMedios(ctx(), tn.ID, s1.ID, hash1[:], Base)
	sinError(t, err, "entrar")
	igual(t, primera.Estado, dominio.EstadoEnCurso, "en_curso")
	sinError(t, leerHash(hash2[:]), "hash 2")
	_, err = a.ReservarTokenMedios(ctx(), tn.ID, s2.ID, hash2[:], Base)
	exigirCodigo(t, err, errores.CuotaAgotada, "cupo ocupado")

	n, err := a.BarrerLimites(ctx(), tn.ID, Base.Add(19*time.Second), 20, 900)
	sinError(t, err, "antes del silencio")
	igual(t, n, 0, "todavía no cierra")
	sinError(t, a.MarcarVoz(ctx(), tn.ID, s1.ID, Base.Add(19*time.Second)), "voz a los 19 s")
	n, err = a.BarrerLimites(ctx(), tn.ID, Base.Add(20*time.Second), 20, 900)
	sinError(t, err, "20 s con voz reciente")
	igual(t, n, 0, "la voz sostiene la sesión")
	leida, err := a.LeerSesion(ctx(), tn.ID, s1.ID)
	sinError(t, err, "sigue en curso")
	igual(t, leida.Estado, dominio.EstadoEnCurso, "sigue en_curso")

	cierreVoz := Base.Add(39 * time.Second)
	n, err = a.BarrerLimites(ctx(), tn.ID, cierreVoz, 20, 900)
	sinError(t, err, "20 s desde la voz")
	igual(t, n, 1, "cierra por silencio")
	leida, err = a.LeerSesion(ctx(), tn.ID, s1.ID)
	sinError(t, err, "leer sin_voz")
	igual(t, leida.Estado, dominio.EstadoCerrada, "cerrada")
	igual(t, leida.MotivoCierre, dominio.MotivoSinVoz, "sin_voz")
	if leida.CerradaEn == nil || !leida.CerradaEn.Equal(dominio.Instante(cierreVoz)) || leida.DuracionS != 39 {
		t.Fatalf("cierre por silencio: %+v", leida)
	}
	mudaLeida, err := a.LeerSesion(ctx(), tn.ID, muda.ID)
	sinError(t, err, "la creada")
	igual(t, mudaLeida.Estado, dominio.EstadoCreada, "el silencio no cierra la creada")

	inicio := cierreVoz
	segunda, err := a.ReservarTokenMedios(ctx(), tn.ID, s2.ID, hash2[:], inicio)
	sinError(t, err, "el cupo quedó libre")
	igual(t, segunda.Estado, dominio.EstadoEnCurso, "la segunda entra")
	sinError(t, a.MarcarVoz(ctx(), tn.ID, s2.ID, inicio.Add(890*time.Second)), "hubo voz")
	fin := inicio.Add(900 * time.Second)
	n, err = a.BarrerLimites(ctx(), tn.ID, fin, 20, 900)
	sinError(t, err, "duración máxima")
	igual(t, n, 1, "cierra por duración")
	leida, err = a.LeerSesion(ctx(), tn.ID, s2.ID)
	sinError(t, err, "leer duración")
	igual(t, leida.MotivoCierre, dominio.MotivoDuracionMaxima, "duracion_maxima")
	if leida.CerradaEn == nil || !leida.CerradaEn.Equal(dominio.Instante(fin)) {
		t.Fatalf("cerrada_en: %+v", leida.CerradaEn)
	}
	mudaLeida, err = a.LeerSesion(ctx(), tn.ID, muda.ID)
	sinError(t, err, "creada al final")
	igual(t, mudaLeida.Estado, dominio.EstadoCreada, "sigue creada")
	igual(t, mudaLeida.MotivoCierre, dominio.MotivoCierre(""), "sin motivo")
}

func tenantConTope(t *testing.T, a almacen.Almacen, simultaneas, segundos int) dominio.Tenant {
	t.Helper()
	id, err := dominio.NuevoTenantID()
	sinError(t, err, "id de tenant")
	tn := dominio.Tenant{
		ID: id, Nombre: "Cupo", SimultaneasTope: simultaneas, SegundosMesTope: segundos,
		RetencionDias: 90, CreadoEn: Base,
	}
	sinError(t, a.CrearTenant(ctx(), tn), "crear tenant con tope")
	return tn
}

func consentirSesion(t *testing.T, a almacen.Completo, tn dominio.TenantID, s dominio.Sesion) dominio.Sesion {
	t.Helper()
	actual, err := a.RegistrarConsentimiento(ctx(), tn, consentimiento(t, s, Base), Base)
	sinError(t, err, "consentir")
	return actual
}

func probarContacto(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	c := contactoDePrueba(s, as.ID)
	guardado, err := a.RegistrarContacto(ctx(), tn.ID, c, Base)
	sinError(t, err, "registrar contacto")
	if guardado.AsesorID != as.ID || guardado.Telefono != c.Telefono || guardado.Nombre != c.Nombre ||
		!guardado.RegistradoEn.Equal(Base) || !guardado.BorrarDespuesDe.Equal(Base.AddDate(0, 0, tn.RetencionDias)) {
		t.Fatalf("contacto guardado: %+v", guardado)
	}
	leido, err := a.LeerContacto(ctx(), tn.ID, s.ID)
	sinError(t, err, "leer contacto")
	igual(t, leido, guardado, "contacto leído")
	otro := c
	otro.Telefono = "+5492235551999"
	otro.Nombre = "Otra"
	_, err = a.RegistrarContacto(ctx(), tn.ID, otro, Base.Add(time.Minute))
	exigirCodigo(t, err, errores.ContactoYaRegistrado, "segundo contacto")
	leido, err = a.LeerContacto(ctx(), tn.ID, s.ID)
	sinError(t, err, "releer tras el duplicado")
	igual(t, leido, guardado, "el primero sigue")

	sinMedio := c
	sinMedio.Telefono, sinMedio.Email = "", ""
	idNuevo, err := dominio.NuevoIDSesion()
	sinError(t, err, "id")
	s2, err := dominio.NuevaSesion(as.ID, dominio.ModoAvatar3D, Base, 30)
	sinError(t, err, "armar sesión")
	sinError(t, a.CrearSesion(ctx(), tn.ID, s2), "crear sesión")
	sinMedio.SesionID = s2.ID
	_, err = a.RegistrarContacto(ctx(), tn.ID, sinMedio, Base)
	exigirCodigo(t, err, errores.ValidacionFallida, "sin teléfono ni email")
	_, err = a.LeerContacto(ctx(), tn.ID, s2.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "no se guardó el inválido")
	ajeno := c
	ajeno.SesionID = idNuevo
	_, err = a.RegistrarContacto(ctx(), tn.ID, ajeno, Base)
	exigirCodigo(t, err, errores.NoEncontrado, "sesión inexistente")

	cerrada := NuevaSesion(t, a, tn.ID, as.ID, Base, 30)
	_, err = a.CerrarSesion(ctx(), tn.ID, cerrada.ID, dominio.MotivoClienteCerro, Base)
	sinError(t, err, "cerrar")
	deCerrada := contactoDePrueba(cerrada, as.ID)
	deCerrada.Email = "cliente@correo.local"
	deCerrada.Telefono = ""
	deCerrada.Preferencia = "email"
	_, err = a.RegistrarContacto(ctx(), tn.ID, deCerrada, Base)
	sinError(t, err, "contacto de sesión cerrada")

	corta := NuevaSesion(t, a, tn.ID, as.ID, Base, 1)
	_, err = a.RegistrarContacto(ctx(), tn.ID, contactoDePrueba(corta, as.ID), Base)
	sinError(t, err, "contacto de sesión corta")
	_, err = a.BorrarVencidos(ctx(), tn.ID, Base.AddDate(0, 0, 1))
	sinError(t, err, "retención")
	_, err = a.LeerContacto(ctx(), tn.ID, corta.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "el contacto cae con la sesión")
	_, err = a.LeerContacto(ctx(), tn.ID, s.ID)
	sinError(t, err, "el contacto de la sesión vigente sigue")

	otroTenant := NuevoTenant(t, a)
	_, err = a.LeerContacto(ctx(), otroTenant.ID, s.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "otro tenant")
}

func contactoDePrueba(s dominio.Sesion, asesorID string) dominio.Contacto {
	return dominio.Contacto{
		SesionID: s.ID, AsesorID: asesorID, Nombre: "Marta", Telefono: "+5492235551000",
		AvisoVersion: "2026-10-08.1", RegistradoEn: Base, BorrarDespuesDe: Base.AddDate(0, 0, 1),
	}
}

func probarHandshakeMedios(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	pub, err := dominio.NuevoIDClavePublica()
	sinError(t, err, "id de clave pública")
	sec, err := dominio.NuevoIDClaveSecreta()
	sinError(t, err, "id de clave secreta")
	origen := "https://cotizar.videocotizacion.local"
	s := guardarSesionConClave(t, a, tn.ID, as.ID, pub, []string{origen})
	leida, err := a.LeerSesion(ctx(), tn.ID, s.ID)
	sinError(t, err, "leer sesión con origen")
	igual(t, leida.ClaveID, pub, "clave creadora")
	igual(t, leida.Origenes, []string{origen}, "orígenes")
	datos, err := a.BuscarDatosMedios(ctx(), s.ID)
	sinError(t, err, "datos del handshake")
	if datos.TenantID != tn.ID || datos.Estado != dominio.EstadoCreada || datos.ClaveID != pub || len(datos.Origenes) != 1 || datos.Origenes[0] != origen {
		t.Fatalf("datos: %+v", datos)
	}
	secreta := guardarSesionConClave(t, a, tn.ID, as.ID, sec, nil)
	datos, err = a.BuscarDatosMedios(ctx(), secreta.ID)
	sinError(t, err, "datos de la secreta")
	if datos.ClaveID != sec || datos.Origenes != nil {
		t.Fatalf("secreta: %+v", datos)
	}
	_, err = a.BuscarDatosMedios(ctx(), "ses_0000000000000000000000000Z")
	exigirCodigo(t, err, errores.NoEncontrado, "sesión inexistente")

	s = consentirSesion(t, a, tn.ID, s)
	otra := consentirSesion(t, a, tn.ID, guardarSesionConClave(t, a, tn.ID, as.ID, pub, []string{origen}))
	var hash1, hash2, hashLargo [32]byte
	sinError(t, leerHash(hash1[:]), "hash 1")
	sinError(t, leerHash(hash2[:]), "hash 2")
	sinError(t, leerHash(hashLargo[:]), "hash de vc_ses_")
	_, err = a.ReservarTokenMedios(ctx(), tn.ID, s.ID, hash1[:], Base)
	sinError(t, err, "reservar 1")
	_, err = a.ReservarTokenMedios(ctx(), tn.ID, otra.ID, hash2[:], Base)
	sinError(t, err, "reservar 2")
	sinError(t, a.GuardarTokenSesion(ctx(), tn.ID, dominio.TokenSesion{
		Hash: hashLargo[:], SesionID: s.ID, EmitidoEn: Base, VenceEn: Base.Add(time.Hour),
	}), "guardar vc_ses_")

	exigirCodigo(t, a.ConsumirTokenMedios(ctx(), tn.ID, otra.ID, hash1[:], Base), errores.CredencialInvalida, "token de otra sesión")
	hall, err := a.BuscarTokenPorHash(ctx(), hash1[:])
	sinError(t, err, "el ajeno sigue")
	if hall.Revocado || hall.SesionID != s.ID {
		t.Fatalf("se consumió un token ajeno: %+v", hall)
	}
	otroTenant := NuevoTenant(t, a)
	exigirCodigo(t, a.ConsumirTokenMedios(ctx(), otroTenant.ID, s.ID, hash1[:], Base), errores.CredencialInvalida, "token de otro tenant")
	hall, err = a.BuscarTokenPorHash(ctx(), hash1[:])
	sinError(t, err, "el de otro tenant sigue")
	if hall.Revocado {
		t.Fatal("otro tenant consumió el token")
	}
	exigirCodigo(t, a.ConsumirTokenMedios(ctx(), tn.ID, s.ID, hashLargo[:], Base), errores.CredencialInvalida, "vc_ses_ no es de medios")
	largo, err := a.BuscarTokenPorHash(ctx(), hashLargo[:])
	sinError(t, err, "vc_ses_")
	if largo.Revocado {
		t.Fatal("se consumió el token de sesión")
	}

	sinError(t, a.ConsumirTokenMedios(ctx(), tn.ID, s.ID, hash1[:], Base), "consumir")
	hall, err = a.BuscarTokenPorHash(ctx(), hash1[:])
	sinError(t, err, "consumido")
	if !hall.Revocado {
		t.Fatal("el token usado tiene que quedar revocado")
	}
	exigirCodigo(t, a.ConsumirTokenMedios(ctx(), tn.ID, s.ID, hash1[:], Base), errores.CredencialInvalida, "segundo uso")

	var hashVencido [32]byte
	sinError(t, leerHash(hashVencido[:]), "hash vencido")
	_, err = a.ReservarTokenMedios(ctx(), tn.ID, s.ID, hashVencido[:], Base)
	sinError(t, err, "reservar vencible")
	exigirCodigo(t, a.ConsumirTokenMedios(ctx(), tn.ID, s.ID, hashVencido[:], Base.Add(dominio.VigenciaTokenMedios)), errores.CredencialInvalida, "vencido")
	hall, err = a.BuscarTokenPorHash(ctx(), hashVencido[:])
	sinError(t, err, "vencido intacto")
	if hall.Revocado {
		t.Fatal("un token vencido no se consume")
	}
}

func guardarSesionConClave(t *testing.T, a almacen.Completo, tn dominio.TenantID, asesorID, claveID string, origenes []string) dominio.Sesion {
	t.Helper()
	s, err := dominio.NuevaSesion(asesorID, dominio.ModoAvatar3D, Base, 30)
	sinError(t, err, "armar sesión")
	s.ClaveID, s.Origenes = claveID, origenes
	sinError(t, a.CrearSesion(ctx(), tn, s), "crear sesión con clave")
	return s
}

func probarContextoCancelado(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	c, cancelar := context.WithCancel(context.Background())
	cancelar()
	_, err := a.LeerTenant(c, tn.ID)
	exigirCodigo(t, err, errores.ServicioNoDisponible, "contexto cancelado")
}

func probarContrasenaPanel(t *testing.T, a almacen.Completo) {
	tn, otro := NuevoTenant(t, a), NuevoTenant(t, a)
	as, as2 := NuevoAsesor(t, a, tn.ID), NuevoAsesor(t, a, tn.ID)
	const clara = "clave-de-prueba-panel"
	c, err := dominio.NuevaContrasena(as.ID, "Asesor@Prueba.local", clara)
	sinError(t, err, "hash")
	c.CreadaEn = Base
	sinError(t, a.GuardarContrasena(ctx(), tn.ID, c), "guardar contraseña")

	hall, err := a.BuscarContrasenaPorEmail(ctx(), "asesor@prueba.local")
	sinError(t, err, "buscar por email")
	igual(t, hall.TenantID, tn.ID, "tenant del hash")
	igual(t, hall.ContrasenaAsesor, c, "fila del hash")
	if !hall.Coincide(clara) {
		t.Fatal("la contraseña guardada no verifica")
	}
	if hall.Coincide("otra-frase-larga-distinta") {
		t.Fatal("una contraseña distinta no debe verificar")
	}
	_, err = a.BuscarContrasenaPorEmail(ctx(), "nadie@prueba.local")
	exigirCodigo(t, err, errores.NoEncontrado, "email desconocido")
	_, err = a.BuscarContrasenaPorEmail(ctx(), "no")
	exigirCodigo(t, err, errores.ValidacionFallida, "email mal formado")

	leida, err := a.LeerContrasena(ctx(), tn.ID, as.ID)
	sinError(t, err, "leer contraseña")
	igual(t, leida, c, "lectura del dueño")
	_, err = a.LeerContrasena(ctx(), otro.ID, as.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "otro tenant lee el hash")

	c2 := c
	c2.AsesorID = as2.ID
	exigirCodigo(t, a.GuardarContrasena(ctx(), tn.ID, c2), errores.EstadoInvalido, "email repetido")

	var cookie, csrf [32]byte
	sinError(t, leerHash(cookie[:]), "hmac de cookie")
	sinError(t, leerHash(csrf[:]), "hmac de csrf")
	ing := dominio.IngresoPanel{
		AsesorID: as.ID, HashCookie: cookie[:], HashCSRF: csrf[:],
		EmitidaEn: Base, VenceEn: Base.Add(5 * time.Minute),
	}
	sinError(t, a.GuardarIngresoPanel(ctx(), tn.ID, ing), "guardar ingreso")
	leido, err := a.LeerIngresoPanel(ctx(), tn.ID, cookie[:])
	sinError(t, err, "leer ingreso")
	ing.EmitidaEn, ing.VenceEn = dominio.Instante(ing.EmitidaEn), dominio.Instante(ing.VenceEn)
	igual(t, leido, ing, "ingreso")
	_, err = a.LeerIngresoPanel(ctx(), otro.ID, cookie[:])
	exigirCodigo(t, err, errores.NoEncontrado, "otro tenant lee el ingreso")
}

func probarTotpPanel(t *testing.T, a almacen.Completo) {
	A, B := NuevoTenant(t, a), NuevoTenant(t, a)
	asB := NuevoAsesor(t, a, B.ID)
	var secreto [20]byte
	for i := range secreto {
		secreto[i] = byte(i + 1)
	}
	cif, err := dominio.CifrarSecretoTOTP("clave-prueba-totp", secreto[:])
	sinError(t, err, "cifrar secreto")
	guardado := dominio.SecretoTOTP{AsesorID: asB.ID, Cifrado: cif, CreadaEn: Base}
	sinError(t, a.GuardarSecretoTOTP(ctx(), B.ID, guardado), "guardar secreto")
	leido, err := a.LeerSecretoTOTP(ctx(), B.ID, asB.ID)
	sinError(t, err, "leer secreto")
	igual(t, leido, guardado, "secreto del dueño")
	claro, err := dominio.DescifrarSecretoTOTP("clave-prueba-totp", leido.Cifrado)
	sinError(t, err, "descifrar")
	if !bytes.Equal(claro, secreto[:]) {
		t.Fatal("el secreto cifrado no vuelve al claro")
	}
	_, err = a.LeerSecretoTOTP(ctx(), A.ID, asB.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "A lee el secreto de B")

	var hashRec [32]byte
	sinError(t, leerHash(hashRec[:]), "hmac de recuperación")
	sinError(t, a.GuardarCodigoRecuperacion(ctx(), B.ID, dominio.CodigoRecuperacion{
		AsesorID: asB.ID, Hash: hashRec[:], Metodo: dominio.MetodoHMACRecuperacion,
	}), "guardar recuperación")
	lista, err := a.ListarCodigosRecuperacion(ctx(), B.ID, asB.ID)
	sinError(t, err, "listar recuperación")
	if len(lista) != 1 || lista[0].Usado || !bytes.Equal(lista[0].Hash, hashRec[:]) {
		t.Fatalf("recuperación de B: %+v", lista)
	}
	ajena, err := a.ListarCodigosRecuperacion(ctx(), A.ID, asB.ID)
	sinError(t, err, "A lista códigos de B")
	if len(ajena) != 0 {
		t.Fatal("A ve códigos de recuperación de B")
	}

	var cookie, csrf, nuevaCookie, nuevoCSRF [32]byte
	sinError(t, leerHash(cookie[:]), "cookie preliminar")
	sinError(t, leerHash(csrf[:]), "csrf preliminar")
	sinError(t, leerHash(nuevaCookie[:]), "cookie de sesión")
	sinError(t, leerHash(nuevoCSRF[:]), "csrf de sesión")
	ing := dominio.IngresoPanel{
		AsesorID: asB.ID, HashCookie: cookie[:], HashCSRF: csrf[:],
		EmitidaEn: Base, VenceEn: Base.Add(5 * time.Minute), Preliminar: true,
	}
	sinError(t, a.GuardarIngresoPanel(ctx(), B.ID, ing), "cookie preliminar")
	_, err = a.LeerIngresoPanel(ctx(), A.ID, cookie[:])
	exigirCodigo(t, err, errores.NoEncontrado, "A lee la cookie de B")

	codigo := dominio.CodigoTOTP(secreto[:], Base)
	paso, ok := dominio.PasoQueCoincide(secreto[:], codigo, Base)
	if !ok {
		t.Fatal("el código generado no entra en la ventana")
	}
	nueva := dominio.IngresoPanel{
		AsesorID: asB.ID, HashCookie: nuevaCookie[:], HashCSRF: nuevoCSRF[:],
		EmitidaEn: Base, VenceEn: Base.Add(12 * time.Hour), VenceInactividad: Base.Add(30 * time.Minute),
	}
	sinError(t, a.AbrirSesionPanel(ctx(), B.ID, dominio.AperturaPanel{
		HashPrevio: cookie[:], Paso: &paso, Nueva: nueva, Ahora: Base,
	}), "abrir sesión")
	vieja, err := a.LeerIngresoPanel(ctx(), B.ID, cookie[:])
	sinError(t, err, "leer cookie vieja")
	if vieja.RevocadaEn == nil || !vieja.Preliminar {
		t.Fatal("la cookie preliminar sigue vigente")
	}
	exigirCodigo(t, a.OtorgarReautenticacion(ctx(), A.ID, nuevaCookie[:], paso+10, Base.Add(5*time.Minute), Base), errores.SesionVencida, "A reautentica la sesión de B")
	exigirCodigo(t, a.OtorgarReautenticacion(ctx(), B.ID, nuevaCookie[:], paso, Base.Add(5*time.Minute), Base), errores.TotpInvalido, "el paso del login no se reusa")
	sinError(t, a.OtorgarReautenticacion(ctx(), B.ID, nuevaCookie[:], paso+10, Base.Add(5*time.Minute), Base), "otorgar reautenticación")
	otorgada, err := a.LeerIngresoPanel(ctx(), B.ID, nuevaCookie[:])
	sinError(t, err, "leer sesión otorgada")
	fin := dominio.Instante(Base.Add(5 * time.Minute))
	if otorgada.ReautenticadoHasta == nil || !otorgada.ReautenticadoHasta.Equal(fin) {
		t.Fatalf("valida_hasta %v", otorgada.ReautenticadoHasta)
	}
	if !otorgada.VenceEn.Equal(dominio.Instante(Base.Add(12*time.Hour))) || !otorgada.VenceInactividad.Equal(dominio.Instante(Base.Add(30*time.Minute))) {
		t.Fatal("la reautenticación movió los vencimientos")
	}
	const viejaClara = "clave-vieja-panel-ok"
	emailB := strings.ToLower(asB.ID) + "@prueba.local"
	hashViejo, err := dominio.NuevaContrasena(asB.ID, emailB, viejaClara)
	sinError(t, err, "hash viejo")
	hashViejo.CreadaEn = Base
	sinError(t, a.GuardarContrasena(ctx(), B.ID, hashViejo), "guardar contraseña de B")
	asC := NuevoAsesor(t, a, B.ID)
	var cookieHermana, csrfHermana, cookieC, csrfC [32]byte
	sinError(t, leerHash(cookieHermana[:]), "otra cookie de B")
	sinError(t, leerHash(csrfHermana[:]), "otro csrf de B")
	sinError(t, leerHash(cookieC[:]), "cookie de C")
	sinError(t, leerHash(csrfC[:]), "csrf de C")
	sinError(t, a.GuardarIngresoPanel(ctx(), B.ID, dominio.IngresoPanel{
		AsesorID: asB.ID, HashCookie: cookieHermana[:], HashCSRF: csrfHermana[:],
		EmitidaEn: Base, VenceEn: Base.Add(12 * time.Hour), VenceInactividad: Base.Add(30 * time.Minute),
	}), "segunda sesión de B")
	sinError(t, a.GuardarIngresoPanel(ctx(), B.ID, dominio.IngresoPanel{
		AsesorID: asC.ID, HashCookie: cookieC[:], HashCSRF: csrfC[:],
		EmitidaEn: Base, VenceEn: Base.Add(12 * time.Hour), VenceInactividad: Base.Add(30 * time.Minute),
	}), "sesión de C")
	hashNuevo, err := dominio.NuevaContrasena(asB.ID, emailB, "clave-nueva-panel-ok")
	sinError(t, err, "hash nuevo")
	hashNuevo.CreadaEn = Base
	exigirCodigo(t, a.CambiarContrasena(ctx(), A.ID, nuevaCookie[:], hashNuevo, Base), errores.SesionVencida, "A cambia la contraseña de B")
	sinCambio, err := a.LeerContrasena(ctx(), B.ID, asB.ID)
	sinError(t, err, "la contraseña de B sigue")
	if !sinCambio.Coincide(viejaClara) || sinCambio.Coincide("clave-nueva-panel-ok") {
		t.Fatal("A reemplazó el hash de B")
	}
	sinError(t, a.CambiarContrasena(ctx(), B.ID, nuevaCookie[:], hashNuevo, Base), "B cambia su contraseña")
	cambiada, err := a.LeerContrasena(ctx(), B.ID, asB.ID)
	sinError(t, err, "leer hash nuevo")
	if !cambiada.Coincide("clave-nueva-panel-ok") || cambiada.Coincide(viejaClara) || cambiada.Email != hashViejo.Email {
		t.Fatal("el hash nuevo no reemplazó al viejo")
	}
	revocada, err := a.LeerIngresoPanel(ctx(), B.ID, cookieHermana[:])
	sinError(t, err, "leer la otra sesión")
	if revocada.RevocadaEn == nil {
		t.Fatal("la otra sesión de B sigue vigente")
	}
	deC, err := a.LeerIngresoPanel(ctx(), B.ID, cookieC[:])
	sinError(t, err, "leer la sesión de C")
	if deC.RevocadaEn != nil {
		t.Fatal("el cambio de B revocó la sesión de C")
	}
	propia, err := a.LeerIngresoPanel(ctx(), B.ID, nuevaCookie[:])
	sinError(t, err, "leer la sesión que cambió")
	if propia.RevocadaEn != nil || propia.ReautenticadoHasta != nil || !propia.VenceEn.Equal(dominio.Instante(Base.Add(12*time.Hour))) {
		t.Fatal("la sesión actual no quedó como estaba, sin ventana")
	}
	exigirCodigo(t, a.CerrarSesionPanel(ctx(), A.ID, nuevaCookie[:], Base), errores.SesionVencida, "A cierra la sesión de B")
	abierta, err := a.LeerIngresoPanel(ctx(), B.ID, nuevaCookie[:])
	sinError(t, err, "la sesión de B sigue")
	if abierta.RevocadaEn != nil || abierta.Preliminar {
		t.Fatal("A revocó la sesión de B")
	}
	sinError(t, a.CerrarSesionPanel(ctx(), B.ID, nuevaCookie[:], Base), "B cierra su sesión")
	cerrada, err := a.LeerIngresoPanel(ctx(), B.ID, nuevaCookie[:])
	sinError(t, err, "leer sesión cerrada")
	if cerrada.RevocadaEn == nil {
		t.Fatal("cerrar no invalidó la sesión")
	}
	exigirCodigo(t, a.CerrarSesionPanel(ctx(), B.ID, nuevaCookie[:], Base), errores.SesionVencida, "segundo cierre")
	exigirCodigo(t, a.AbrirSesionPanel(ctx(), A.ID, dominio.AperturaPanel{
		HashPrevio: cookie[:], Paso: &paso, Nueva: nueva, Ahora: Base,
	}), errores.SesionVencida, "A abre la sesión de B")

	var cookie2, csrf2, otraCookie [32]byte
	sinError(t, leerHash(cookie2[:]), "segunda cookie")
	sinError(t, leerHash(csrf2[:]), "segundo csrf")
	sinError(t, leerHash(otraCookie[:]), "otra sesión")
	sinError(t, a.GuardarIngresoPanel(ctx(), B.ID, dominio.IngresoPanel{
		AsesorID: asB.ID, HashCookie: cookie2[:], HashCSRF: csrf2[:],
		EmitidaEn: Base, VenceEn: Base.Add(5 * time.Minute), Preliminar: true,
	}), "segunda preliminar")
	exigirCodigo(t, a.CerrarSesionPanel(ctx(), B.ID, cookie2[:], Base), errores.SesionVencida, "cerrar la preliminar")
	otra := nueva
	otra.HashCookie = otraCookie[:]
	exigirCodigo(t, a.AbrirSesionPanel(ctx(), B.ID, dominio.AperturaPanel{
		HashPrevio: cookie2[:], Paso: &paso, Nueva: otra, Ahora: Base,
	}), errores.TotpInvalido, "reuso del paso")
	sigue, err := a.LeerIngresoPanel(ctx(), B.ID, cookie2[:])
	sinError(t, err, "la segunda cookie")
	if sigue.RevocadaEn != nil {
		t.Fatal("un código reusado revocó la cookie")
	}
}

func probarExportacionCuenta(t *testing.T, a almacen.Completo) {
	A, B := NuevoTenant(t, a), NuevoTenant(t, a)
	asA, asB := NuevoAsesor(t, a, A.ID), NuevoAsesor(t, a, B.ID)
	cons := dominio.ConsentimientoAsesor{AsesorID: asA.ID, Version: "2026-10-08.1", AceptadoEn: Base}
	sinError(t, a.GuardarConsentimientoAsesor(ctx(), A.ID, cons), "guardar consentimiento")
	leido, err := a.LeerConsentimientoAsesor(ctx(), A.ID, asA.ID)
	sinError(t, err, "leer consentimiento")
	igual(t, leido.Version, "2026-10-08.1", "versión")
	if !leido.AceptadoEn.Equal(dominio.Instante(Base)) {
		t.Fatalf("aceptado_en: %s", leido.AceptadoEn)
	}
	_, err = a.LeerConsentimientoAsesor(ctx(), B.ID, asA.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "B lee el consentimiento de A")
	exigirCodigo(t, a.GuardarConsentimientoAsesor(ctx(), A.ID, cons), errores.EstadoInvalido, "segundo consentimiento")

	id, err := dominio.NuevoIDRegistro()
	sinError(t, err, "id de lectura")
	lec := dominio.Lectura{
		ID: id, OcurridoEn: Base, AsesorID: asA.ID, Accion: dominio.AccionExportarMiCuenta, RecursoID: asA.ID,
	}
	sinError(t, a.AnexarLectura(ctx(), A.ID, lec), "anexar lectura")
	ajenas, err := a.ListarLecturasDelAsesor(ctx(), B.ID, asB.ID)
	sinError(t, err, "lecturas de B")
	if len(ajenas) != 0 {
		t.Fatalf("B ve lecturas de A: %+v", ajenas)
	}
	propias, err := a.ListarLecturasDelAsesor(ctx(), A.ID, asA.ID)
	sinError(t, err, "lecturas de A")
	if len(propias) != 1 || propias[0].ID != id || propias[0].Accion != dominio.AccionExportarMiCuenta {
		t.Fatalf("lecturas: %+v", propias)
	}

	asA2 := NuevoAsesor(t, a, A.ID)
	suya := NuevaSesion(t, a, A.ID, asA2.ID, Base, 30)
	_, err = a.RegistrarContacto(ctx(), A.ID, dominio.Contacto{
		SesionID: suya.ID, Nombre: "Cliente Ajeno", Telefono: "+5492235557777", AvisoVersion: "2026-10-08.1",
	}, Base)
	sinError(t, err, "contacto ajeno")
	idAjena, err := dominio.NuevoIDRegistro()
	sinError(t, err, "id de lectura ajena")
	sinError(t, a.AnexarLectura(ctx(), A.ID, dominio.Lectura{
		ID: idAjena, OcurridoEn: Base.Add(time.Minute), AsesorID: asA2.ID,
		Accion: dominio.AccionVerContacto, RecursoID: suya.ID,
	}), "lectura del otro asesor")
	propias, err = a.ListarLecturasDelAsesor(ctx(), A.ID, asA.ID)
	sinError(t, err, "A después del contacto ajeno")
	if len(propias) != 1 || propias[0].ID != id {
		t.Fatalf("A vio la lectura ajena: %+v", propias)
	}
	mia := NuevaSesion(t, a, A.ID, asA.ID, Base, 30)
	idSesion, err := dominio.NuevoIDRegistro()
	sinError(t, err, "id de lectura de la sesión")
	sinError(t, a.AnexarLectura(ctx(), A.ID, dominio.Lectura{
		ID: idSesion, OcurridoEn: Base.Add(2 * time.Minute), AsesorID: asA2.ID,
		Accion: dominio.AccionVerDetalle, RecursoID: mia.ID,
	}), "lectura de la sesión de A")
	propias, err = a.ListarLecturasDelAsesor(ctx(), A.ID, asA.ID)
	sinError(t, err, "lecturas de la sesión de A")
	if len(propias) != 2 {
		t.Fatalf("la sesión de A no trajo su lectura: %+v", propias)
	}
	consumo, err := a.ConsumoDelAsesor(ctx(), A.ID, asA.ID, Base)
	sinError(t, err, "consumo")
	if consumo.SegundosUsados != 0 || consumo.SegundosTope != 30000 || consumo.SimultaneasEnCurso != 0 || consumo.SimultaneasTope != 5 {
		t.Fatalf("consumo: %+v", consumo)
	}
	consumoB, err := a.ConsumoDelAsesor(ctx(), B.ID, asB.ID, Base)
	sinError(t, err, "consumo de B")
	if consumoB.SegundosUsados != 0 {
		t.Fatalf("B cuenta segundos de A: %+v", consumoB)
	}
}
