package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/almacen"
	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// BuscarDatosMedios implementa almacen.Almacen. La función SECURITY DEFINER
// devuelve la fila del id; el tenant sale de ahí, no del cliente.
func (a *Almacen) BuscarDatosMedios(ctx context.Context, id string) (almacen.DatosMedios, error) {
	if !dominio.IDValido(id, dominio.PrefijoSesion) {
		return almacen.DatosMedios{}, errores.Envolver(errores.NoEncontrado, fmt.Errorf("sesión"))
	}
	ctx, cancelar := context.WithTimeout(ctx, a.timeout)
	defer cancelar()
	filas, err := a.pool.Query(ctx, `SELECT tenant_id::text, estado, origenes, coalesce(clave_id, '')
		FROM vc.buscar_sesion_medios($1)`, id)
	if err != nil {
		return almacen.DatosMedios{}, traducir(err)
	}
	defer filas.Close()
	var out almacen.DatosMedios
	n := 0
	for filas.Next() {
		n++
		if n > 1 {
			continue
		}
		var tenant, estado string
		if err := filas.Scan(&tenant, &estado, &out.Origenes, &out.ClaveID); err != nil {
			return almacen.DatosMedios{}, traducir(err)
		}
		out.TenantID, out.Estado = dominio.TenantID(tenant), dominio.EstadoSesion(estado)
	}
	if err := filas.Err(); err != nil {
		return almacen.DatosMedios{}, traducir(err)
	}
	if n != 1 {
		return almacen.DatosMedios{}, errores.Envolver(errores.NoEncontrado, fmt.Errorf("sesión"))
	}
	if len(out.Origenes) == 0 {
		out.Origenes = nil
	}
	return out, nil
}

// ConsumirTokenMedios implementa almacen.Almacen. El UPDATE lleva el id de
// esta sesión: un HMAC de otra no cambia de estado.
func (a *Almacen) ConsumirTokenMedios(ctx context.Context, t dominio.TenantID, id string, hash []byte, ahora time.Time) error {
	if err := dominio.ExigirTenant(t); err != nil {
		return err
	}
	if len(hash) != 32 || !dominio.IDValido(id, dominio.PrefijoSesion) {
		return errores.Envolver(errores.ValidacionFallida, fmt.Errorf("token de medios"))
	}
	ahora = dominio.Instante(ahora)
	return a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE vc.tokens_sesion SET revocado_en = $4
			WHERE tenant_id = $1 AND sesion_id = $2 AND hash = $3
			  AND revocado_en IS NULL AND vence_en > $4
			  AND vence_en <= emitido_en + ($5::int * interval '1 second')`,
			string(t), id, hash, ahora, int(dominio.VigenciaTokenMedios/time.Second))
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 1 {
			return nil
		}
		return errores.Envolver(errores.CredencialInvalida, fmt.Errorf("token de medios"))
	})
}
