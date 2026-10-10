package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"videocotizacion/backend/internal/dominio"
	"videocotizacion/backend/internal/errores"
)

// marchaSesion vive en el proceso: no hay columna de inicio ni de última voz.
// El inicio, si el proceso se reinició, sale del primer token de medios.
type marchaSesion struct {
	enCursoEn time.Time
	ultimaVoz time.Time
}

func claveMarcha(t dominio.TenantID, id string) string {
	return string(t) + "\n" + id
}

func (a *Almacen) anotarEnCurso(t dominio.TenantID, id string, ahora time.Time) {
	a.marchasMu.Lock()
	defer a.marchasMu.Unlock()
	if a.marchas == nil {
		a.marchas = map[string]marchaSesion{}
	}
	k := claveMarcha(t, id)
	m := a.marchas[k]
	if m.enCursoEn.IsZero() {
		m.enCursoEn = dominio.Instante(ahora)
	}
	a.marchas[k] = m
}

func (a *Almacen) anotarVoz(t dominio.TenantID, id string, ahora time.Time) {
	a.marchasMu.Lock()
	defer a.marchasMu.Unlock()
	if a.marchas == nil {
		a.marchas = map[string]marchaSesion{}
	}
	k := claveMarcha(t, id)
	m := a.marchas[k]
	m.ultimaVoz = dominio.Instante(ahora)
	a.marchas[k] = m
}

func (a *Almacen) marchaDe(t dominio.TenantID, id string) marchaSesion {
	a.marchasMu.Lock()
	defer a.marchasMu.Unlock()
	if a.marchas == nil {
		return marchaSesion{}
	}
	return a.marchas[claveMarcha(t, id)]
}

// MarcarVoz implementa almacen.Almacen. La marca queda en memoria del proceso:
// la tabla no tiene esa columna. No llama proveedores.
func (a *Almacen) MarcarVoz(ctx context.Context, t dominio.TenantID, id string, ahora time.Time) error {
	var estado dominio.EstadoSesion
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		s, err := escanearSesion(tx.QueryRow(ctx, `SELECT `+columnasSesion+`
			FROM vc.sesiones WHERE tenant_id = $1 AND sesion_id = $2`, string(t), id))
		if err != nil {
			return err
		}
		estado = s.Estado
		return nil
	})
	if err != nil {
		return err
	}
	if estado != dominio.EstadoEnCurso {
		return errores.Envolver(errores.EstadoInvalido, fmt.Errorf("marcar voz en %s", estado))
	}
	a.anotarVoz(t, id, ahora)
	return nil
}

// BarrerLimites implementa almacen.Almacen. Lista las en_curso dentro de la
// transacción del tenant y escribe estado, motivo_cierre, cerrada_en y
// duracion_s con las columnas que ya existen. No llama proveedores.
func (a *Almacen) BarrerLimites(ctx context.Context, t dominio.TenantID, ahora time.Time, sinVozS, duracionMaxS int) (int, error) {
	var n int
	err := a.enTenant(ctx, t, func(ctx context.Context, tx pgx.Tx) error {
		filas, err := tx.Query(ctx, `SELECT `+columnasSesion+`
			FROM vc.sesiones WHERE tenant_id = $1 AND estado = $2
			ORDER BY sesion_id FOR UPDATE`, string(t), string(dominio.EstadoEnCurso))
		if err != nil {
			return err
		}
		var lista []dominio.Sesion
		for filas.Next() {
			s, err := escanearSesion(filas)
			if err != nil {
				filas.Close()
				return err
			}
			lista = append(lista, s)
		}
		if err := filas.Err(); err != nil {
			filas.Close()
			return err
		}
		filas.Close()
		for _, s := range lista {
			m := a.marchaDe(t, s.ID)
			inicio := m.enCursoEn
			if inicio.IsZero() {
				inicio, err = inicioDeMedios(ctx, tx, t, s.ID)
				if err != nil {
					return err
				}
			}
			motivo, ok := dominio.MotivoDeLimites(inicio, m.ultimaVoz, ahora, sinVozS, duracionMaxS)
			if !ok {
				continue
			}
			if err := s.Cerrar(motivo, ahora); err != nil {
				return err
			}
			if err := actualizarSesion(ctx, tx, t, s); err != nil {
				return err
			}
			if err := revocarTokensMedios(ctx, tx, t, s.ID, ahora); err != nil {
				return err
			}
			n++
		}
		return nil
	})
	return n, err
}

// inicioDeMedios es el primer token de medios: es el instante en que la
// sesión pasó a en_curso. No usa una columna nueva.
func inicioDeMedios(ctx context.Context, tx pgx.Tx, t dominio.TenantID, id string) (time.Time, error) {
	var inicio *time.Time
	err := tx.QueryRow(ctx, `SELECT min(emitido_en) FROM vc.tokens_sesion
		WHERE tenant_id = $1 AND sesion_id = $2
		  AND vence_en <= emitido_en + ($3::int * interval '1 second')`,
		string(t), id, int(dominio.VigenciaTokenMedios/time.Second)).Scan(&inicio)
	if err != nil || inicio == nil {
		return time.Time{}, err
	}
	return inicio.UTC(), nil
}
