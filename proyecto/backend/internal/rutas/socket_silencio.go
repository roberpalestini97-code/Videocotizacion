package rutas

import (
	"context"
	"sync"
	"time"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/turno"
)

// vigilante corta la sesión si el cliente no manda nada durante sin_voz_s
// (eventos-sesion.md §2): a los 2/3 del plazo manda sesion.aviso
// sin_voz_proximo y al vencer cierra con sin_voz y la derivación. Con la voz
// en el navegador, "voz detectada" es cualquier mensaje del cliente. El reloj
// se pausa mientras se procesa un turno. Un vigilante nil no hace nada.
type vigilante struct {
	mu            sync.Mutex
	aviso, cierre *time.Timer
	plazo         time.Duration
	parado        bool
}

func (h *enlace) plazoSinVoz() time.Duration {
	if h.sinVoz > 0 {
		return h.sinVoz
	}
	return sinVozProvisorioS * time.Second
}

func (h *enlace) vigilarSilencio(ctx context.Context, c *canalMedios, tenant dominio.TenantID, sesionID string) *vigilante {
	v := &vigilante{plazo: h.plazoSinVoz()}
	restantes := int((v.plazo - v.plazo*2/3) / time.Second)
	v.aviso = time.AfterFunc(v.plazo*2/3, func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.terminado || time.Since(c.actividad) < v.plazo*2/3 {
			return // hubo un mensaje mientras el temporizador ya había disparado
		}
		c.escribir(ctx, [][]byte{eventoServidor("sesion.aviso", siguienteSeq(&c.seq), map[string]any{
			"aviso": "sin_voz_proximo", "segundos_restantes": restantes,
		})})
	})
	v.cierre = time.AfterFunc(v.plazo, func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.terminado || time.Since(c.actividad) < v.plazo {
			return
		}
		c.terminado = true
		ses, err := h.almacen.LeerSesion(ctx, tenant, sesionID)
		if err == nil {
			n, _ := h.reservarTurno(sesionID, 0)
			res := h.cerrarConPlantilla(ctx, tenant, ses, n, turno.FraseSinVoz,
				turno.CierreTurno{Motivo: dominio.MotivoSinVoz, Causa: turno.CausaSinVoz}, &c.seq)
			c.escribir(ctx, res.msgs)
		}
		cerrarMedios(c.conn, 1000, "sin_voz")
	})
	return v
}

func (v *vigilante) pausar() {
	if v == nil {
		return
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	v.aviso.Stop()
	v.cierre.Stop()
}

func (v *vigilante) reanudar() {
	if v == nil {
		return
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.parado {
		return
	}
	v.aviso.Reset(v.plazo * 2 / 3)
	v.cierre.Reset(v.plazo)
}

func (v *vigilante) parar() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.parado = true
	v.aviso.Stop()
	v.cierre.Stop()
}
