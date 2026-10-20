// Arnés de conductas contra el LLM real (T17). Corre los casos fijos de
// conductas/evaluacion/casos K veces por el mismo camino que un turno WS
// (turno.DesdeTexto: prompt por oficio, Gemini, validación, reintento,
// cotizador en Go) y reporta por caso la tasa de acierto de cada campo según
// conductas/evaluacion/rubrica.json.
//
// Gasta cupo de Gemini: NO va en CI ni en verificar-repo. Solo datos
// ficticios (nivel gratuito). No imprime la clave.
//
//	cd proyecto/backend
//	go run ./cmd/evaluar-conductas -k 3 -pausa 4s
//	go run ./cmd/evaluar-conductas -caso demo-rejas -k 1 -v
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"videocotizacion/backend/internal/config"
	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/evaluacion"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/falsos"
	"videocotizacion/backend/internal/proveedores/gemini"
	"videocotizacion/backend/internal/proveedores/navegador"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/internal/turno"
)

var (
	errCupo      = errors.New("cupo del proveedor agotado (HTTP 429)")
	errAbandonar = errors.New("caso abandonado: 3 errores del proveedor")
)

func main() {
	dir := flag.String("dir", filepath.Join("..", "conductas", "evaluacion"), "carpeta con rubrica.json y casos/")
	k := flag.Int("k", 3, "repeticiones por caso")
	pausa := flag.Duration("pausa", 4*time.Second, "pausa entre turnos (cuida el cupo por minuto)")
	filtro := flag.String("caso", "", "solo los casos cuyo id contiene este texto")
	env := flag.String("env", ".env", "archivo .env con GEMINI_API_KEY (no pisa el entorno)")
	maxLlamadas := flag.Int64("max-llamadas", 120, "corta la corrida al llegar a este número de llamadas HTTP")
	salida := flag.String("json", "", "si se da, guarda el reporte en este archivo")
	verboso := flag.Bool("v", false, "imprime cada turno y cada chequeo fallido")
	flag.Parse()

	if err := correr(*dir, *k, *pausa, *filtro, *env, *maxLlamadas, *salida, *verboso); err != nil {
		fmt.Fprintln(os.Stderr, "evaluar-conductas:", err)
		os.Exit(1)
	}
}

type reporteCaso struct {
	ID      string                     `json:"id"`
	Reps    int                        `json:"repeticiones"`
	Tasas   map[string]evaluacion.Tasa `json:"tasas"`
	Pasa    bool                       `json:"pasa"`
	Errores int                        `json:"errores_proveedor,omitempty"`
	Fallas  []string                   `json:"fallas,omitempty"`
}

type reporte struct {
	Fecha     string        `json:"fecha"`
	Modelo    string        `json:"modelo"`
	Prompt    string        `json:"version_prompt"`
	Refs      []string      `json:"referencias_prompt"`
	Rubrica   string        `json:"rubrica"`
	Umbral    float64       `json:"umbral"`
	K         int           `json:"k"`
	Llamadas  int64         `json:"llamadas_http"`
	TokensIn  int64         `json:"tokens_entrada"`
	TokensOut int64         `json:"tokens_salida"`
	Cortada   string        `json:"cortada,omitempty"`
	Casos     []reporteCaso `json:"casos"`
}

func correr(dir string, k int, pausa time.Duration, filtro, env string, maxLlamadas int64, salida string, verboso bool) error {
	if k < 1 || k > 10 {
		return fmt.Errorf("-k %d fuera de 1..10", k)
	}
	rub, err := evaluacion.CargarRubrica(filepath.Join(dir, "rubrica.json"))
	if err != nil {
		return err
	}
	casos, err := evaluacion.CargarCasos(filepath.Join(dir, "casos"))
	if err != nil {
		return err
	}
	if filtro != "" {
		var f []evaluacion.Caso
		for _, c := range casos {
			if strings.Contains(c.ID, filtro) {
				f = append(f, c)
			}
		}
		casos = f
	}
	if len(casos) == 0 {
		return errors.New("ningún caso coincide con -caso")
	}
	if err := config.CargarArchivoEnv(env); err != nil {
		return fmt.Errorf("leer %s: %w", env, err)
	}
	clave := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if clave == "" {
		return errors.New("falta GEMINI_API_KEY (entorno o -env apuntando a backend/.env)")
	}
	raw, err := prompts.EsquemaSalidaJSON()
	if err != nil {
		return err
	}
	esq, err := gemini.EsquemaDesdeJSONSchema(raw)
	if err != nil {
		return err
	}
	modelo := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	ext, err := gemini.Nuevo(gemini.Opciones{
		Clave: secreto.Nuevo(clave), Modelo: modelo, Esquema: esq,
		Timeout: 30 * time.Second, Reintentos: 1,
	})
	if err != nil {
		return err
	}
	cot := cotizador.AbrirDesdeRutasHabituales(nil)
	if cot == nil {
		return errors.New("sin tarifario (correr desde proyecto/backend)")
	}
	prov := proveedores.Conjunto{
		Transcriptor: navegador.Transcriptor{}, Extractor: &diagnostico{Extractor: ext},
		Sintetizador: navegador.Sintetizador{}, Mensajeria: &falsos.Mensajeria{},
	}
	turnos := 0
	for _, c := range casos {
		turnos += len(c.Turnos)
	}
	rep := reporte{
		Fecha: time.Now().Format(time.RFC3339), Modelo: ext.Modelo(), Prompt: prompts.VersionActual,
		Rubrica: rub.Version, Umbral: rub.Umbral, K: k,
	}
	vistos := map[string]bool{}
	for _, c := range casos {
		if o := dominio.Oficio(c.OficioSesion); !vistos[c.OficioSesion] && o.Valido() {
			vistos[c.OficioSesion] = true
			if ref, err := prompts.ReferenciaContrato(o); err == nil {
				rep.Refs = append(rep.Refs, ref)
			}
		}
	}
	fmt.Printf("prompts=%v\n", rep.Refs)
	fmt.Printf("modelo=%s prompt=%s rubrica=%s umbral=%.2f casos=%d k=%d turnos=%d pausa=%s datos=ficticios\n",
		rep.Modelo, rep.Prompt, rep.Rubrica, rep.Umbral, len(casos), k, turnos*k, pausa)

	primero := true
	for _, c := range casos {
		acum := evaluacion.Acumulado{}
		rc := reporteCaso{ID: c.ID}
		for r := 1; r <= k && rep.Cortada == ""; r++ {
			err := correrCaso(c, r, prov, cot, pausa, &primero, maxLlamadas, ext, acum, &rc, verboso)
			if errors.Is(err, errAbandonar) {
				rc.Fallas = append(rc.Fallas, err.Error())
				rc.Reps++
				break
			}
			if err != nil {
				rep.Cortada = err.Error()
				break
			}
			rc.Reps++
		}
		rc.Tasas = map[string]evaluacion.Tasa{}
		for campo, t := range acum {
			rc.Tasas[campo] = *t
		}
		rc.Pasa = acum.Pasa(rub.Umbral)
		rep.Casos = append(rep.Casos, rc)
		if rep.Cortada != "" {
			break
		}
	}
	rep.TokensIn, rep.TokensOut, rep.Llamadas = ext.Consumo()
	imprimir(rep)
	if salida != "" {
		b, _ := json.MarshalIndent(rep, "", "  ")
		if err := os.WriteFile(salida, append(b, '\n'), 0o644); err != nil {
			return err
		}
	}
	if rep.Cortada != "" {
		return fmt.Errorf("corrida cortada: %s", rep.Cortada)
	}
	return nil
}

func correrCaso(c evaluacion.Caso, rep int, prov proveedores.Conjunto, cot *cotizador.Cotizador, pausa time.Duration,
	primero *bool, maxLlamadas int64, ext *gemini.Extractor, acum evaluacion.Acumulado, rc *reporteCaso, verboso bool) error {
	ase, _ := dominio.NuevoIDAsesor()
	ahora := time.Now().UTC()
	ses, err := dominio.NuevaSesion(ase, dominio.ModoAvatar3D, ahora, 30)
	if err != nil {
		return err
	}
	var ultima []byte
	for i, t := range c.Turnos {
		if _, _, n := ext.Consumo(); n >= maxLlamadas {
			return fmt.Errorf("tope de %d llamadas (-max-llamadas)", maxLlamadas)
		}
		if !*primero && pausa > 0 {
			time.Sleep(pausa)
		}
		*primero = false
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		ini := time.Now()
		sal, err := turno.DesdeTexto(ctx, turno.TextoEntrada{
			Numero: i + 1, Texto: t.Cliente, Oficio: dominio.Oficio(c.OficioSesion), UltimaSalidaLLM: ultima,
			Prov: prov, Sesion: &ses, Cot: cot, Ahora: ahora.Add(time.Duration(i+1) * time.Minute),
		})
		cancel()
		if err != nil {
			// Un 503 o un timeout aislado no corta la corrida: la repetición
			// queda sin puntuar desde este turno y se cuenta aparte.
			rc.Errores++
			rc.Fallas = append(rc.Fallas, fmt.Sprintf("rep %d turno %d: %s (sin puntuar)", rep, i+1, errores.CodigoDe(err)))
			if rc.Errores >= 3 {
				return errAbandonar
			}
			return nil
		}
		if sal.Cierre != nil && sal.Cierre.Causa == turno.CausaCuotaProveedor {
			return errCupo
		}
		obs := observar(sal)
		if len(sal.SalidaLLM) > 0 {
			ultima = sal.SalidaLLM
		}
		if m := prov.Extractor.(*diagnostico).tomar(); verboso && len(m) > 0 {
			fmt.Printf("  %s rep=%d turno=%d intentos_invalidos=%q\n", c.ID, rep, i+1, m)
		}
		if verboso {
			fmt.Printf("  %s rep=%d turno=%d ms=%d valida=%t marcas=%v oficio=%s trabajo=%s zona=%s fuera=%t faltantes=%v accion=%s cotizacion=%t\n",
				c.ID, rep, i+1, time.Since(ini).Milliseconds(), obs.Valida, sal.Marcas, obs.Oficio, obs.Trabajo, obs.Zona,
				obs.FueraDeZona, obs.Faltantes, obs.Accion, obs.Cotizacion)
		}
		if t.Esperado == nil {
			continue
		}
		ch := evaluacion.Evaluar(*t.Esperado, obs)
		acum.Sumar(ch)
		for _, x := range ch {
			if !x.OK {
				f := fmt.Sprintf("rep %d turno %d %s: esperado %s, obtenido %s", rep, i+1, x.Campo, x.Esperado, x.Obtenido)
				rc.Fallas = append(rc.Fallas, f)
				if verboso {
					fmt.Println("    FALLA", f)
				}
			}
		}
		if sal.Cierre != nil {
			break
		}
	}
	return nil
}

// diagnostico anota por qué no validó cada salida del modelo (solo rutas de
// campos, sin valores) para explicar un salida_invalida en el reporte.
type diagnostico struct {
	proveedores.Extractor
	motivos []string
}

func (d *diagnostico) Extraer(ctx context.Context, p proveedores.PedidoExtraccion) (proveedores.RespuestaExtraccion, error) {
	res, err := d.Extractor.Extraer(ctx, p)
	switch {
	case err != nil:
		d.motivos = append(d.motivos, conCausa(err))
	default:
		if _, verr := cotizador.ValidarSalidaLLM(res.JSON); verr != nil && !errors.Is(verr, cotizador.ErrMontoEnRespuesta) {
			d.motivos = append(d.motivos, conCausa(verr))
		}
	}
	return res, err
}

// conCausa agrega la causa al código del catálogo (errores.Error solo
// muestra el código). Las causas nombran rutas de campo, no valores.
func conCausa(err error) string {
	if c := errors.Unwrap(err); c != nil {
		return err.Error() + ": " + c.Error()
	}
	return err.Error()
}

func (d *diagnostico) tomar() []string {
	m := d.motivos
	d.motivos = nil
	return m
}

func observar(sal turno.TextoSalida) evaluacion.Observado {
	o := evaluacion.Observado{Cotizacion: sal.Cotizacion != nil}
	if len(sal.SalidaLLM) == 0 {
		return o
	}
	s, err := cotizador.ValidarSalidaLLM(sal.SalidaLLM)
	if err != nil && !errors.Is(err, cotizador.ErrMontoEnRespuesta) {
		return o
	}
	o.Valida = true
	o.Oficio, o.Trabajo = s.Oficio, s.Trabajo.Tipo
	o.Zona, o.FueraDeZona = s.Zona.Localidad, s.Zona.FueraDeZona
	o.Faltantes = s.Faltantes
	o.Accion = s.SiguientePaso.Accion
	o.IntentoInyeccion = s.IntentoInyeccion
	return o
}

func imprimir(rep reporte) {
	fmt.Println()
	fmt.Printf("%-40s %4s  %s\n", "caso", "reps", "tasas por campo (aciertos/chequeos)")
	pasan := 0
	for _, c := range rep.Casos {
		var partes []string
		for _, campo := range evaluacion.Campos {
			if t, ok := c.Tasas[campo]; ok {
				partes = append(partes, fmt.Sprintf("%s=%d/%d", campo, t.OK, t.Total))
			}
		}
		estado := "NO PASA"
		if c.Pasa {
			estado = "pasa"
			pasan++
		}
		if c.Errores > 0 {
			// Con turnos sin puntuar el veredicto es parcial: no se cuenta.
			if c.Pasa {
				pasan--
			}
			estado = fmt.Sprintf("INCOMPLETO (%s con lo puntuado), %d errores del proveedor", estado, c.Errores)
		}
		fmt.Printf("%-40s %4d  %s  [%s]\n", c.ID, c.Reps, strings.Join(partes, " "), estado)
		for _, f := range c.Fallas {
			fmt.Println("    -", f)
		}
	}
	fmt.Printf("\nresumen: %d de %d casos pasan (umbral %.2f por campo) · llamadas_http=%d tokens_entrada=%d tokens_salida=%d\n",
		pasan, len(rep.Casos), rep.Umbral, rep.Llamadas, rep.TokensIn, rep.TokensOut)
	if rep.Cortada != "" {
		fmt.Println("CORTADA:", rep.Cortada)
	}
}
