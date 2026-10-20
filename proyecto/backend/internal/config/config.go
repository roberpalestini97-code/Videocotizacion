// Package config lee y valida la configuración desde variables de entorno.
// Falla al arrancar si falta algo o si producción quedaría con almacén en
// memoria o proveedores falsos (corrección H4 de T20). Los valores sensibles
// van en secreto.Secreto y nunca se imprimen (H1).
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"videocotizacion/backend/internal/secreto"
)

// Entorno de ejecución.
type Entorno string

// Entornos admitidos.
const (
	Desarrollo Entorno = "desarrollo"
	Prueba     Entorno = "prueba"
	Produccion Entorno = "produccion"
)

// Comando que se va a ejecutar; cada uno exige variables distintas.
type Comando string

// Comandos de `api`.
const (
	Servir    Comando = "servir"
	Migrar    Comando = "migrar"
	Retencion Comando = "retencion"
)

// Tipos de almacén.
const (
	AlmacenMemoria  = "memoria"
	AlmacenPostgres = "postgres"
)

// Valores de PROVEEDOR_* (T13). "falso" solo fuera de producción.
const (
	ProveedorFalso     = "falso"
	ProveedorNavegador = "navegador" // STT y TTS en el navegador del cliente
	ProveedorGemini    = "gemini"    // LLM y STT: Google Gemini por REST (AI Studio)
	ProveedorEnlace    = "enlace"    // WhatsApp: enlace wa.me, sin envío
)

// proveedoresAdmitidos por variable; cualquier otro valor es un error.
var proveedoresAdmitidos = map[string][]string{
	"PROVEEDOR_STT":      {ProveedorFalso, ProveedorNavegador, ProveedorGemini},
	"PROVEEDOR_TTS":      {ProveedorFalso, ProveedorNavegador},
	"PROVEEDOR_LLM":      {ProveedorFalso, ProveedorGemini},
	"PROVEEDOR_WHATSAPP": {ProveedorFalso, ProveedorEnlace},
}

// Gemini configura el adaptador del LLM (docs/ia/gemini.md). La clave sale de
// GEMINI_API_KEY o del archivo GEMINI_API_KEY_FILE (uno solo de los dos).
type Gemini struct {
	Clave      secreto.Secreto
	Modelo     string        // "" = gemini.ModeloPorDefecto
	URLBase    string        // "" = API pública; solo para pruebas locales
	Timeout    time.Duration // por intento
	Reintentos int           // solo 429 y 5xx
}

// PlazoTurnoLLM acota el contexto del orquestador por turno: hasta dos llamadas
// al Extractor (reintento por validación) más margen para avatar/TTS.
func (g Gemini) PlazoTurnoLLM() time.Duration {
	t := g.Timeout
	if t <= 0 {
		t = 20 * time.Second
	}
	return t*2 + 30*time.Second
}

// Proveedores elegidos por puerto (ADR 0003: PROVEEDOR_STT=..., etc.).
type Proveedores struct {
	STT, LLM, TTS, WhatsApp string
}

// Config es la configuración validada.
type Config struct {
	Entorno     Entorno
	Direccion   string
	Almacen     string
	DBURL       secreto.Secreto // rol de la API (vc_api), nunca el dueño
	DBURLDueno  secreto.Secreto // rol dueño, solo para `api migrar` (H3)
	ClaveHMAC   secreto.Secreto // HMAC de claves de API y tokens; nunca se imprime
	DBConexMax  int32
	DBTimeout   time.Duration // tiempo límite por operación contra la base (G03)
	Proveedores Proveedores
	Gemini      Gemini

	LecturaEncabezados time.Duration
	Lectura            time.Duration
	Escritura          time.Duration
	Inactividad        time.Duration
	Apagado            time.Duration
	CuerpoMaxBytes     int64
	EncabezadosMax     int

	RetencionIntervalo time.Duration // cada cuánto corre el borrado programado (0 = no corre en `servir`)
	// OrigenesPublicos (ORIGENES_PUBLICOS, separados por coma): orígenes https de los fronts
	// desplegados. Reciben CORS y, con SEMILLA_LOCAL=1, se suman a la clave pública de la demo.
	OrigenesPublicos []string
	// URLMedios (URL_MEDIOS): base wss:// del socket de medios cuando la API está detrás de
	// otro host (ej. wss://videocotizacion-api.onrender.com). Vacío = valor por defecto.
	URLMedios    string
	SemillaLocal bool // SEMILLA_LOCAL=1: tenant de demo en memoria, solo fuera de producción
}

// Getenv permite inyectar el entorno en pruebas (os.Getenv en producción).
type Getenv func(string) string

// Cargar lee y valida la configuración para un comando.
func Cargar(getenv Getenv, cmd Comando) (Config, error) {
	l := lector{getenv: getenv}
	c := Config{
		Entorno:            Entorno(l.texto("ENTORNO", "")),
		Direccion:          l.texto("DIRECCION", ":8080"),
		Almacen:            l.texto("ALMACEN", ""),
		DBURL:              secreto.Nuevo(getenv("DB_URL")),
		DBURLDueno:         secreto.Nuevo(getenv("DB_URL_DUENO")),
		ClaveHMAC:          secreto.Nuevo(getenv("CLAVE_HMAC")),
		DBConexMax:         int32(l.entero("DB_CONEXIONES_MAX", 10, 1, 200)),
		DBTimeout:          l.duracion("DB_TIMEOUT", 5*time.Second),
		LecturaEncabezados: l.duracion("HTTP_TIMEOUT_ENCABEZADOS", 5*time.Second),
		Lectura:            l.duracion("HTTP_TIMEOUT_LECTURA", 15*time.Second),
		Escritura:          l.duracion("HTTP_TIMEOUT_ESCRITURA", 30*time.Second),
		Inactividad:        l.duracion("HTTP_TIMEOUT_INACTIVIDAD", 60*time.Second),
		Apagado:            l.duracion("HTTP_TIMEOUT_APAGADO", 20*time.Second),
		CuerpoMaxBytes:     int64(l.entero("HTTP_CUERPO_MAX_BYTES", 64<<10, 1<<10, 8<<20)),
		EncabezadosMax:     l.entero("HTTP_ENCABEZADOS_MAX_BYTES", 16<<10, 4<<10, 1<<20),
		RetencionIntervalo: l.duracion("RETENCION_INTERVALO", 24*time.Hour),
		SemillaLocal:       l.flag("SEMILLA_LOCAL"),
		OrigenesPublicos:   l.lista("ORIGENES_PUBLICOS"),
		URLMedios:          strings.TrimRight(l.texto("URL_MEDIOS", ""), "/"),
		Proveedores: Proveedores{
			STT:      l.texto("PROVEEDOR_STT", ""),
			LLM:      l.texto("PROVEEDOR_LLM", ""),
			TTS:      l.texto("PROVEEDOR_TTS", ""),
			WhatsApp: l.texto("PROVEEDOR_WHATSAPP", ""),
		},
	}
	if cmd == Servir && c.Proveedores.UsaGemini() {
		c.Gemini = Gemini{
			Clave:      l.claveGemini(getenv),
			Modelo:     l.texto("GEMINI_MODEL", ""),
			URLBase:    l.texto("GEMINI_URL_BASE", ""),
			Timeout:    l.duracion("GEMINI_TIMEOUT", 20*time.Second),
			Reintentos: l.entero("GEMINI_REINTENTOS", 2, 0, 5),
		}
	}
	errs := l.errs
	errs = append(errs, c.validar(cmd)...)
	if len(errs) > 0 {
		return Config{}, fmt.Errorf("configuración inválida: %w", errors.Join(errs...))
	}
	return c, nil
}

func (c Config) validar(cmd Comando) []error {
	var errs []error
	switch c.Entorno {
	case Desarrollo, Prueba, Produccion:
	case "":
		errs = append(errs, errors.New("falta ENTORNO (desarrollo, prueba o produccion)"))
	default:
		errs = append(errs, fmt.Errorf("ENTORNO %q no admitido", c.Entorno))
	}
	prod := c.Entorno == Produccion
	switch cmd {
	case Migrar:
		if c.DBURLDueno.Vacio() {
			errs = append(errs, errors.New("falta DB_URL_DUENO: `api migrar` corre con el rol dueño"))
		}
		if prod {
			errs = append(errs, exigirTLS("DB_URL_DUENO", c.DBURLDueno)...)
		}
		return errs
	case Servir, Retencion:
	default:
		return append(errs, fmt.Errorf("comando %q desconocido", cmd))
	}
	switch c.Almacen {
	case AlmacenPostgres:
		if c.DBURL.Vacio() {
			errs = append(errs, errors.New("falta DB_URL (rol de la API, sin BYPASSRLS)"))
		}
	case AlmacenMemoria:
		if prod {
			errs = append(errs, errors.New("producción no puede usar ALMACEN=memoria"))
		}
		if cmd == Retencion {
			errs = append(errs, errors.New("`api retencion` necesita ALMACEN=postgres"))
		}
	case "":
		errs = append(errs, errors.New("falta ALMACEN (memoria o postgres)"))
	default:
		errs = append(errs, fmt.Errorf("ALMACEN %q no admitido", c.Almacen))
	}
	if !c.DBURL.Vacio() && !c.DBURLDueno.Vacio() && c.DBURL.Revelar() == c.DBURLDueno.Revelar() {
		errs = append(errs, errors.New("DB_URL no puede ser la misma credencial que DB_URL_DUENO (H3)"))
	}
	if prod {
		errs = append(errs, exigirTLS("DB_URL", c.DBURL)...)
	}
	if c.SemillaLocal && prod {
		errs = append(errs, errors.New("producción no puede usar SEMILLA_LOCAL"))
	}
	if c.SemillaLocal && c.Almacen != AlmacenMemoria && (cmd == Servir || cmd == Retencion) {
		errs = append(errs, errors.New("SEMILLA_LOCAL solo funciona con ALMACEN=memoria"))
	}
	if cmd == Servir {
		for _, o := range c.OrigenesPublicos {
			if !reOrigenPublico.MatchString(o) {
				errs = append(errs, fmt.Errorf("ORIGENES_PUBLICOS: %q no es un origen https (sin ruta ni barra final)", o))
			}
		}
		if c.URLMedios != "" && !reURLMedios.MatchString(c.URLMedios) {
			errs = append(errs, errors.New("URL_MEDIOS tiene que ser wss://host[:puerto], sin ruta"))
		}
		if prod && c.ClaveHMAC.Vacio() {
			errs = append(errs, errors.New("falta CLAVE_HMAC"))
		}
		errs = append(errs, c.validarProveedores(prod)...)
		if c.CuerpoMaxBytes <= 0 || c.LecturaEncabezados <= 0 || c.Lectura <= 0 || c.Escritura <= 0 || c.Inactividad <= 0 {
			errs = append(errs, errors.New("los límites y tiempos del servidor HTTP deben ser positivos"))
		}
	}
	return errs
}

func (c Config) validarProveedores(prod bool) []error {
	var errs []error
	for _, p := range []struct{ variable, valor string }{
		{"PROVEEDOR_STT", c.Proveedores.STT}, {"PROVEEDOR_LLM", c.Proveedores.LLM},
		{"PROVEEDOR_TTS", c.Proveedores.TTS}, {"PROVEEDOR_WHATSAPP", c.Proveedores.WhatsApp},
	} {
		switch {
		case p.valor == "":
			errs = append(errs, fmt.Errorf("falta %s", p.variable))
		case !admitido(p.variable, p.valor):
			errs = append(errs, fmt.Errorf("%s=%q no admitido (valores: %s)", p.variable, p.valor, strings.Join(proveedoresAdmitidos[p.variable], ", ")))
		case p.valor == ProveedorFalso && prod:
			errs = append(errs, fmt.Errorf("producción no puede usar %s=falso", p.variable))
		}
	}
	if c.Proveedores.UsaGemini() {
		if c.Gemini.Clave.Vacio() {
			errs = append(errs, errors.New("PROVEEDOR_LLM=gemini o PROVEEDOR_STT=gemini necesita GEMINI_API_KEY o GEMINI_API_KEY_FILE"))
		}
		if prod && c.Gemini.URLBase != "" && !strings.HasPrefix(c.Gemini.URLBase, "https://") {
			errs = append(errs, errors.New("GEMINI_URL_BASE en producción tiene que ser https"))
		}
	}
	return errs
}

// UsaGemini informa si algún puerto (LLM o STT) va a Gemini: comparten clave,
// modelo y timeout.
func (p Proveedores) UsaGemini() bool {
	return p.LLM == ProveedorGemini || p.STT == ProveedorGemini
}

func admitido(variable, valor string) bool {
	for _, v := range proveedoresAdmitidos[variable] {
		if v == valor {
			return true
		}
	}
	return false
}

// claveGemini lee GEMINI_API_KEY o GEMINI_API_KEY_FILE. Los errores no
// incluyen la clave ni el contenido del archivo.
func (l *lector) claveGemini(getenv Getenv) secreto.Secreto {
	directa := strings.TrimSpace(getenv("GEMINI_API_KEY"))
	archivo := strings.TrimSpace(getenv("GEMINI_API_KEY_FILE"))
	switch {
	case directa != "" && archivo != "":
		l.errs = append(l.errs, errors.New("usar GEMINI_API_KEY o GEMINI_API_KEY_FILE, no las dos"))
	case directa != "":
		return secreto.Nuevo(directa)
	case archivo != "":
		b, err := os.ReadFile(archivo)
		if err != nil {
			l.errs = append(l.errs, errors.New("GEMINI_API_KEY_FILE: no se pudo leer el archivo"))
			return secreto.Secreto{}
		}
		if v := strings.TrimSpace(string(b)); v != "" {
			return secreto.Nuevo(v)
		}
		l.errs = append(l.errs, errors.New("GEMINI_API_KEY_FILE: archivo vacío"))
	}
	return secreto.Secreto{}
}

// exigirTLS pide sslmode=verify-full en producción (R27; verify-ca no valida
// el nombre del servidor). Un sslmode repetido se rechaza: pgx usa el último y
// se podría colar un "disable" (H6 de T43). Solo mira el DSN; la verificación
// real es la de la conexión (pg_stat_ssl).
func exigirTLS(variable string, dsn secreto.Secreto) []error {
	if dsn.Vacio() {
		return nil
	}
	modos := sslmodes(dsn.Revelar())
	switch {
	case len(modos) > 1:
		return []error{fmt.Errorf("%s tiene sslmode repetido: dejar uno solo (verify-full)", variable)}
	case len(modos) == 0 || modos[0] != "verify-full":
		return []error{fmt.Errorf("%s en producción necesita sslmode=verify-full", variable)}
	}
	return nil
}

// sslmodes devuelve todos los sslmode del DSN (URL o clave=valor). Si la URL
// no se puede leer devuelve uno inválido, para que falle.
func sslmodes(dsn string) []string {
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			return []string{"invalido"}
		}
		return u.Query()["sslmode"]
	}
	var out []string
	for _, campo := range strings.Fields(dsn) {
		if v, ok := strings.CutPrefix(campo, "sslmode="); ok {
			out = append(out, v)
		}
	}
	return out
}

// EsProduccion informa si el entorno es producción.
func (c Config) EsProduccion() bool { return c.Entorno == Produccion }

// LogValue resume la configuración para el log de arranque, sin secretos.
func (c Config) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("entorno", string(c.Entorno)),
		slog.String("direccion", c.Direccion),
		slog.String("almacen", c.Almacen),
		slog.Any("db_url", c.DBURL),
		slog.Any("db_url_dueno", c.DBURLDueno),
		slog.Any("clave_hmac", c.ClaveHMAC),
		slog.String("proveedores", fmt.Sprintf("stt=%s llm=%s tts=%s whatsapp=%s",
			c.Proveedores.STT, c.Proveedores.LLM, c.Proveedores.TTS, c.Proveedores.WhatsApp)),
		slog.String("gemini_modelo", c.Gemini.Modelo),
		slog.Duration("gemini_timeout", c.Gemini.Timeout),
		slog.Any("gemini_clave", c.Gemini.Clave),
		slog.Int64("cuerpo_max_bytes", c.CuerpoMaxBytes),
		slog.Duration("retencion_intervalo", c.RetencionIntervalo),
	)
}

type lector struct {
	getenv Getenv
	errs   []error
}

var (
	reOrigenPublico = regexp.MustCompile(`^https://[a-z0-9.-]+(:[0-9]{1,5})?$`)
	reURLMedios     = regexp.MustCompile(`^wss://[a-z0-9.-]+(:[0-9]{1,5})?$`)
)

// lista lee valores separados por coma; ignora los vacíos.
func (l *lector) lista(clave string) []string {
	var out []string
	for _, v := range strings.Split(l.getenv(clave), ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func (l *lector) flag(clave string) bool {
	switch strings.ToLower(strings.TrimSpace(l.getenv(clave))) {
	case "", "0", "false", "no":
		return false
	case "1", "true", "si":
		return true
	default:
		l.errs = append(l.errs, fmt.Errorf("%s debe ser 1 o 0", clave))
		return false
	}
}

func (l *lector) texto(clave, defecto string) string {
	if v := strings.TrimSpace(l.getenv(clave)); v != "" {
		return v
	}
	return defecto
}

func (l *lector) entero(clave string, defecto, min, max int) int {
	v := strings.TrimSpace(l.getenv(clave))
	if v == "" {
		return defecto
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < min || n > max {
		l.errs = append(l.errs, fmt.Errorf("%s debe ser un entero entre %d y %d", clave, min, max))
		return defecto
	}
	return n
}

func (l *lector) duracion(clave string, defecto time.Duration) time.Duration {
	v := strings.TrimSpace(l.getenv(clave))
	if v == "" {
		return defecto
	}
	d, err := time.ParseDuration(v)
	if err != nil || d < 0 {
		l.errs = append(l.errs, fmt.Errorf("%s debe ser una duración válida (por ejemplo 30s)", clave))
		return defecto
	}
	return d
}
