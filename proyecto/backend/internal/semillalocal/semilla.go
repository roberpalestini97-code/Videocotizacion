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
	ClavePublica   = "vc_pub_local_demo_clave_publica_navegador"
	EnlacePublico  = "demoLocalVideocotiz001"
	EnlacePublico2 = "demoLocalVideocotiz002"
	EnlacePublico3 = "demoLocalVideocotiz003"
	prefijoClave   = "vc_pub_loca"
	IDTenant       = dominio.TenantID("11111111-1111-4111-8111-111111111111")
	IDAsesor       = "ase_00000000000000000000000001"
	IDAsesor2      = "ase_00000000000000000000000002"
	IDAsesor3      = "ase_00000000000000000000000003"
	idClave        = "cpw_00000000000000000000000001"
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

// Sembrar crea tres profesionales demo con enlaces y clave pública fijos.
func Sembrar(ctx context.Context, a almacen.Completo, claveHMAC string, log *slog.Logger) error {
	return SembrarConOrigenes(ctx, a, claveHMAC, log, nil)
}

// SembrarConOrigenes es Sembrar con orígenes públicos extra en la clave de la
// demo (ORIGENES_PUBLICOS: el front desplegado, p. ej. en Vercel).
func SembrarConOrigenes(ctx context.Context, a almacen.Completo, claveHMAC string, log *slog.Logger, extra []string) error {
	origenes := append(append([]string(nil), origenes...), extra...)
	if claveHMAC == "" {
		return fmt.Errorf("semilla local: falta CLAVE_HMAC")
	}
	HabilitarDesarrollo()
	ahora := time.Now().UTC()
	tn := dominio.Tenant{
		ID: IDTenant, Nombre: "Demo local", SimultaneasTope: 5, SegundosMesTope: 30000,
		RetencionDias: 90, CreadoEn: ahora,
	}
	if err := a.CrearTenant(ctx, tn); err != nil {
		return fmt.Errorf("semilla local: %w", err)
	}
	demos := []struct {
		id, nombre, email, enlace string
		oficios                   []dominio.Oficio
		wa                        string
	}{
		{IDAsesor, "Laura (demo)", EmailPanelLocal, EnlacePublico, []dominio.Oficio{dominio.OficioPintura}, "+5492235550000"},
		{IDAsesor2, "Tito (demo)", EmailPanelLocal2, EnlacePublico2, []dominio.Oficio{dominio.OficioJardineria}, "+5492235550001"},
		{IDAsesor3, "Juan (demo)", EmailPanelLocal3, EnlacePublico3, []dominio.Oficio{dominio.OficioMantenimiento}, "+5492235550002"},
	}
	for _, d := range demos {
		as := dominio.Asesor{
			ID: d.id, Rol: dominio.RolAdministrar, NombreVisible: d.nombre,
			Email: d.email, WhatsApp: d.wa,
			Oficios: d.oficios, Zonas: []dominio.Zona{dominio.ZonaCobo},
			CreadoEn: ahora,
		}
		if err := a.CrearAsesor(ctx, tn.ID, as); err != nil {
			return fmt.Errorf("semilla local asesor %s: %w", d.id, err)
		}
		if err := a.GuardarEnlace(ctx, tn.ID, dominio.Enlace{
			IDPublico: d.enlace, AsesorID: as.ID, CreadoEn: ahora,
		}); err != nil {
			return fmt.Errorf("semilla local enlace %s: %w", d.enlace, err)
		}
	}
	sum := claves.HMAC(claveHMAC, ClavePublica)
	if err := a.GuardarClave(ctx, tn.ID, dominio.ClaveAPI{
		ID: idClave, Tipo: dominio.ClavePublica, Hash: sum, Prefijo: prefijoClave,
		Nombre: "demo local", Origenes: origenes, CreadaEn: ahora,
	}); err != nil {
		return fmt.Errorf("semilla local: %w", err)
	}
	if err := sembrarCredencialesPanel(ctx, a, claveHMAC); err != nil {
		return err
	}
	log.Info("semilla local lista",
		"enlaces", []string{EnlacePublico, EnlacePublico2, EnlacePublico3},
		"clave_publica", ClavePublica,
		"origenes", origenes,
		"panel_emails", []string{EmailPanelLocal, EmailPanelLocal2, EmailPanelLocal3},
	)
	return nil
}
