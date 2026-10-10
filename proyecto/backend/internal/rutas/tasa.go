package rutas

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/errores"
)

const (
	// topeCrearSesion es provisorio: el contrato no fija la cifra de R58.
	topeCrearSesion = 10
	// ventanaCrearSesion es el minuto de cada eje (IP, clave pública, enlace).
	ventanaCrearSesion = time.Minute
)

// ventanaTasa cuenta pedidos de crearSesion en el proceso. No se persiste.
type ventanaTasa struct {
	inicio time.Time
	n      int
}

// limitarCrearSesion aplica R58 antes de la credencial, del desafío y de crear
// la sesión. Cada eje se cuenta aparte. Un cuerpo ilegible no suma el enlace.
// No loguea la clave pública: el eje usa el HMAC.
func (h *enlace) limitarCrearSesion(r *http.Request) error {
	ejes := []string{"ip:" + ipDelPedido(r)}
	if pub := r.Header.Get("X-VC-Clave-Publica"); pub != "" {
		if sum := claves.HMAC(h.clave.Revelar(), pub); len(sum) == 32 {
			ejes = append(ejes, "clave:"+hex.EncodeToString(sum))
		}
	}
	if id, ok := enlaceDelCuerpo(r); ok {
		ejes = append(ejes, "enlace:"+id)
	}
	espera, lleno := h.tomarTasa(ejes, h.ahoraDePanel())
	if !lleno {
		return nil
	}
	return errores.Nuevo(errores.LimiteDeTasa).ConEspera(espera)
}

func (h *enlace) tomarTasa(ejes []string, ahora time.Time) (espera int, lleno bool) {
	h.tasasMu.Lock()
	defer h.tasasMu.Unlock()
	for _, eje := range ejes {
		if e, ok := h.cupoTasa(eje, ahora); ok {
			return e, true
		}
	}
	for _, eje := range ejes {
		h.sumarTasa(eje, ahora)
	}
	return 0, false
}

func (h *enlace) cupoTasa(eje string, ahora time.Time) (int, bool) {
	v, ok := h.tasas[eje]
	if !ok || !ahora.Before(v.inicio.Add(ventanaCrearSesion)) {
		return 0, false
	}
	if v.n < topeCrearSesion {
		return 0, false
	}
	resto := v.inicio.Add(ventanaCrearSesion).Sub(ahora)
	segs := int((resto + time.Second - 1) / time.Second)
	if segs < 1 {
		segs = 1
	}
	return segs, true
}

func (h *enlace) sumarTasa(eje string, ahora time.Time) {
	v := h.tasas[eje]
	if v.inicio.IsZero() || !ahora.Before(v.inicio.Add(ventanaCrearSesion)) {
		v = ventanaTasa{inicio: ahora}
	}
	v.n++
	h.tasas[eje] = v
}

// enlaceDelCuerpo deja el cuerpo para el resto de la ruta. Si no se puede
// leer o no trae un id_publico de 22 caracteres, no suma el eje.
func enlaceDelCuerpo(r *http.Request) (string, bool) {
	if r.Body == nil {
		return "", false
	}
	raw, err := io.ReadAll(r.Body)
	r.Body = io.NopCloser(bytes.NewReader(raw))
	if err != nil {
		return "", false
	}
	var s struct {
		Enlace string `json:"enlace"`
	}
	if json.Unmarshal(raw, &s) != nil {
		return "", false
	}
	if !reEnlace.MatchString(s.Enlace) {
		return "", false
	}
	return s.Enlace, true
}
