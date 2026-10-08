#!/bin/sh
# Inicialización de roles y base de VideoCotización (ADR 0004, puntos 3 y 6).
#
# Corre una sola vez, cuando el volumen de datos está vacío (imagen oficial de postgres), como superusuario.
# Es idempotente: se puede volver a correr a mano para rotar las contraseñas de los roles.
#
#   vc_dueno : dueño de la base, del esquema y de las tablas. Solo lo usa `api migrar`.
#              NOSUPERUSER, NOBYPASSRLS. Nunca lo usa la API en ejecución.
#   vc_api   : rol de la API. NOSUPERUSER, NOBYPASSRLS, no es dueño de nada.
#              Sin privilegios por defecto: cada migración debe hacer GRANT por tabla (mínimo necesario).
#              Si una migración olvida el GRANT, la API falla cerrada con "permission denied".
#
# Variables de entorno requeridas: POSTGRES_USER (superusuario), VC_DUENO_PASSWORD, VC_API_PASSWORD.
# Opcionales: VC_DB_NAME (por defecto videocotizacion).
# Las contraseñas entran por entorno y se leen con \getenv: no aparecen en la línea de comandos.
set -eu

: "${POSTGRES_USER:?falta POSTGRES_USER}"
: "${VC_DUENO_PASSWORD:?falta VC_DUENO_PASSWORD}"
: "${VC_API_PASSWORD:?falta VC_API_PASSWORD}"
VC_DB_NAME="${VC_DB_NAME:-videocotizacion}"
export VC_DB_NAME

# --- 1) Roles y base (conectado a la base de mantenimiento "postgres") ---
psql -q -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname postgres <<'SQL'
-- Que la contraseña no quede en el log ni siquiera si falla la sentencia.
SET log_statement = 'none';
SET log_min_error_statement = 'panic';

\getenv dueno_pw VC_DUENO_PASSWORD
\getenv api_pw   VC_API_PASSWORD
\getenv db_name  VC_DB_NAME

-- Rol dueño de migraciones (se crea si no existe; la contraseña se fija siempre).
SELECT 'CREATE ROLE vc_dueno LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vc_dueno') \gexec
ALTER ROLE vc_dueno LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 5 PASSWORD :'dueno_pw';

-- Rol de la API: sin BYPASSRLS, sin superusuario, sin creación de objetos.
SELECT 'CREATE ROLE vc_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vc_api') \gexec
ALTER ROLE vc_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 30 PASSWORD :'api_pw';
-- Topes por rol contra consultas colgadas y transacciones abiertas (valores iniciales, a ajustar con datos reales).
ALTER ROLE vc_api SET statement_timeout = '15s';
ALTER ROLE vc_api SET lock_timeout = '5s';
ALTER ROLE vc_api SET idle_in_transaction_session_timeout = '30s';

-- La base pertenece al dueño de migraciones, no al superusuario.
SELECT format('CREATE DATABASE %I OWNER vc_dueno ENCODING ''UTF8'' TEMPLATE template0', :'db_name')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec
SELECT format('ALTER DATABASE %I OWNER TO vc_dueno', :'db_name') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db_name') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO vc_api', :'db_name') \gexec
SELECT format('GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO vc_dueno', :'db_name') \gexec
SQL

# --- 2) Esquema y verificación final (conectado a la base de la aplicación) ---
psql -q -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$VC_DB_NAME" <<'SQL'
-- El esquema public pasa a ser del dueño; PUBLIC no puede usarlo ni crear en él. La API solo puede usarlo.
ALTER SCHEMA public OWNER TO vc_dueno;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO vc_dueno;
GRANT USAGE ON SCHEMA public TO vc_api;

-- Verificación: si algo quedó mal, la inicialización falla y el contenedor no queda "sano".
DO $verificar$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles
              WHERE rolname IN ('vc_api', 'vc_dueno')
                AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
    RAISE EXCEPTION 'vc_api o vc_dueno tienen atributos privilegiados (SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION)';
  END IF;
  IF has_schema_privilege('vc_api', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'vc_api puede crear objetos en public';
  END IF;
  IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) <> 'vc_dueno' THEN
    RAISE EXCEPTION 'la base no pertenece a vc_dueno';
  END IF;
END
$verificar$;
SQL

echo "01-roles.sh: roles vc_dueno y vc_api listos en la base ${VC_DB_NAME}"
