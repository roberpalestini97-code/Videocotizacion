#!/bin/sh
# Prueba de los roles de PostgreSQL contra un servidor REAL (ADR 0004: verificación de roles y RLS).
# Corre postgres/init/01-roles.sh y después comprueba, conectándose como cada rol, que:
#   - vc_api no es superusuario ni tiene BYPASSRLS, y no puede crear ni alterar tablas;
#   - vc_dueno (dueño) crea una tabla con RLS + FORCE y vc_api solo ve las filas de su tenant;
#   - sin app.tenant_id no hay filas ni se puede insertar (falla cerrada), y el tenant no se arrastra
#     entre transacciones de la misma conexión (SET LOCAL);
#   - el script de inicialización es idempotente.
#
# Uso (contra cualquier PostgreSQL 16 donde seas superusuario):
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=... sh scripts/probar-roles.sh
# Usa una base de prueba propia (vc_prueba_roles) y la borra al terminar. Requiere cliente psql >= 15.
set -eu

: "${PGUSER:?falta PGUSER (superusuario)}"
AQUI=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
INIT="$AQUI/../postgres/init/01-roles.sh"
BASE=vc_prueba_roles
SU_PASSWORD="${PGPASSWORD:-}"
# Contraseñas efímeras de prueba (no se reutilizan en ningún entorno real).
DUENO_PW=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
API_PW=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')

fallas=0
ok()    { printf 'OK     %s\n' "$1"; }
falla() { printf 'FALLA  %s\n' "$1"; fallas=$((fallas + 1)); }

su()   { PGPASSWORD="$SU_PASSWORD" psql -X -q -v ON_ERROR_STOP=1 -U "$PGUSER" "$@"; }
como() { # como <rol> <password> <psql args...>
  rol=$1; pw=$2; shift 2
  PGPASSWORD="$pw" psql -X -q -v ON_ERROR_STOP=1 -U "$rol" -d "$BASE" "$@"
}
# espera_error <descripción> <rol> <pw> <sql>: pasa si el SQL FALLA
# Pasa SOLO si el servidor respondió con un ERROR de SQL: un fallo de conexión no cuenta como "falló como se esperaba".
espera_error() {
  desc=$1; rol=$2; pw=$3; sql=$4
  if salida=$(como "$rol" "$pw" -c "$sql" 2>&1); then
    falla "$desc (debía fallar y funcionó)"
  elif printf '%s' "$salida" | grep -q '^ERROR:'; then
    ok "$desc"
  else
    falla "$desc (falló pero no por un error de SQL: $salida)"
  fi
}
# espera_valor <descripción> <rol> <pw> <esperado> <args de psql, p. ej. -c "SQL">: compara la salida (sesión única si hay varios -c)
espera_valor() {
  desc=$1; rol=$2; pw=$3; esperado=$4; shift 4
  salida=$(como "$rol" "$pw" -At "$@" 2>&1 | tr '\n' ' ' | sed 's/ *$//') || true
  if [ "$salida" = "$esperado" ]; then ok "$desc"; else falla "$desc (esperado '$esperado', obtuvo '$salida')"; fi
}

# Preflight: sin superusuario que conecte, nada de lo que sigue tiene sentido.
if ! su -d postgres -c "SELECT 1" >/dev/null 2>&1; then
  echo "No se pudo conectar como superusuario ($PGUSER) a ${PGHOST:-socket local}:${PGPORT:-5432}" >&2
  exit 2
fi

limpiar() {
  su -d postgres -c "DROP DATABASE IF EXISTS $BASE" >/dev/null 2>&1 || true
  su -d postgres -c "DROP ROLE IF EXISTS vc_api" >/dev/null 2>&1 || true
  su -d postgres -c "DROP ROLE IF EXISTS vc_dueno" >/dev/null 2>&1 || true
}
trap limpiar EXIT
limpiar

# --- Inicialización (dos veces: idempotencia) ---
export POSTGRES_USER="$PGUSER" VC_DUENO_PASSWORD="$DUENO_PW" VC_API_PASSWORD="$API_PW" VC_DB_NAME="$BASE"
if sh "$INIT" >/dev/null 2>&1; then ok "01-roles.sh corre desde cero"; else falla "01-roles.sh falló desde cero"; sh "$INIT" || true; fi
if sh "$INIT" >/dev/null 2>&1; then ok "01-roles.sh es idempotente (segunda corrida)"; else falla "01-roles.sh falló en la segunda corrida"; fi

# --- Atributos de los roles ---
espera_valor "vc_api: sin SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION" vc_api "$API_PW" "f|f|f|f|f" \
  -c "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication FROM pg_roles WHERE rolname = 'vc_api'" || true
espera_valor "vc_dueno: sin SUPERUSER ni BYPASSRLS" vc_dueno "$DUENO_PW" "f|f" \
  -c "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'vc_dueno'" || true
espera_valor "la base pertenece a vc_dueno" vc_dueno "$DUENO_PW" "vc_dueno" \
  -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()" || true
espera_valor "PUBLIC no puede conectarse a la base (solo roles con GRANT)" vc_api "$API_PW" "t" \
  -c "SELECT has_database_privilege('vc_api', current_database(), 'CONNECT')" || true

# --- La API no puede tocar el esquema ---
espera_error "vc_api no puede crear tablas en public" vc_api "$API_PW" "CREATE TABLE intruso (x int)"
espera_error "vc_api no puede crear esquemas" vc_api "$API_PW" "CREATE SCHEMA intruso"
espera_error "vc_api no puede cambiarse de rol a vc_dueno" vc_api "$API_PW" "SET ROLE vc_dueno"
espera_error "vc_api no puede crear roles" vc_api "$API_PW" "CREATE ROLE otro"

# --- Migración del dueño: tabla con RLS + FORCE y GRANT mínimo ---
if como vc_dueno "$DUENO_PW" >/dev/null 2>&1 <<'SQL'
CREATE TABLE prueba_rls (
  tenant_id uuid NOT NULL,
  dato text NOT NULL
);
ALTER TABLE prueba_rls ENABLE ROW LEVEL SECURITY;
ALTER TABLE prueba_rls FORCE ROW LEVEL SECURITY;
-- NULLIF: con el parámetro vacío (queda así tras un SET LOCAL ya cerrado) devuelve NULL en vez de error de uuid.
CREATE POLICY aislamiento ON prueba_rls
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON prueba_rls TO vc_api;
SQL
then ok "vc_dueno crea tabla con RLS + FORCE y GRANT mínimo"; else falla "vc_dueno no pudo crear la tabla de prueba"; fi

espera_valor "toda tabla con tenant_id tiene RLS y FORCE" vc_api "$API_PW" "" \
  -c "SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' WHERE c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)" || true
espera_error "vc_api no puede desactivar RLS (no es dueño)" vc_api "$API_PW" "ALTER TABLE prueba_rls DISABLE ROW LEVEL SECURITY"
espera_error "vc_api no puede borrar la tabla" vc_api "$API_PW" "DROP TABLE prueba_rls"
espera_error "vc_api no tiene DELETE (no se le concedió)" vc_api "$API_PW" "DELETE FROM prueba_rls"

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222

espera_valor "sin app.tenant_id: SELECT devuelve 0 filas" vc_api "$API_PW" "0" -c "SELECT count(*) FROM prueba_rls" || true
espera_error "sin app.tenant_id: INSERT falla (falla cerrada)" vc_api "$API_PW" "INSERT INTO prueba_rls VALUES ('$A', 'x')"

if como vc_api "$API_PW" -c "BEGIN; SELECT set_config('app.tenant_id', '$A', true); INSERT INTO prueba_rls VALUES ('$A', 'dato de A'); COMMIT" >/dev/null 2>&1
then ok "con tenant A: INSERT de A permitido"; else falla "con tenant A no se pudo insertar"; fi
if como vc_api "$API_PW" -c "BEGIN; SELECT set_config('app.tenant_id', '$B', true); INSERT INTO prueba_rls VALUES ('$B', 'dato de B'); COMMIT" >/dev/null 2>&1
then ok "con tenant B: INSERT de B permitido"; else falla "con tenant B no se pudo insertar"; fi
espera_error "con tenant B: INSERT con tenant_id de A falla (WITH CHECK)" vc_api "$API_PW" \
  "BEGIN; SELECT set_config('app.tenant_id', '$B', true); INSERT INTO prueba_rls VALUES ('$A', 'cruzado'); COMMIT"

espera_valor "con tenant A: solo ve 'dato de A'" vc_api "$API_PW" "dato de A" \
  -c "SET app.tenant_id = '$A'" -c "SELECT dato FROM prueba_rls" || true
espera_valor "con tenant B: solo ve 'dato de B'" vc_api "$API_PW" "dato de B" \
  -c "SET app.tenant_id = '$B'" -c "SELECT dato FROM prueba_rls" || true

# El tenant no debe arrastrarse a la transacción siguiente de la MISMA conexión (pool de conexiones).
salida=$(como vc_api "$API_PW" -At <<SQL 2>&1 | tr '\n' ' ' | sed 's/ *$//' || true
BEGIN;
SELECT set_config('app.tenant_id', '$A', true) \\g /dev/null
COMMIT;
SELECT count(*) FROM prueba_rls;
SQL
)
if [ "$salida" = "0" ]; then ok "el tenant no se arrastra a la transacción siguiente (SET LOCAL)"; else falla "tenant arrastrado entre transacciones (obtuvo '$salida')"; fi

# FORCE RLS: ni el dueño ve filas sin tenant (error amplio 1 de criterios.md).
espera_valor "FORCE RLS: el dueño sin app.tenant_id también ve 0 filas" vc_dueno "$DUENO_PW" "0" -c "SELECT count(*) FROM prueba_rls" || true

printf '\n'
if [ "$fallas" -eq 0 ]; then printf 'probar-roles: TODO OK\n'; else printf 'probar-roles: %s FALLAS\n' "$fallas"; exit 1; fi
