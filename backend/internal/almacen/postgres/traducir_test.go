package postgres

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"videocotizacion/backend/internal/errores"
)

func TestTraducirErroresDePostgres(t *testing.T) {
	pg := func(code string) error {
		return fmt.Errorf("envuelto: %w", &pgconn.PgError{Code: code, Message: "detalle interno vc.tabla"})
	}
	casos := []struct {
		err  error
		cod  errores.Codigo
		nota string
	}{
		{pgx.ErrNoRows, errores.NoEncontrado, "sin filas"},
		{pg("23505"), errores.EstadoInvalido, "duplicado"},
		{pg("23503"), errores.NoEncontrado, "padre inexistente o de otro tenant"},
		{pg("23514"), errores.ValidacionFallida, "check"},
		{pg("22P02"), errores.ValidacionFallida, "texto inválido"},
		{pg("40001"), errores.ServicioNoDisponible, "serialización"},
		{pg("57014"), errores.ServicioNoDisponible, "cancelada"},
		{pg("08006"), errores.ServicioNoDisponible, "conexión"},
		{pg("53300"), errores.ServicioNoDisponible, "demasiadas conexiones"},
		{pg("42501"), errores.ErrorInterno, "RLS o privilegio: es un error del código"},
		{pg("XX000"), errores.ErrorInterno, "otro"},
		{context.DeadlineExceeded, errores.ServicioNoDisponible, "tiempo agotado"},
		{errors.New("raro"), errores.ErrorInterno, "desconocido"},
		{errores.Nuevo(errores.SesionCerrada), errores.SesionCerrada, "ya del catálogo"},
	}
	for _, c := range casos {
		got := traducir(c.err)
		if !errores.Es(got, c.cod) {
			t.Errorf("%s: %v → %s, quería %s", c.nota, c.err, errores.CodigoDe(got), c.cod)
		}
		if p := errores.ProblemaDe(got, "tr_0000000000000000"); p.Detail == "detalle interno vc.tabla" || p.Title == "detalle interno vc.tabla" {
			t.Errorf("%s: el detalle interno llegó al problema público", c.nota)
		}
	}
	if traducir(nil) != nil {
		t.Fatal("nil debe seguir siendo nil")
	}
}
