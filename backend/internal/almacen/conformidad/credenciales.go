package conformidad

import (
	"crypto/rand"
	"testing"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// HashAleatorio simula un HMAC de 32 bytes (las pruebas del almacén no
// necesitan la clave del servidor).
func HashAleatorio(t testing.TB) []byte {
	t.Helper()
	h := make([]byte, 32)
	if _, err := rand.Read(h); err != nil {
		t.Fatal(err)
	}
	return h
}

// NuevaClave arma una clave de API de prueba (sin guardarla).
func NuevaClave(t testing.TB, tipo dominio.TipoClave, origenes ...string) dominio.ClaveAPI {
	t.Helper()
	id, err := dominio.NuevoIDClave(tipo)
	if err != nil {
		t.Fatal(err)
	}
	prefijo := "vc_sec_abcd"
	if tipo == dominio.ClavePublica {
		prefijo = "vc_pub_abcd"
	}
	return dominio.ClaveAPI{ID: id, Tipo: tipo, Hash: HashAleatorio(t), Prefijo: prefijo, Origenes: origenes, CreadaEn: Base}
}

// NuevoIDPublico genera un id_publico de 22 caracteres (prueba).
func NuevoIDPublico(t testing.TB) string {
	t.Helper()
	id, err := dominio.NuevoIDSesion()
	if err != nil {
		t.Fatal(err)
	}
	return id[4:26] // 22 caracteres Crockford (alfabeto válido para el patrón)
}

func token(t *testing.T, s dominio.Sesion) dominio.TokenSesion {
	return dominio.TokenSesion{Hash: HashAleatorio(t), SesionID: s.ID, EmitidoEn: Base, VenceEn: Base.Add(2 * time.Hour)}
}

func probarClavesYEnlaces(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	otro := NuevoTenant(t, a)
	sec := NuevaClave(t, dominio.ClaveSecreta)
	pub := NuevaClave(t, dominio.ClavePublica, "https://cotizar.ejemplo.com")
	sinError(t, a.CrearClaveAPI(ctx(), tn.ID, sec), "crear secreta")
	sinError(t, a.CrearClaveAPI(ctx(), tn.ID, pub), "crear pública")
	repetida := NuevaClave(t, dominio.ClaveSecreta)
	repetida.Hash = pub.Hash
	exigirCodigo(t, a.CrearClaveAPI(ctx(), otro.ID, repetida), errores.EstadoInvalido, "hash repetido entre tenants")
	sinOrigen := NuevaClave(t, dominio.ClavePublica)
	exigirCodigo(t, a.CrearClaveAPI(ctx(), tn.ID, sinOrigen), errores.ValidacionFallida, "pública sin Origin")

	tid, c, err := a.BuscarClaveAPI(ctx(), pub.Hash)
	sinError(t, err, "buscar pública")
	igual(t, tid, tn.ID, "tenant de la credencial")
	igual(t, c, pub, "clave leída")
	_, _, err = a.BuscarClaveAPI(ctx(), HashAleatorio(t))
	exigirCodigo(t, err, errores.NoEncontrado, "hash desconocido")
	_, _, err = a.BuscarClaveAPI(ctx(), []byte("corto"))
	exigirCodigo(t, err, errores.NoEncontrado, "hash de largo inválido")

	exigirCodigo(t, a.RevocarClaveAPI(ctx(), otro.ID, sec.ID, Base), errores.NoEncontrado, "revocar clave de otro tenant")
	sinError(t, a.RevocarClaveAPI(ctx(), tn.ID, sec.ID, Base.Add(time.Minute)), "revocar")
	sinError(t, a.RevocarClaveAPI(ctx(), tn.ID, sec.ID, Base.Add(time.Hour)), "revocar de nuevo (idempotente)")
	_, c, err = a.BuscarClaveAPI(ctx(), sec.Hash)
	sinError(t, err, "buscar revocada")
	if c.RevocadaEn == nil || !c.RevocadaEn.Equal(Base.Add(time.Minute)) {
		t.Fatalf("revocada_en = %v", c.RevocadaEn)
	}

	as := NuevoAsesor(t, a, tn.ID)
	asOtro := NuevoAsesor(t, a, otro.ID)
	e := dominio.Enlace{IDPublico: NuevoIDPublico(t), AsesorID: as.ID, CreadoEn: Base}
	sinError(t, a.CrearEnlace(ctx(), tn.ID, e), "crear enlace")
	exigirCodigo(t, a.CrearEnlace(ctx(), tn.ID, e), errores.EstadoInvalido, "enlace repetido")
	ajeno := dominio.Enlace{IDPublico: NuevoIDPublico(t), AsesorID: asOtro.ID, CreadoEn: Base}
	exigirCodigo(t, a.CrearEnlace(ctx(), tn.ID, ajeno), errores.NoEncontrado, "enlace con asesor de otro tenant")
	got, err := a.LeerEnlace(ctx(), tn.ID, e.IDPublico)
	sinError(t, err, "leer enlace")
	igual(t, got, e, "enlace leído")
	_, err = a.LeerEnlace(ctx(), otro.ID, e.IDPublico)
	exigirCodigo(t, err, errores.NoEncontrado, "enlace de otro tenant")
}

func probarTokensConsumoYDerivacion(t *testing.T, a almacen.Completo) {
	tn := NuevoTenant(t, a)
	otro := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	s, err := dominio.NuevaSesion(as.ID, dominio.ModoAvatarClips, Base, 10)
	sinError(t, err, "armar sesión")
	tok := token(t, s)
	sinError(t, a.CrearSesionConToken(ctx(), tn.ID, s, tok), "crear sesión con token")
	// Atomicidad: con un hash repetido no queda la sesión nueva.
	s2, _ := dominio.NuevaSesion(as.ID, dominio.ModoAvatar3D, Base, 10)
	tok2 := token(t, s2)
	tok2.Hash = tok.Hash
	exigirCodigo(t, a.CrearSesionConToken(ctx(), tn.ID, s2, tok2), errores.EstadoInvalido, "token repetido")
	_, err = a.LeerSesion(ctx(), tn.ID, s2.ID)
	exigirCodigo(t, err, errores.NoEncontrado, "la sesión no debe quedar si falla el token")
	exigirCodigo(t, a.CrearSesionConToken(ctx(), tn.ID, s2, token(t, s)), errores.ValidacionFallida, "token de otra sesión")

	tid, got, err := a.BuscarTokenSesion(ctx(), tok.Hash)
	sinError(t, err, "buscar token")
	igual(t, tid, tn.ID, "tenant del token")
	igual(t, got, tok, "token leído")
	exigirCodigo(t, a.RevocarTokensDeSesion(ctx(), otro.ID, s.ID, Base), errores.NoEncontrado, "revocar tokens de otro tenant")
	sinError(t, a.RevocarTokensDeSesion(ctx(), tn.ID, s.ID, Base.Add(time.Minute)), "revocar tokens")
	_, got, _ = a.BuscarTokenSesion(ctx(), tok.Hash)
	if got.Vigente(Base.Add(2*time.Minute)) || got.RevocadoEn == nil {
		t.Fatalf("token revocado sigue vigente: %+v", got)
	}

	// Derivación: idempotente, código único por tenant, sesión ajena → 404.
	cerrada := NuevaSesion(t, a, tn.ID, as.ID, Base, 90)
	activa := NuevaSesion(t, a, tn.ID, as.ID, Base, 90)
	d := dominio.Derivacion{SesionID: cerrada.ID, CodigoReferencia: "VC-AAAA-BBBBBB", GeneradaEn: Base}
	got1, err := a.ObtenerDerivacion(ctx(), tn.ID, d)
	sinError(t, err, "derivación")
	igual(t, got1, d, "derivación guardada")
	otraVez := d
	otraVez.CodigoReferencia, otraVez.GeneradaEn = "VC-CCCC-DDDDDD", Base.Add(time.Hour)
	got2, err := a.ObtenerDerivacion(ctx(), tn.ID, otraVez)
	sinError(t, err, "derivación de nuevo")
	igual(t, got2, d, "la segunda vez devuelve la primera")
	choca := dominio.Derivacion{SesionID: activa.ID, CodigoReferencia: d.CodigoReferencia, GeneradaEn: Base}
	_, err = a.ObtenerDerivacion(ctx(), tn.ID, choca)
	exigirCodigo(t, err, errores.EstadoInvalido, "código repetido en el tenant")
	_, err = a.ObtenerDerivacion(ctx(), otro.ID, d)
	exigirCodigo(t, err, errores.NoEncontrado, "derivación de sesión de otro tenant")

	// Retención: token y derivación caen con su sesión.
	_, err = a.BorrarVencidos(ctx(), tn.ID, Base.AddDate(0, 0, 10))
	sinError(t, err, "retención")
	_, _, err = a.BuscarTokenSesion(ctx(), tok.Hash)
	exigirCodigo(t, err, errores.NoEncontrado, "token de sesión borrada")
	_, err = a.BorrarVencidos(ctx(), tn.ID, Base.AddDate(0, 0, 91))
	sinError(t, err, "retención 2")
	_, err = a.ObtenerDerivacion(ctx(), tn.ID, d)
	exigirCodigo(t, err, errores.NoEncontrado, "derivación de sesión borrada")
}

// probarConsumoYReservas: contadores (H2) y reserva atómica con recorte (H3).
// Los topes globales del almacén tienen que ser holgados (los fija quien
// llama a Correr).
func probarConsumoYReservas(t *testing.T, a almacen.Completo) {
	tn := NuevoTenantConTopes(t, a, 2000, 1)
	otro := NuevoTenant(t, a)
	as := NuevoAsesor(t, a, tn.ID)
	mes := dominio.MesCuota(Base)
	consentida := func(cuando time.Time) dominio.Sesion {
		s := NuevaSesion(t, a, tn.ID, as.ID, cuando, 90)
		_, err := a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, s, cuando), cuando)
		sinError(t, err, "consentir")
		return s
	}
	leer := func(cuando time.Time) dominio.EstadoCupo {
		e, err := a.Cupo(ctx(), tn.ID, as.ID, mes, cuando)
		sinError(t, err, "cupo")
		return e
	}
	e := leer(Base)
	igual(t, e, dominio.EstadoCupo{TopeSegundosTenant: 2000, TopeSimultaneasTenant: 1}, "cupo inicial")

	// Reserva de 900 s: en_curso, descuenta del saldo y ocupa el lugar.
	s1 := consentida(Base)
	r, err := a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s1.ID, Ahora: Base.Add(time.Minute), SegundosMax: 900})
	sinError(t, err, "reservar")
	quiero := dominio.Reserva{SesionID: s1.ID, AsesorID: as.ID, Mes: mes, Segundos: 900, CreadaEn: dominio.Instante(Base.Add(time.Minute)),
		VenceEn: dominio.Instante(Base.Add(time.Minute + 900*time.Second + dominio.MargenReserva))}
	igual(t, r, dominio.ResultadoReserva{Reserva: quiero}, "reserva")
	ses, _ := a.LeerSesion(ctx(), tn.ID, s1.ID)
	igual(t, ses.Estado, dominio.EstadoEnCurso, "la reserva pasa la sesión a en_curso")
	e = leer(Base.Add(2 * time.Minute))
	igual(t, e.Tenant, dominio.Contador{SegundosReservados: 900}, "reservados del tenant")
	igual(t, e.Asesor, dominio.Contador{SegundosReservados: 900}, "reservados del asesor")
	igual(t, [2]int{e.ActivasTenant, e.ActivasAsesor}, [2]int{1, 1}, "activas")
	exigirCodigo(t, e.Verificar(), errores.SimultaneasAgotadas, "crearSesion vería el lugar ocupado")
	// Reconexión: la misma reserva, sin volver a contar.
	r2, err := a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s1.ID, Ahora: Base.Add(5 * time.Minute), SegundosMax: 900})
	sinError(t, err, "reconectar")
	igual(t, r2, dominio.ResultadoReserva{Reserva: quiero, Reutilizada: true}, "reconexión")
	igual(t, leer(Base.Add(5*time.Minute)).Tenant.SegundosReservados, int64(900), "sin doble reserva")
	// Otra sesión sin lugar libre → simultáneas; no cambia su estado.
	s2 := consentida(Base)
	_, err = a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s2.ID, Ahora: Base.Add(6 * time.Minute), SegundosMax: 900})
	exigirCodigo(t, err, errores.SimultaneasAgotadas, "sin lugar")
	ses, _ = a.LeerSesion(ctx(), tn.ID, s2.ID)
	igual(t, ses.Estado, dominio.EstadoConsentida, "rechazada no cambia el estado")
	// Cerrar libera: cobra lo real (8 min = 480 s), devuelve el resto.
	_, err = a.CerrarSesion(ctx(), tn.ID, s1.ID, dominio.MotivoCompletada, Base.Add(9*time.Minute))
	sinError(t, err, "cerrar")
	e = leer(Base.Add(9 * time.Minute))
	igual(t, e.Tenant, dominio.Contador{SegundosUsados: 480}, "usados del tenant")
	igual(t, e.Asesor, dominio.Contador{SegundosUsados: 480}, "usados del asesor")
	igual(t, e.ActivasTenant, 0, "libera el lugar")
	// Saldo 1520 ≥ 900: reserva completa; después saldo 620: recorte.
	r, err = a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s2.ID, Ahora: Base.Add(10 * time.Minute), SegundosMax: 900})
	sinError(t, err, "reservar s2")
	igual(t, [2]any{r.Reserva.Segundos, r.Reserva.Recortada}, [2]any{900, false}, "reserva completa")
	_, err = a.CerrarSesion(ctx(), tn.ID, s2.ID, dominio.MotivoClienteCerro, Base.Add(10*time.Minute).Add(900*time.Second))
	sinError(t, err, "cerrar s2")
	s3 := consentida(Base)
	r, err = a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s3.ID, Ahora: Base.Add(30 * time.Minute), SegundosMax: 900})
	sinError(t, err, "reservar recortada")
	igual(t, [2]any{r.Reserva.Segundos, r.Reserva.Recortada}, [2]any{2000 - 480 - 900, true}, "reserva recortada al saldo")
	// La reserva vence sin cerrarse: al reconectar se cobra completa y la sesión cierra por cuota.
	r, err = a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s3.ID, Ahora: r.Reserva.VenceEn, SegundosMax: 900})
	sinError(t, err, "reconectar vencida")
	if !r.Vencida {
		t.Fatalf("reserva vencida: %+v", r)
	}
	ses, _ = a.LeerSesion(ctx(), tn.ID, s3.ID)
	igual(t, [2]any{ses.Estado, ses.MotivoCierre}, [2]any{dominio.EstadoCerrada, dominio.MotivoCuotaAgotada}, "vencida cierra la sesión")
	e = leer(Base.Add(time.Hour))
	igual(t, e.Tenant, dominio.Contador{SegundosUsados: 2000}, "la vencida se cobra completa")
	exigirCodigo(t, e.Verificar(), errores.CuotaAgotada, "sin saldo")
	s4 := consentida(Base)
	_, err = a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s4.ID, Ahora: Base.Add(time.Hour), SegundosMax: 900})
	exigirCodigo(t, err, errores.CuotaAgotada, "saldo < 60 s")

	_, err = a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: s1.ID, Ahora: Base, SegundosMax: 900})
	exigirCodigo(t, err, errores.SesionCerrada, "reservar sesión cerrada")
	_, err = a.ReservarCupo(ctx(), otro.ID, dominio.PedidoReserva{SesionID: s4.ID, Ahora: Base, SegundosMax: 900})
	exigirCodigo(t, err, errores.NoEncontrado, "reservar sesión de otro tenant")
	nueva := NuevaSesion(t, a, tn.ID, as.ID, Base, 90)
	_, err = a.ReservarCupo(ctx(), tn.ID, dominio.PedidoReserva{SesionID: nueva.ID, Ahora: Base, SegundosMax: 900})
	exigirCodigo(t, err, errores.ConsentimientoRequerido, "reservar sin consentimiento")
	_, err = a.Cupo(ctx(), otro.ID, as.ID, mes, Base)
	exigirCodigo(t, err, errores.NoEncontrado, "cupo con asesor de otro tenant")

	// La retención (y el ARCO) no tocan los contadores (H2).
	_, err = a.BorrarVencidos(ctx(), tn.ID, Base.AddDate(0, 0, 200))
	sinError(t, err, "retención total")
	igual(t, leer(Base.Add(time.Hour)).Tenant, dominio.Contador{SegundosUsados: 2000}, "el contador sobrevive a la retención")

	// Tope propio del asesor: cuenta aparte del tenant (el mismo código).
	tn2 := NuevoTenantConTopes(t, a, 100000, 10)
	topeS, topeSim := int64(900), 1
	as2 := NuevoAsesorConTopes(t, a, tn2.ID, &topeS, &topeSim)
	sa := NuevaSesion(t, a, tn2.ID, as2.ID, Base, 90)
	_, err = a.RegistrarConsentimiento(ctx(), tn2.ID, consentimiento(t, sa, Base), Base)
	sinError(t, err, "consentir a")
	sb := NuevaSesion(t, a, tn2.ID, as2.ID, Base, 90)
	_, err = a.RegistrarConsentimiento(ctx(), tn2.ID, consentimiento(t, sb, Base), Base)
	sinError(t, err, "consentir b")
	_, err = a.ReservarCupo(ctx(), tn2.ID, dominio.PedidoReserva{SesionID: sa.ID, Ahora: Base, SegundosMax: 900})
	sinError(t, err, "reservar con tope del asesor")
	_, err = a.ReservarCupo(ctx(), tn2.ID, dominio.PedidoReserva{SesionID: sb.ID, Ahora: Base, SegundosMax: 600})
	exigirCodigo(t, err, errores.CuotaAgotada, "saldo del asesor agotado")
	_, err = a.CerrarSesion(ctx(), tn2.ID, sa.ID, dominio.MotivoCompletada, Base.Add(2*time.Minute))
	sinError(t, err, "cerrar a")
	r, err = a.ReservarCupo(ctx(), tn2.ID, dominio.PedidoReserva{SesionID: sb.ID, Ahora: Base.Add(3 * time.Minute), SegundosMax: 900})
	sinError(t, err, "reservar con saldo del asesor")
	igual(t, [2]any{r.Reserva.Segundos, r.Reserva.Recortada}, [2]any{900 - 120, true}, "recorte por el tope del asesor")
}
