package postgres

import "github.com/jackc/pgx/v5/pgxpool"

// PoolDePrueba expone el pool REAL del almacén solo a las pruebas (H1 de T43).
func (a *Almacen) PoolDePrueba() *pgxpool.Pool { return a.pool }
