package semillalocal

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/claves"
	"videocotizacion/backend/internal/dominio"
)

// Datos públicos de la demo local (SEMILLA_LOCAL=1, almacén en memoria).
// No son secretos: la clave del widget es pública y el enlace va en la URL.
const (
	ClavePublica  = "vc_pub_local_demo_clave_publica_navegador"
	EnlacePublico = "demoLocalVideocotiz001"
	prefijoClave  = "vc_pub_loca"
	IDTenant      = dominio.TenantID("11111111-1111-4111-8111-111111111111")
	IDAsesor      = "ase_00000000000000000000000001"
	idClave       = "cpw_00000000000000000000000001"
)

var origenes = []string{
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://localhost:5174",
	"http://127.0.0.1:5174",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
}

// HabilitarDesarrollo permite Origin loopback en validación de claves (solo dev).
func HabilitarDesarrollo() {
	dominio.PermitirOriginLoopback(true)
}

// Sembrar crea un profesional de pintura con enlace y clave pública fijos.
func Sembrar(ctx context.Context, a almacen.Completo, claveHMAC string, log *slog.Logger) error {
	if claveHMAC == "" {
		return fmt.Errorf("semilla local: falta CLAVE_HMAC")
	}
	ahora := time.Now().UTC()
	tn := dominio.Tenant{
		ID: IDTenant, Nombre: "Demo local", SimultaneasTope: 5, SegundosMesTope: 30000,
		RetencionDias: 90, CreadoEn: ahora,
	}
	if err := a.CrearTenant(ctx, tn); err != nil {
		return fmt.Errorf("semilla local: %w", err)
	}
	as := dominio.Asesor{
		ID: IDAsesor, Rol: dominio.RolAdministrar, NombreVisible: "Laura (demo)",
		Email: "demo@videocotizacion.local", WhatsApp: "+5492235550000",
		Oficios: []dominio.Oficio{dominio.OficioPintura}, Zonas: []dominio.Zona{dominio.ZonaCobo},
		CreadoEn: ahora,
	}
	if err := a.CrearAsesor(ctx, tn.ID, as); err != nil {
		return fmt.Errorf("semilla local: %w", err)
	}
	sum := claves.HMAC(claveHMAC, ClavePublica)
	if err := a.GuardarClave(ctx, tn.ID, dominio.ClaveAPI{
		ID: idClave, Tipo: dominio.ClavePublica, Hash: sum, Prefijo: prefijoClave,
		Nombre: "demo local", Origenes: append([]string(nil), origenes...), CreadaEn: ahora,
	}); err != nil {
		return fmt.Errorf("semilla local: %w", err)
	}
	if err := a.GuardarEnlace(ctx, tn.ID, dominio.Enlace{
		IDPublico: EnlacePublico, AsesorID: as.ID, CreadoEn: ahora,
	}); err != nil {
		return fmt.Errorf("semilla local: %w", err)
	}
	log.Info("semilla local lista",
		"enlace", EnlacePublico,
		"clave_publica", ClavePublica,
		"origenes", origenes,
	)
	return nil
}
