package rutas

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"regexp"
	"slices"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/desafio"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
	"videocotizacion/backend/internal/servidor"
)

const (
	// vigenciaTokenSesion es la vida del vc_ses_ (3600 s). No es un token de medios.
	vigenciaTokenSesion = 3600 * time.Second
	// Valores provisorios de la respuesta (P8). R60 los usa en el barrido de la lectura.
	// R65 y R66 los usan para descartar texto y fotogramas en el socket.
	sinVozProvisorioS         = 20
	duracionMaximaProvisoriaS = 900
	caracteresMaxPorTurno     = 500
	turnosLLMMax              = 60
	ladoMaxFotogramaPx        = 1024
	bytesMaxFotograma         = 131072
	intervaloFotogramaMs      = 3000
	maxFotogramasSesion       = 400
	vigenciaIdempotencia      = 24 * time.Hour
)

var (
	reEnlace = regexp.MustCompile(`^[A-Za-z0-9_-]{22}$`)
	reAvatar = regexp.MustCompile(`^av_[a-z0-9_]{2,30}$`)
	reRefExt = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
	reIdem   = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
)

type solicitudCrearSesion struct {
	Enlace            string  `json:"enlace"`
	ModoAvatar        string  `json:"modo_avatar"`
	AvatarID          *string `json:"avatar_id"`
	Idioma            *string `json:"idioma"`
	ReferenciaExterna *string `json:"referencia_externa"`
}

// crearSesion es POST /v1/sesiones. No llama proveedores ni emite token de
// medios: primero va el consentimiento.
//
// R58 es un tope provisorio de 10 pedidos por minuto, por IP, por clave
// pública y por enlace, y va antes de la credencial. No es cuota_agotada.
// R56 y R61–R67 siguen abiertos: no hay tope de gasto. El corte por silencio
// es el barrido de la lectura, no esta ruta.
// Esta ruta NO está abierta al público. La dificultad del desafío no se baja.
func (h *enlace) crearSesion(w http.ResponseWriter, r *http.Request) {
	if err := h.limitarCrearSesion(r); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	hallada, ok := h.autenticar(w, r, true, true)
	if !ok {
		return
	}
	if hallada.Tipo == dominio.ClavePublica {
		// El desafío se consume antes de crear y antes de la idempotencia:
		// reusar X-Desafio es 403 aunque la Idempotency-Key sea la misma.
		if err := h.libro.Consumir(r.Header.Get("X-Desafio"), hallada.ID, r.Header.Get("Origin"), time.Now()); err != nil {
			servidor.EscribirError(w, r, h.log, errores.Envolver(errores.DesafioInvalido, err))
			return
		}
	}
	if !cuerpoJSON(r) {
		servidor.EscribirError(w, r, h.log, errores.Nuevo(errores.TipoDeContenidoNoSoportado))
		return
	}
	idem := r.Header.Get("Idempotency-Key")
	if idem != "" && !reIdem.MatchString(idem) {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("Idempotency-Key: formato inválido")))
		return
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			servidor.EscribirError(w, r, h.log, err)
			return
		}
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, err))
		return
	}
	sol, err := decodificarSolicitud(raw)
	if err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, err))
		return
	}
	if err := validarSolicitud(sol); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	en, err := h.almacen.LeerEnlace(r.Context(), hallada.TenantID, sol.Enlace)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	as, err := h.almacen.LeerAsesor(r.Context(), hallada.TenantID, en.AsesorID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	avatarID := ""
	if sol.AvatarID != nil {
		avatarID = *sol.AvatarID
	}
	if err := modoDelEnlace(as.Oficios, avatarID, sol.ModoAvatar); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	ahora := time.Now().UTC()
	if idem != "" {
		suma := sha256.Sum256(raw)
		if cuerpo, conflicto, listo := h.repetirIdem(hallada.TenantID, idem, suma, ahora); listo {
			if conflicto {
				servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ValidacionFallida, fmt.Errorf("Idempotency-Key ya usada con otro pedido")))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write(cuerpo)
			return
		}
	}
	tn, err := h.almacen.LeerTenant(r.Context(), hallada.TenantID)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	// RetencionDias es el valor que guardó CrearTenant. Si no se puede leer el
	// tenant, no se inventa un plazo ni se crea la sesión.
	s, err := dominio.NuevaSesion(en.AsesorID, dominio.ModoAvatar(sol.ModoAvatar), ahora, tn.RetencionDias)
	if err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	// El handshake del WebSocket compara Origin contra esta lista (R55).
	// La clave secreta no trae orígenes.
	s.ClaveID = hallada.ID
	if len(hallada.Origenes) > 0 {
		s.Origenes = slices.Clone(hallada.Origenes)
	}
	if sol.AvatarID != nil {
		s.AvatarID = *sol.AvatarID
	}
	if err := h.almacen.CrearSesion(r.Context(), hallada.TenantID, s); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	valor, err := desafio.NuevoOpaco("vc_ses_")
	if err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ErrorInterno, err))
		return
	}
	vence := dominio.Instante(ahora.Add(vigenciaTokenSesion))
	tok := dominio.TokenSesion{
		Hash: claves.HMAC(h.clave.Revelar(), valor), SesionID: s.ID, EmitidoEn: s.CreadaEn, VenceEn: vence,
	}
	if err := h.almacen.GuardarTokenSesion(r.Context(), hallada.TenantID, tok); err != nil {
		servidor.EscribirError(w, r, h.log, err)
		return
	}
	// referencia_externa e idioma se validan y no se guardan: vc.sesiones no tiene esas columnas.
	cuerpo := map[string]any{
		"sesion_id": s.ID,
		"estado":    string(s.Estado),
		"token_sesion": map[string]any{
			"valor":    valor,
			"vence_en": vence.Format(time.RFC3339),
		},
		"consentimiento": map[string]any{
			"requerido":     true,
			"aviso_version": versionAviso,
			"aviso_url":     urlAviso,
		},
		"limites":   limitesProvisorios(),
		"creada_en": s.CreadaEn.Format(time.RFC3339),
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(cuerpo); err != nil {
		servidor.EscribirError(w, r, h.log, errores.Envolver(errores.ErrorInterno, err))
		return
	}
	if idem != "" {
		h.recordarIdem(hallada.TenantID, idem, sha256.Sum256(raw), buf.Bytes(), ahora)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_, _ = w.Write(buf.Bytes())
}

func cuerpoJSON(r *http.Request) bool {
	mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	return err == nil && mt == "application/json"
}

func decodificarSolicitud(raw []byte) (solicitudCrearSesion, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var s solicitudCrearSesion
	if err := dec.Decode(&s); err != nil {
		return solicitudCrearSesion{}, err
	}
	if dec.More() {
		return solicitudCrearSesion{}, errors.New("json con datos de más")
	}
	return s, nil
}

func validarSolicitud(s solicitudCrearSesion) error {
	if !reEnlace.MatchString(s.Enlace) {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("enlace: formato inválido"))
	}
	if s.ModoAvatar != string(dominio.ModoAvatar3D) && s.ModoAvatar != string(dominio.ModoAvatarClips) {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("modo_avatar: valor no permitido"))
	}
	if s.AvatarID != nil && !reAvatar.MatchString(*s.AvatarID) {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("avatar_id: formato inválido"))
	}
	if s.Idioma != nil && *s.Idioma != "es-AR" {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("idioma: valor no permitido"))
	}
	if s.ReferenciaExterna != nil && !reRefExt.MatchString(*s.ReferenciaExterna) {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("referencia_externa: formato inválido"))
	}
	return nil
}

// modoDelEnlace exige que el modo sea uno de los del avatar del enlace.
// Si ningún avatar declara modos, se aceptan 3d y clips. Un avatar_id que no
// sea de este enlace es validacion_fallida.
func modoDelEnlace(oficios []dominio.Oficio, avatarID, modo string) error {
	modos := map[string]bool{}
	if avatarID != "" {
		encontrado := false
		for _, a := range avataresDe(oficios) {
			if a.ID != avatarID {
				continue
			}
			encontrado = true
			for _, m := range a.Modos {
				modos[m] = true
			}
		}
		if !encontrado {
			return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("avatar_id no es del enlace"))
		}
	} else {
		for _, a := range avataresDe(oficios) {
			for _, m := range a.Modos {
				modos[m] = true
			}
		}
	}
	if len(modos) == 0 {
		modos["3d"] = true
		modos["clips"] = true
	}
	if !modos[modo] {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("modo_avatar fuera de los modos del avatar"))
	}
	return nil
}

func limitesProvisorios() map[string]any {
	return map[string]any{
		"sin_voz_s":                sinVozProvisorioS,
		"duracion_maxima_s":        duracionMaximaProvisoriaS,
		"caracteres_max_por_turno": caracteresMaxPorTurno,
		"turnos_llm_max":           turnosLLMMax,
		"fotograma": map[string]any{
			"formato":          "image/jpeg",
			"lado_max_px":      ladoMaxFotogramaPx,
			"bytes_max":        bytesMaxFotograma,
			"intervalo_min_ms": intervaloFotogramaMs,
			"max_por_sesion":   maxFotogramasSesion,
		},
	}
}

func claveIdem(tenant dominio.TenantID, clave string) string {
	return string(tenant) + "\n" + clave
}

func (h *enlace) repetirIdem(tenant dominio.TenantID, clave string, suma [32]byte, ahora time.Time) (cuerpo []byte, conflicto, listo bool) {
	h.idemMu.Lock()
	defer h.idemMu.Unlock()
	v, existe := h.idem[claveIdem(tenant, clave)]
	if !existe || !ahora.Before(v.vence) {
		if existe {
			delete(h.idem, claveIdem(tenant, clave))
		}
		return nil, false, false
	}
	if v.suma != suma {
		return nil, true, true
	}
	return append([]byte(nil), v.cuerpo...), false, true
}

func (h *enlace) recordarIdem(tenant dominio.TenantID, clave string, suma [32]byte, cuerpo []byte, ahora time.Time) {
	h.idemMu.Lock()
	defer h.idemMu.Unlock()
	for k, v := range h.idem {
		if !ahora.Before(v.vence) {
			delete(h.idem, k)
		}
	}
	h.idem[claveIdem(tenant, clave)] = recuerdoIdem{
		suma: suma, cuerpo: append([]byte(nil), cuerpo...), vence: ahora.Add(vigenciaIdempotencia),
	}
}
