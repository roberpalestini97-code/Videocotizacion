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

	// Consumo: duración del mes y activas (consentidas o en curso) en la ventana.
	viejo := NuevaSesion(t, a, tn.ID, as.ID, Base.AddDate(0, -1, 0), 90)
	_, err = a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, viejo, viejo.CreadaEn), viejo.CreadaEn)
	sinError(t, err, "consentir vieja")
	_, err = a.CerrarSesion(ctx(), tn.ID, viejo.ID, dominio.MotivoCompletada, viejo.CreadaEn.Add(10*time.Minute))
	sinError(t, err, "cerrar vieja")
	cerrada := NuevaSesion(t, a, tn.ID, as.ID, Base, 90)
	_, err = a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, cerrada, Base), Base)
	sinError(t, err, "consentir")
	_, err = a.CerrarSesion(ctx(), tn.ID, cerrada.ID, dominio.MotivoCompletada, Base.Add(125*time.Second))
	sinError(t, err, "cerrar")
	activa := NuevaSesion(t, a, tn.ID, as.ID, Base.Add(time.Minute), 90)
	_, err = a.RegistrarConsentimiento(ctx(), tn.ID, consentimiento(t, activa, Base.Add(time.Minute)), Base.Add(time.Minute))
	sinError(t, err, "consentir activa")
	inicioMes := time.Date(2026, 10, 1, 3, 0, 0, 0, time.UTC)
	c, err := a.Consumo(ctx(), tn.ID, inicioMes, Base)
	sinError(t, err, "consumo")
	igual(t, c, dominio.Consumo{SegundosMes: 125, Activas: 1}, "consumo del mes")
	c, err = a.Consumo(ctx(), tn.ID, inicioMes, Base.Add(2*time.Minute))
	sinError(t, err, "consumo con ventana corta")
	igual(t, c.Activas, 0, "activa fuera de la ventana")
	c, err = a.Consumo(ctx(), otro.ID, inicioMes, Base)
	sinError(t, err, "consumo de otro tenant")
	igual(t, c, dominio.Consumo{}, "otro tenant no ve el consumo")

	// Derivación: idempotente, código único por tenant, sesión ajena → 404.
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
