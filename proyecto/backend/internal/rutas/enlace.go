// Package rutas publica las operaciones de T04b que ya tienen almacén:
// la lectura del enlace opaco, el aviso, el desafío y POST /v1/sesiones.
package rutas

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/cotizador"
	"videocotizacion/backend/internal/desafio"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/proveedores"
	"videocotizacion/backend/internal/secreto"
	"videocotizacion/backend/internal/servidor"
)

// Versión del aviso que acompaña al enlace. El texto legal sigue a validar
// con abogado; la URL espera el dominio de P4.
const (
	versionAviso = "2026-10-08.1"
	urlAviso     = "https://cotizar.videocotizacion.local/privacidad/2026-10-08.1"
)

// Registrar agrega las rutas del widget y POST /v1/sesiones, con el mismo
// libro de desafíos. crearSesion no está abierta al público: faltan R56 y R61–R67.
// R58 es un tope provisorio de 10 pedidos por minuto.
func Registrar(mux *http.ServeMux, a almacen.Almacen, clave secreto.Secreto, log *slog.Logger, prov proveedores.Conjunto, cot *cotizador.Cotizador) *enlace {
	h := &enlace{
		almacen: a, clave: clave, log: log, libro: desafio.Nuevo(), prov: prov, cot: cot,
		idem: map[string]recuerdoIdem{}, intentos: map[string]intentoPanel{},
		tasas: map[string]ventanaTasa{}, usoMedios: map[string]usoMedios{},
	}
	mux.HandleFunc("GET /v1/widget/enlaces/{id_publico}", h.leer)
	mux.HandleFunc("GET /v1/widget/avisos/privacidad", h.aviso)
	mux.HandleFunc("POST /v1/widget/desafios", h.emitirDesafio)
	mux.HandleFunc("POST /v1/sesiones", h.crearSesion)
	mux.HandleFunc("GET /v1/sesiones/{sesion_id}", h.leerSesion)
	mux.HandleFunc("POST /v1/sesiones/{sesion_id}/consentimiento", h.registrarConsentimiento)
	mux.HandleFunc("POST /v1/sesiones/{sesion_id}/token-medios", h.emitirTokenMedios)
	mux.HandleFunc("POST /v1/sesiones/{sesion_id}/cierre", h.cerrarSesion)
	mux.HandleFunc("GET /v1/sesiones/{sesion_id}/cotizacion", h.leerCotizacion)
	mux.HandleFunc("GET /v1/sesiones/{sesion_id}/derivacion", h.leerDerivacion)
	mux.HandleFunc("POST /v1/sesiones/{sesion_id}/contacto", h.registrarContacto)
	mux.HandleFunc("GET /v1/sesiones/{sesion_id}/medios", h.conectarMedios)
	mux.HandleFunc("POST /v1/panel/sesion", h.iniciarSesionPanel)
	mux.HandleFunc("GET /v1/panel/sesion", h.leerSesionPanel)
	mux.HandleFunc("DELETE /v1/panel/sesion", h.cerrarSesionPanel)
	mux.HandleFunc("POST /v1/panel/sesion/totp", h.verificarTotp)
	mux.HandleFunc("GET /v1/panel/perfil", h.leerPerfil)
	mux.HandleFunc("PATCH /v1/panel/perfil", h.actualizarPerfil)
	mux.HandleFunc("POST /v1/panel/reautenticacion", h.reautenticar)
	mux.HandleFunc("POST /v1/panel/contrasena", h.cambiarContrasena)
	mux.HandleFunc("POST /v1/panel/enlace/rotacion", h.rotarEnlace)
	mux.HandleFunc("GET /v1/panel/claves-widget", h.listarClavesWidget)
	mux.HandleFunc("POST /v1/panel/claves-widget", h.crearClaveWidget)
	mux.HandleFunc("DELETE /v1/panel/claves-widget/{clave_id}", h.revocarClaveWidget)
	mux.HandleFunc("GET /v1/panel/cotizaciones", h.listarMisCotizaciones)
	mux.HandleFunc("GET /v1/panel/cotizaciones/{sesion_id}", h.leerMiCotizacion)
	mux.HandleFunc("POST /v1/panel/mi-cuenta/exportacion", h.exportarMiCuenta)
	return h
}

type enlace struct {
	almacen almacen.Almacen
	clave   secreto.Secreto
	log     *slog.Logger
	libro   *desafio.Libro

	idemMu sync.Mutex
	idem   map[string]recuerdoIdem

	intentosMu sync.Mutex
	intentos   map[string]intentoPanel

	// tasas es el tope provisorio de POST /v1/sesiones (R58). No es el del panel.
	tasasMu sync.Mutex
	tasas   map[string]ventanaTasa

	// plazoAutenticar, si no es cero, reemplaza los 5 s del primer mensaje.
	// Lo usan las pruebas para no esperar el plazo real.
	plazoAutenticar time.Duration

	// ahoraPanel, si no es nil, fija el reloj del login, del TOTP y de la sesión.
	// Las pruebas lo usan para que el código no dependa del reloj real.
	ahoraPanel func() time.Time

	// usoMedios cuenta turnos y fotogramas en el proceso (R65, R66).
	// No guarda texto, audio ni JPEG.
	mediosMu  sync.Mutex
	usoMedios map[string]usoMedios

	// prov cablea STT/LLM/TTS cuando Completo() (desarrollo con falsos, T25).
	prov proveedores.Conjunto
	cot  *cotizador.Cotizador
}

// recuerdoIdem guarda, solo en el proceso, la respuesta de un reintento
// seguro (24 h). El almacén no ve el valor del token: ahí entra el HMAC.
type recuerdoIdem struct {
	suma   [32]byte
	cuerpo []byte
	vence  time.Time
}

func (h *enlace) leer(w http.ResponseWriter, r *http.Request) {
	hallada, ok := h.autenticar(w, r, true, false)
	if !ok {
		return
	}
	id := r.PathValue("id_publico")
	en, err := h.almacen.LeerEnlace(r.Context(), hallada.TenantID, id)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	as, err := h.almacen.LeerAsesor(r.Context(), hallada.TenantID, en.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(cuerpoEnlace(en.IDPublico, as))
}

type avatar struct {
	ID          string   `json:"avatar_id"`
	Nombre      string   `json:"nombre"`
	Modos       []string `json:"modos"`
	Descripcion string   `json:"descripcion_accesible"`
}

func cuerpoEnlace(id string, as dominio.Asesor) map[string]any {
	oficios := make([]string, len(as.Oficios))
	for i, o := range as.Oficios {
		oficios[i] = string(o)
	}
	zonas := make([]string, len(as.Zonas))
	for i, z := range as.Zonas {
		zonas[i] = string(z)
	}
	return map[string]any{
		"id_publico": id,
		"profesional": map[string]any{
			"nombre_visible": as.NombreVisible,
			"oficios":        oficios,
			"zonas":          zonas,
		},
		"avatares":             avataresDe(as.Oficios),
		"aviso_privacidad":     map[string]string{"version": versionAviso, "url": urlAviso},
		"camara_obligatoria":   true,
		"fotograma":            map[string]any{"formato": "image/jpeg", "lado_max_px": 1024, "bytes_max": 131072, "intervalo_min_ms": 3000, "max_por_sesion": 400},
		"asistente_automatico": true,
	}
}

// avataresDe es el catálogo provisorio hasta T30 (apariencia de constructor).
func avataresDe(oficios []dominio.Oficio) []avatar {
	var out []avatar
	vio := map[string]bool{}
	agregar := func(a avatar) {
		if !vio[a.ID] {
			vio[a.ID] = true
			out = append(out, a)
		}
	}
	for _, o := range oficios {
		switch o {
		case dominio.OficioJardineria:
			agregar(avatar{"av_jardinero", "Tito", []string{"clips"}, "Jardinero con gorra y guantes"})
		case dominio.OficioPintura:
			agregar(avatar{"av_pintora", "Laura", []string{"3d"}, "Pintora con overol blanco"})
		default:
			agregar(avatar{"av_obrero_casco", "Juan", []string{"3d", "clips"}, "Trabajador con casco amarillo y ropa de obra"})
		}
	}
	if len(out) == 0 {
		agregar(avatar{"av_obrero_casco", "Juan", []string{"3d", "clips"}, "Trabajador con casco amarillo y ropa de obra"})
	}
	return out
}
