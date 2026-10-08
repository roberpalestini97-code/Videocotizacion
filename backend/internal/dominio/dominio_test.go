package dominio

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"testing"
	"time"

	"videocotizacion/backend/internal/errores"
)

var t0 = time.Date(2026, 10, 8, 13, 0, 0, 123456789, time.UTC)

func enumDelContrato(t *testing.T, archivo string, puntero ...string) []string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "contracts", "schemas", archivo))
	if err != nil {
		t.Fatalf("leyendo %s: %v", archivo, err)
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	for _, p := range puntero {
		v = v.(map[string]any)[p]
	}
	var out []string
	for _, x := range v.(map[string]any)["enum"].([]any) {
		out = append(out, x.(string))
	}
	sort.Strings(out)
	return out
}

func comoTextos[T ~string](l []T) []string {
	out := make([]string, len(l))
	for i, v := range l {
		out[i] = string(v)
	}
	sort.Strings(out)
	return out
}

func TestEnumsIgualAlContrato(t *testing.T) {
	casos := []struct {
		nombre   string
		go_      []string
		contrato []string
	}{
		{"Zona", comoTextos(Zonas), enumDelContrato(t, "Zona.schema.json")},
		{"ZonaAtendida", comoTextos(ZonasAtendidas), enumDelContrato(t, "ZonaAtendida.schema.json")},
		{"Oficio", comoTextos(Oficios), enumDelContrato(t, "Oficio.schema.json")},
		{"EstadoSesion", comoTextos(EstadosSesion), enumDelContrato(t, "EstadoSesion.schema.json")},
		{"MotivoCierre", comoTextos(MotivosCierre), enumDelContrato(t, "MotivoCierre.schema.json")},
		{"ModoAvatar", comoTextos(ModosAvatar), enumDelContrato(t, "ModoAvatar.schema.json")},
		{"UnidadMedida", comoTextos(Unidades), enumDelContrato(t, "UnidadMedida.schema.json")},
		{"Moneda", comoTextos(Monedas), enumDelContrato(t, "Moneda.schema.json")},
		{"TipoItem", comoTextos(TiposItem), enumDelContrato(t, "ItemCotizacion.schema.json", "properties", "tipo")},
		{"RolAsesor", comoTextos(RolesAsesor), enumDelContrato(t, "PerfilAsesor.schema.json", "properties", "rol")},
		{"EstadoTarifas", comoTextos(EstadosTarifas), enumDelContrato(t, "Cotizacion.schema.json", "properties", "tarifas", "properties", "estado")},
	}
	for _, c := range casos {
		if fmt.Sprint(c.go_) != fmt.Sprint(c.contrato) {
			t.Errorf("%s difiere del contrato:\nGo:       %v\nContrato: %v", c.nombre, c.go_, c.contrato)
		}
	}
}

func TestIDsConFormatoDelContrato(t *testing.T) {
	patrones := map[string]*regexp.Regexp{
		PrefijoSesion:         regexp.MustCompile(`^ses_[0-9A-HJKMNP-TV-Z]{26}$`),
		PrefijoCotizacion:     regexp.MustCompile(`^cot_[0-9A-HJKMNP-TV-Z]{26}$`),
		PrefijoAsesor:         regexp.MustCompile(`^ase_[0-9A-HJKMNP-TV-Z]{26}$`),
		PrefijoConsentimiento: regexp.MustCompile(`^cns_[0-9A-HJKMNP-TV-Z]{26}$`),
	}
	vistos := map[string]bool{}
	for prefijo, re := range patrones {
		for i := 0; i < 2000; i++ {
			id, err := nuevoID(prefijo)
			if err != nil {
				t.Fatal(err)
			}
			if !re.MatchString(id) || !IDValido(id, prefijo) || vistos[id] {
				t.Fatalf("id inválido o repetido: %q", id)
			}
			vistos[id] = true
		}
	}
	if IDValido("ses_0000000000000000000000000I", PrefijoSesion) || IDValido("cot_00000000000000000000000000", PrefijoSesion) {
		t.Fatal("IDValido acepta ids inválidos")
	}
	tid, err := NuevoTenantID()
	if err != nil || !tid.Valido() || TenantID("A").Valido() {
		t.Fatalf("tenant id: %q %v", tid, err)
	}
}

// Codificación determinista: 128 bits en 1 deben dar "7" + 25 "Z".
func TestCrockfordBits(t *testing.T) {
	orig := leerAleatorio
	defer func() { leerAleatorio = orig }()
	leerAleatorio = func(b []byte) (int, error) {
		for i := range b {
			b[i] = 0xff
		}
		return len(b), nil
	}
	id, _ := nuevoID("ses_")
	if id != "ses_7ZZZZZZZZZZZZZZZZZZZZZZZZZ" {
		t.Fatalf("codificación inesperada: %s", id)
	}
	leerAleatorio = func(b []byte) (int, error) {
		for i := range b {
			b[i] = 0
		}
		b[15] = 33 // 0b100001 → "11"
		b[7] = 1   // bit 64 → grupo 12 (bits 60..64) = 0b10000 = 16 = "G"
		return len(b), nil
	}
	id, _ = nuevoID("ses_")
	if id != "ses_0000000000000G000000000011" {
		t.Fatalf("codificación inesperada: %s", id)
	}
	leerAleatorio = func([]byte) (int, error) { return 0, errors.New("sin entropía") }
	if _, err := NuevoIDSesion(); !errores.Es(err, errores.ErrorInterno) {
		t.Fatalf("sin entropía debe ser error_interno: %v", err)
	}
}

func TestImportesDelContrato(t *testing.T) {
	// Ejemplos de Cotizacion.schema.json e ItemCotizacion.schema.json.
	casos := []struct {
		cant   int64
		precio Centavos
		want   Centavos
	}{
		{1250, 185000, 2312500},
		{1625, 30007, 487614},
		{300, 4500014, 13500042},
		{100, 1500001, 1500001},
		{38750, 185700, 71958750},
		{39125, 90707, 35489114},
		{1, 49, 0},  // 0,49 → 0
		{1, 50, 1},  // 0,50 → 1 (mitad hacia arriba)
		{1, 150, 2}, // 1,50 → 2
	}
	for _, c := range casos {
		got, err := ImporteItem(c.cant, c.precio)
		if err != nil || got != c.want {
			t.Errorf("ImporteItem(%d, %d) = %d, %v; se esperaba %d", c.cant, c.precio, got, err, c.want)
		}
	}
	if s, err := Sumar(2312500, 487614, 13500042, 1500001); err != nil || s != 17800157 {
		t.Fatalf("Sumar = %d %v", s, err)
	}
}

func TestDesbordes(t *testing.T) {
	if _, err := ImporteItem(MaxCantidadCentesimas, MaxCentavos); !errors.Is(err, ErrDesborde) {
		t.Fatalf("se esperaba desborde: %v", err)
	}
	if _, err := ImporteItem(-1, 10); !errors.Is(err, ErrDesborde) {
		t.Fatal("negativo debe fallar")
	}
	if _, err := MulDivRedondeo(1<<62, 4, 1); !errors.Is(err, ErrDesborde) {
		t.Fatal("128 bits sobre el divisor debe fallar")
	}
	if v, err := ImporteItem(100, MaxCentavos); err != nil || v != MaxCentavos {
		t.Fatalf("el tope exacto debe pasar: %d %v", v, err)
	}
	if _, err := Sumar(MaxCentavos, 1); !errors.Is(err, ErrDesborde) {
		t.Fatal("suma sobre el tope debe fallar")
	}
	if v, err := RecargoBps(1000000, 2500); err != nil || v != 250000 {
		t.Fatalf("recargo = %d %v", v, err)
	}
}

func TestMaquinaDeEstadosSesion(t *testing.T) {
	ase, _ := NuevoIDAsesor()
	s, err := NuevaSesion(ase, ModoAvatar3D, t0, 180)
	if err != nil {
		t.Fatal(err)
	}
	if s.CreadaEn.Nanosecond()%1000 != 0 || s.CreadaEn.Location() != time.UTC {
		t.Fatal("CreadaEn debe ir truncado a microsegundos y en UTC")
	}
	if err := s.Cerrar("inventado", t0); !errores.Es(err, errores.ValidacionFallida) {
		t.Fatalf("motivo inválido: %v", err)
	}
	if err := s.Consentir(t0.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := s.Consentir(t0); !errores.Es(err, errores.EstadoInvalido) {
		t.Fatalf("doble consentimiento debe ser estado_invalido: %v", err)
	}
	if err := s.Cerrar(MotivoCompletada, t0.Add(11*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if s.DuracionS != 600 || s.Estado != EstadoCerrada || s.Validar() != nil {
		t.Fatalf("cierre inesperado: %+v %v", s, s.Validar())
	}
	if err := s.Cerrar(MotivoCompletada, t0); !errores.Es(err, errores.SesionCerrada) {
		t.Fatalf("cerrar dos veces debe ser sesion_cerrada: %v", err)
	}
	if err := s.Consentir(t0); !errores.Es(err, errores.SesionCerrada) {
		t.Fatalf("consentir cerrada debe ser sesion_cerrada: %v", err)
	}
	// Sin consentimiento la duración queda en 0.
	s2, _ := NuevaSesion(ase, ModoAvatarClips, t0, 1)
	_ = s2.Cerrar(MotivoSinConsentimiento, t0.Add(time.Hour))
	if s2.DuracionS != 0 || s2.Validar() != nil {
		t.Fatalf("sin consentimiento: %+v", s2)
	}
}

func TestValidaciones(t *testing.T) {
	if err := (Tenant{}).Validar(); !errores.Es(err, errores.ValidacionFallida) {
		t.Fatalf("tenant vacío: %v", err)
	}
	ase, _ := NuevoIDAsesor()
	a := Asesor{ID: ase, Rol: RolAsesorBase, NombreVisible: "Juan P.", Email: "juan@asesores.local", WhatsApp: "+5492235550101",
		Oficios: []Oficio{OficioPintura}, Zonas: []Zona{ZonaMarChiquita}, CreadoEn: t0}
	if err := a.Validar(); err != nil {
		t.Fatal(err)
	}
	malo := a
	malo.Zonas = []Zona{ZonaOtra}
	malo.NombreVisible = "<script>"
	if err := malo.Validar(); !errores.Es(err, errores.ValidacionFallida) {
		t.Fatal("asesor con zona otra y nombre con < debe fallar")
	}
	s, _ := NuevaSesion(ase, ModoAvatar3D, t0, 30)
	if _, err := NuevoConsentimiento(s, "2026-10-08", t0); !errores.Es(err, errores.ValidacionFallida) {
		t.Fatal("aviso sin .n debe fallar")
	}
}

func cotizacionValida(t *testing.T) Cotizacion {
	t.Helper()
	ses, _ := NuevoIDSesion()
	cot, _ := NuevoIDCotizacion()
	return Cotizacion{
		ID: cot, SesionID: ses, EmitidaEn: t0, Moneda: MonedaARS, Oficio: OficioPintura, Zona: ZonaCobo,
		Items: []ItemCotizacion{{Tipo: ItemManoDeObra, CodigoTarea: "pintura_interior_latex_2_manos", Descripcion: "Látex",
			Unidad: UnidadM2, CantidadCentesimas: 1250, PrecioUnitarioMinCentavos: 450000, PrecioUnitarioMaxCentavos: 850000,
			ImporteMinCentavos: 5625000, ImporteMaxCentavos: 10625000}},
		TotalMinCentavos: 5625000, TotalMaxCentavos: 10625000,
		Tarifas: Tarifas{Version: "0.1.0", Estado: TarifasSinValidar}, ValidezDias: 15,
		Leyenda: "Presupuesto orientativo", BorrarDespuesDe: t0.AddDate(0, 0, 180),
	}
}

func TestCotizacionInvariantes(t *testing.T) {
	c := cotizacionValida(t)
	if err := c.Validar(); err != nil {
		t.Fatal(err)
	}
	mutaciones := map[string]func(*Cotizacion){
		"total no suma":            func(c *Cotizacion) { c.TotalMinCentavos++ },
		"importe mal calculado":    func(c *Cotizacion) { c.Items[0].ImporteMaxCentavos--; c.TotalMaxCentavos-- },
		"otra sin fuera_de_zona":   func(c *Cotizacion) { c.Zona = ZonaOtra },
		"fuera_de_zona en cobo":    func(c *Cotizacion) { c.FueraDeZona = true },
		"sin ítems":                func(c *Cotizacion) { c.Items = nil; c.TotalMinCentavos, c.TotalMaxCentavos = 0, 0 },
		"max menor que min":        func(c *Cotizacion) { c.Items[0].PrecioUnitarioMaxCentavos = 1 },
		"validez 0":                func(c *Cotizacion) { c.ValidezDias = 0 },
		"moneda inválida":          func(c *Cotizacion) { c.Moneda = "EUR" },
		"vencimiento antes":        func(c *Cotizacion) { c.BorrarDespuesDe = t0 },
		"leyenda con html":         func(c *Cotizacion) { c.Leyenda = "<b>x</b>" },
		"código de tarea inválido": func(c *Cotizacion) { c.Items[0].CodigoTarea = "Pintura Interior" },
	}
	for nombre, mutar := range mutaciones {
		c := cotizacionValida(t)
		mutar(&c)
		if err := c.Validar(); !errores.Es(err, errores.ValidacionFallida) {
			t.Errorf("%s: se esperaba validacion_fallida, vino %v", nombre, err)
		}
	}
	fuera := cotizacionValida(t)
	fuera.Zona, fuera.FueraDeZona = ZonaOtra, true
	if err := fuera.Validar(); err != nil {
		t.Fatalf("fuera de zona marcada debe ser válida (se emite igual): %v", err)
	}
}
