package rutas

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/prompts"
)

func TestDetalleCotizacionPanel(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	reloj := time.Date(2026, 10, 8, 18, 0, 0, 0, time.UTC)
	var secreto [20]byte
	for i := range secreto {
		secreto[i] = byte(i + 3)
	}
	cif, err := dominio.CifrarSecretoTOTP(f.claveSrv, secreto[:])
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
		AsesorID: f.asesor, Cifrado: cif, CreadaEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	const ip = "192.0.2.160"
	f.relojPanel(reloj)
	cookie, _ := f.entrarPanel(t, reloj.Add(3*time.Minute), ip, "juan@ejemplo.local", clavePanelOK, secreto[:])

	ses, err := dominio.NuevaSesion(f.asesor, dominio.ModoAvatar3D, time.Date(2026, 10, 8, 13, 0, 0, 0, time.UTC), 45)
	if err != nil {
		t.Fatal(err)
	}
	ses.AvatarID = "av_pintora"
	if err := f.alm.CrearSesion(t.Context(), f.tenant, ses); err != nil {
		t.Fatal(err)
	}
	cot := cotizacionDePrueba(t, ses.ID)
	if err := f.alm.GuardarCotizacion(t.Context(), f.tenant, cot); err != nil {
		t.Fatal(err)
	}
	salidaLLM, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "01-pintura-interior-pide-medidas.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.AnexarRespuestaModelo(t.Context(), f.tenant, dominio.RespuestaModelo{
		SesionID: ses.ID, Turno: 1, RegistradaEn: cot.EmitidaEn, SalidaJSON: salidaLLM,
	}); err != nil {
		t.Fatal(err)
	}

	ref, err := prompts.ReferenciaContrato(dominio.OficioPintura)
	if err != nil {
		t.Fatal(err)
	}
	rr := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones/"+ses.ID, ip, cookie)
	if rr.Code != http.StatusOK {
		t.Fatalf("detalle: %d %s", rr.Code, rr.Body)
	}
	var det map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &det); err != nil {
		t.Fatal(err)
	}
	if det["sesion_id"] != ses.ID || det["resumen"] == "consulta" {
		t.Fatalf("detalle: %+v", det)
	}
	vers := det["versiones"].(map[string]any)
	if vers["prompt"] != ref || vers["esquema_salida"] != prompts.EsquemaReferenciaPanel {
		t.Fatalf("versiones: %+v", vers)
	}
	modelos, ok := det["respuestas_modelo"].([]any)
	if !ok || len(modelos) != 1 {
		t.Fatalf("respuestas_modelo: %+v", det["respuestas_modelo"])
	}
	extra, ok := det["datos_extraidos"].(map[string]any)
	if !ok || extra["tarea"] != "pintura_interior" || extra["zona"] != "santa_clara" {
		t.Fatalf("datos_extraidos: %+v", det["datos_extraidos"])
	}
	if n := f.cantidadLecturas(t, f.asesor); n != 1 {
		t.Fatalf("lecturas: %d", n)
	}

	laura := debeAsesor(t)
	if err := f.alm.CrearAsesor(t.Context(), f.tenant, dominio.Asesor{
		ID: laura, Rol: dominio.RolAsesorBase, NombreVisible: "Laura",
		Email: "laura-det@ej.local", WhatsApp: "+5492235550103",
		Oficios: []dominio.Oficio{dominio.OficioPintura}, Zonas: []dominio.Zona{dominio.ZonaCobo},
		CreadoEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	ajena, err := dominio.NuevaSesion(laura, dominio.ModoAvatar3D, reloj, 45)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.CrearSesion(t.Context(), f.tenant, ajena); err != nil {
		t.Fatal(err)
	}
	forbidden := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones/"+ajena.ID, ip, cookie)
	if forbidden.Code != http.StatusNotFound {
		t.Fatalf("ajena: %d", forbidden.Code)
	}
}

func TestDetalleCotizacionPanelPaisajismoS4(t *testing.T) {
	f := nuevaFixtureSesion(t)
	sembrarClavePanel(t, f, f.asesor, "juan@ejemplo.local", clavePanelOK)
	reloj := time.Date(2026, 10, 8, 18, 0, 0, 0, time.UTC)
	var secreto [20]byte
	for i := range secreto {
		secreto[i] = byte(i + 3)
	}
	cif, err := dominio.CifrarSecretoTOTP(f.claveSrv, secreto[:])
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.GuardarSecretoTOTP(t.Context(), f.tenant, dominio.SecretoTOTP{
		AsesorID: f.asesor, Cifrado: cif, CreadaEn: reloj,
	}); err != nil {
		t.Fatal(err)
	}
	f.relojPanel(reloj)
	cookie, _ := f.entrarPanel(t, reloj.Add(3*time.Minute), "192.0.2.161", "juan@ejemplo.local", clavePanelOK, secreto[:])

	ses, err := dominio.NuevaSesion(f.asesor, dominio.ModoAvatar3D, reloj, 45)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.CrearSesion(t.Context(), f.tenant, ses); err != nil {
		t.Fatal(err)
	}
	salidaLLM, err := os.ReadFile(filepath.Join("..", "..", "..", "conductas", "ejemplos", "05-paisajismo-tecnico-planos-largo-plazo.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.alm.AnexarRespuestaModelo(t.Context(), f.tenant, dominio.RespuestaModelo{
		SesionID: ses.ID, Turno: 1, RegistradaEn: reloj, SalidaJSON: salidaLLM,
	}); err != nil {
		t.Fatal(err)
	}

	rr := f.pedirRuta(http.MethodGet, "/v1/panel/cotizaciones/"+ses.ID, "192.0.2.161", cookie)
	if rr.Code != http.StatusOK {
		t.Fatalf("detalle: %d %s", rr.Code, rr.Body)
	}
	var det map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &det); err != nil {
		t.Fatal(err)
	}
	extra, ok := det["datos_extraidos"].(map[string]any)
	if !ok || extra["oficio"] != "jardineria" || extra["tarea"] != "diseno_paisajismo" {
		t.Fatalf("datos_extraidos S4: %+v", det["datos_extraidos"])
	}
	vers := det["versiones"].(map[string]any)
	if vers["prompt"] != "conducta_paisajismo@0e78ce0e816c" {
		t.Fatalf("versiones.prompt debe reflejar última salida LLM: %+v", vers)
	}
}
