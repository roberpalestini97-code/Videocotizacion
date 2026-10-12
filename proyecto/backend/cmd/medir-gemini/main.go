// Mide latencia y tokens de un turno real contra Gemini (T13).
// Solo datos ficticios. No imprime la clave ni el JSON del modelo.
//
//	cd proyecto/backend
//	go run ./cmd/medir-gemini
package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"strings"
	"time"

	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/prompts"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/proveedores/gemini"
	"videocotizacion/backend/internal/secreto"
)

func main() {
	if err := cargarDotEnv(".env"); err != nil && !os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "dotenv: %v\n", err)
		os.Exit(1)
	}
	clave := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if clave == "" {
		fmt.Fprintln(os.Stderr, "falta GEMINI_API_KEY en el entorno o en backend/.env")
		os.Exit(1)
	}
	modelo := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	raw, err := prompts.EsquemaSalidaJSON()
	if err != nil {
		fmt.Fprintf(os.Stderr, "esquema: %v\n", err)
		os.Exit(1)
	}
	esq, err := gemini.EsquemaDesdeJSONSchema(raw)
	if err != nil {
		fmt.Fprintf(os.Stderr, "esquema gemini: %v\n", err)
		os.Exit(1)
	}
	cuerpo, err := prompts.CuerpoPorOficio(dominio.OficioPintura)
	if err != nil {
		fmt.Fprintf(os.Stderr, "prompt: %v\n", err)
		os.Exit(1)
	}
	ext, err := gemini.Nuevo(gemini.Opciones{
		Clave:      secreto.Nuevo(clave),
		Modelo:     modelo,
		Esquema:    esq,
		Timeout:    60 * time.Second,
		Reintentos: -1,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "adaptador: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("modelo=%s reintentos=0 timeout=60s datos=ficticios\n", valorOVacio(modelo, gemini.ModeloPorDefecto))

	textos := []string{
		"Hola, soy un cliente de prueba. Quiero pintar el living de una casa ficticia, unos 20 metros cuadrados, paredes en buen estado, color blanco.",
		"Las ventanas son dos y la puerta una. No hay humedad. El techo no se pinta.",
		"¿Me podés decir qué datos te faltan para armar el presupuesto? Sigo siendo un caso de prueba.",
	}
	var ok int
	for i, texto := range textos {
		if medir(ext, fmt.Sprintf("texto-%d", i+1), proveedores.PedidoExtraccion{
			Transcripcion: texto,
			CuerpoPrompt:  cuerpo,
		}) {
			ok++
		}
	}
	fotos := [][]byte{jpegChico(64, 48, color.RGBA{180, 180, 170, 255}), jpegChico(64, 48, color.RGBA{200, 190, 170, 255})}
	if medir(ext, "texto+2jpeg-64x48", proveedores.PedidoExtraccion{
		Transcripcion: "En las dos fotos de prueba se ve una pared lisa ficticia, sin personas. Quiero látex interior.",
		CuerpoPrompt:  cuerpo,
		Fotogramas:    fotos,
	}) {
		ok++
	}
	grande := jpegChico(960, 540, color.RGBA{190, 185, 175, 255})
	fmt.Printf("jpeg_960x540_bytes=%d\n", len(grande))
	if medir(ext, "texto+1jpeg-960x540", proveedores.PedidoExtraccion{
		Transcripcion: "La foto de prueba es una pared lisa ficticia, sin personas ni datos personales. Quiero látex interior.",
		CuerpoPrompt:  cuerpo,
		Fotogramas:    [][]byte{grande},
	}) {
		ok++
	}
	fmt.Printf("resumen ok=%d de %d\n", ok, len(textos)+2)
	if ok == 0 {
		os.Exit(1)
	}
}

func medir(ext *gemini.Extractor, nombre string, p proveedores.PedidoExtraccion) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 70*time.Second)
	defer cancel()
	ini := time.Now()
	res, err := ext.Extraer(ctx, p)
	dt := time.Since(ini).Round(time.Millisecond)
	if err != nil {
		fmt.Printf("%s ms=%d error=%v\n", nombre, dt.Milliseconds(), err)
		return false
	}
	_, valErr := cotizador.ValidarSalidaLLM(res.JSON)
	valida := valErr == nil
	fmt.Printf("%s ms=%d tokens_entrada=%d tokens_salida=%d bytes_json=%d valida=%t fotos=%d\n",
		nombre, dt.Milliseconds(), res.TokensEntrada, res.TokensSalida, len(res.JSON), valida, len(p.Fotogramas))
	return true
}

func jpegChico(w, h int, c color.RGBA) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetRGBA(x, y, c)
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 70}); err != nil {
		panic(err)
	}
	return b.Bytes()
}

func cargarDotEnv(ruta string) error {
	f, err := os.Open(ruta)
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		linea := strings.TrimSpace(sc.Text())
		if linea == "" || strings.HasPrefix(linea, "#") {
			continue
		}
		k, v, ok := strings.Cut(linea, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if os.Getenv(k) == "" {
			_ = os.Setenv(k, v)
		}
	}
	return sc.Err()
}

func valorOVacio(v, defecto string) string {
	if v == "" {
		return defecto
	}
	return v
}
